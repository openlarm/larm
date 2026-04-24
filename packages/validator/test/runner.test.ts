import { describe, it, expect, beforeAll } from "vitest"
import { registerParams } from "@openlarm/core"
import { TAIWAN_PARAMS_V1_0, TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"
import { runValidation } from "../src/runner.ts"
import type { ValidationCase } from "../src/types.ts"

beforeAll(() => {
  // Ensure core has Taiwan params registered before evaluateRisk runs.
  registerParams("v1.0", TAIWAN_PARAMS_V1_0)
  registerParams("v2.0", TAIWAN_PARAMS_V2_0)
})

// Shared benign baseline — produces a GO decision under default Taiwan params.
const benignInput = {
  weather_30d: {
    wind_mean_kmh: 8,
    wind_p90_kmh: 18,
    gust_p90_kmh: null,
    rain_days_30: 3,
    heavy_rain_days_30: 0,
    instability_index: 0.2,
    predictability_score: 0.85,
  },
  weather_today: {
    wind_now_kmh: 8,
    gust_now_kmh: null,
    rain_prob_today_pct: 5,
    rain_mmph_forecast: 0,
    thunder_risk: 0 as const,
    forecast_confidence: 90,
  },
  building: {
    site_altitude_m: 20,
    building_floors: 5,
    building_height_m: 18,
    facade_complexity: "light" as const,
    clearance_m: 10,
    near_hv_power: 0 as const,
    near_base_station: 0 as const,
    wind_channel_effect: 0 as const,
    rooftop_condition: null,
    crowd_density: null,
    region_exposure: null,
  },
  operational: {
    time_window: "day" as const,
    weekend: 0 as const,
    urgent_days: null,
    road_closure_needed: 0 as const,
    multi_day_split: null,
    operator_experience_level: null,
  },
  equipment: [],
}

const benignCase = (id: string, completed: boolean, incident = false): ValidationCase => ({
  id,
  input: benignInput,
  actual_outcome: {
    completed,
    completion_pct: completed ? 100 : 0,
    decision_taken: completed ? "GO" : "NO_GO",
    incident,
  },
})

// Hard-stop input (wind ≥ 39 km/h forces NO_GO).
const hardStopWindCase = (id: string, completed: boolean): ValidationCase => ({
  id,
  input: {
    ...benignInput,
    weather_today: { ...benignInput.weather_today, wind_now_kmh: 42 },
  },
  actual_outcome: {
    completed,
    completion_pct: completed ? 100 : 0,
    decision_taken: completed ? "GO" : "NO_GO",
    incident: false,
  },
})

describe("runValidation", () => {
  it("handles an empty case list without crashing", () => {
    const r = runValidation([])
    expect(r.meta.total_cases).toBe(0)
    expect(r.overall_accuracy).toBe(0)
    expect(r.decision_confusion).toEqual([])
    expect(r.calibration).toEqual([])
  })

  it("counts a single correctly-predicted GO", () => {
    const r = runValidation([benignCase("c1", true)])
    expect(r.meta.total_cases).toBe(1)
    expect(r.overall_accuracy).toBe(1)
    expect(r.go_then_bad).toEqual([])
    expect(r.nogo_then_ok).toEqual([])
  })

  it("flags a GO-then-incident as a dangerous false positive", () => {
    const r = runValidation([benignCase("c1", false, true)])
    expect(r.go_then_bad).toHaveLength(1)
    expect(r.go_then_bad[0]?.case_id).toBe("c1")
    expect(r.go_then_bad[0]?.incident).toBe(true)
    expect(r.overall_accuracy).toBe(0)
  })

  it("counts wind hard-stop NO_GO correctly", () => {
    const r = runValidation([hardStopWindCase("wind1", false)])
    expect(r.hard_stops.wind).toBe(1)
    expect(r.hard_stops.total).toBe(1)
    expect(r.overall_accuracy).toBe(1) // NO_GO + aborted is correct
  })

  it("flags NO_GO-then-OK as over-conservative", () => {
    // Operator flew despite LARM NO_GO and completed cleanly.
    const r = runValidation([hardStopWindCase("wind2", true)])
    expect(r.nogo_then_ok).toHaveLength(1)
    expect(r.nogo_then_ok[0]?.case_id).toBe("wind2")
  })

  it("aggregates W-code slices", () => {
    const r = runValidation([
      benignCase("a", true),
      benignCase("b", true),
      benignCase("c", true),
    ])
    // All three should fall into W0 given the benign baseline.
    expect(r.w_code_slices).toHaveLength(1)
    expect(r.w_code_slices[0]?.w_code).toBe("W0")
    expect(r.w_code_slices[0]?.count).toBe(3)
  })

  it("computes R-level calibration delta", () => {
    // GOs that completed → actual_completion_pct_mean = 100, predicted (R0) = 97,
    // delta = -3 (under-optimistic by 3%).
    const r = runValidation([benignCase("a", true), benignCase("b", true)])
    expect(r.calibration).toHaveLength(1)
    const cal = r.calibration[0]!
    expect(cal.r_level).toMatch(/R[01]/)
    expect(cal.count).toBe(2)
    expect(cal.actual_completion_pct_mean).toBe(100)
  })

  it("records date range from cases with dates", () => {
    const withDates: ValidationCase[] = [
      { ...benignCase("a", true), date: "2025-01-10" },
      { ...benignCase("b", true), date: "2025-03-15" },
      { ...benignCase("c", true), date: "2025-02-01" },
    ]
    const r = runValidation(withDates)
    expect(r.meta.date_range.start).toBe("2025-01-10")
    expect(r.meta.date_range.end).toBe("2025-03-15")
  })

  it("fills LARM/params version from the first evaluation", () => {
    const r = runValidation([benignCase("a", true)])
    expect(r.meta.larm_version).toBe("v2.0")
    expect(r.meta.params_version).toBe("v2.0")
  })
})
