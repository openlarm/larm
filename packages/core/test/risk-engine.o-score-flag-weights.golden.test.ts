// Golden tests for v2.1 o_score per-flag weight param-ization
// (parallel to env-hazards RFC Recommendation A).
//
// Two scenarios:
//   (a) defaults preserve v2.0 baseline behaviour
//   (b) override raises o_score contribution by the expected delta

import "./setup-taiwan.ts"

import { describe, it, expect } from "vitest"
import { evaluateRisk, resolveParams } from "../src/index.ts"
import type { LARMInput } from "../src/index.ts"

const benignInput: LARMInput = {
  weather_30d: {
    wind_mean_kmh: 8, wind_p90_kmh: 20, gust_p90_kmh: null,
    rain_days_30: 3, heavy_rain_days_30: 0,
    instability_index: 0.2, predictability_score: 0.85,
  },
  weather_today: {
    wind_now_kmh: 5, gust_now_kmh: null,
    rain_prob_today_pct: 10, rain_mmph_forecast: 0,
    thunder_risk: 0, forecast_confidence: 80,
  },
  building: {
    site_altitude_m: 15, building_floors: 5, building_height_m: 18,
    facade_complexity: "light", clearance_m: 3,
    near_hv_power: 0, near_base_station: 0, wind_channel_effect: 0,
    rooftop_condition: "good", crowd_density: "medium", region_exposure: null,
  },
  operational: {
    time_window: "night", weekend: 1, urgent_days: null,
    road_closure_needed: 0, multi_day_split: 0, operator_experience_level: null,
  },
}

describe("evaluateRisk — v2.1 o_score flag-weight defaults preserve v2.0", () => {
  it("with default params, night+weekend+crowd_medium yields o_score=9", () => {
    const r = evaluateRisk(benignInput)
    // night=5 + weekend=2 + crowd_medium=2 = 9; cap=12 not hit
    expect(r.o_score).toBe(9)
    const opsExplanation = r.explanations.find((e) => e.factor === "作業情境")
    expect(opsExplanation).toBeDefined()
    expect(opsExplanation!.note).toContain("上限 12")
    expect(opsExplanation!.value).toContain("夜間+5")
    expect(opsExplanation!.value).toContain("週末+2")
    expect(opsExplanation!.value).toContain("中人流+2")
  })

  it("urgent_days threshold defaults match v2.0 hardcoded behaviour", () => {
    const inputUrgent3 = {
      ...benignInput,
      operational: { ...benignInput.operational!, urgent_days: 3 },
    }
    const inputUrgent7 = {
      ...benignInput,
      operational: { ...benignInput.operational!, urgent_days: 7 },
    }
    const inputUrgent8 = {
      ...benignInput,
      operational: { ...benignInput.operational!, urgent_days: 8 },
    }
    // urgent <= 3 → urgent_critical=5; total = 5+2+2+5 = 14 → cap 12
    expect(evaluateRisk(inputUrgent3).o_score).toBe(12)
    // urgent in (3, 7] → urgent_warn=3; total = 5+2+2+3 = 12
    expect(evaluateRisk(inputUrgent7).o_score).toBe(12)
    // urgent > 7 → 0; total = 5+2+2 = 9
    expect(evaluateRisk(inputUrgent8).o_score).toBe(9)
  })
})

describe("evaluateRisk — v2.1 o_score flag-weight override raises score", () => {
  it("with weekend points 2→5, o_score rises by exactly +3", () => {
    const baseParams = resolveParams("v2.0")!
    const overridden = resolveParams("v2.0", {
      o_score_flag_points: {
        ...baseParams.o_score_flag_points,
        weekend: 5,
      },
    })!

    // Use a weekend-only input so other flags don't saturate the cap.
    const weekendOnly: LARMInput = {
      ...benignInput,
      building: { ...benignInput.building, crowd_density: "low" },
      operational: {
        time_window: "day", weekend: 1, urgent_days: null,
        road_closure_needed: 0, multi_day_split: 0, operator_experience_level: null,
      },
    }

    const baseline = evaluateRisk(weekendOnly)
    const raised = evaluateRisk(weekendOnly, { params: overridden })

    // baseline: weekend=2, total=2
    // raised:   weekend=5, total=5
    expect(baseline.o_score).toBe(2)
    expect(raised.o_score).toBe(5)
    expect(raised.o_score - baseline.o_score).toBe(3)
  })
})
