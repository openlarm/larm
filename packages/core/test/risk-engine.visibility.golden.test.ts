// Golden tests for v2.1 candidate visibility_m integration (Unreleased).
//
// Two channels tested:
//   1) §7.1(4) VLOS hard-stop gate — visibility_m < visibility_m_min ⇒ NO_GO.
//   2) §5.7 tier adder — piecewise adder applied to risk_score, capped at max_adj.
//
// Mirrors TV-017 (null fallback), TV-018 (marginal binding), TV-019 (gate).

import "./setup-taiwan.ts"

import { describe, it, expect } from "vitest"
import {
  evaluateRisk,
  resolveParams,
  visibilityTierAdj,
  visibilityForcesNoGo,
} from "../src/index.ts"
import type { LARMInput, WeatherTodayInput } from "../src/index.ts"

const baseToday: WeatherTodayInput = {
  wind_now_kmh: 18,
  gust_now_kmh: null,
  rain_prob_today_pct: 30,
  rain_mmph_forecast: 0,
  thunder_risk: 0,
  forecast_confidence: 80,
}

const baseInput: LARMInput = {
  weather_30d: {
    wind_mean_kmh: 8,
    wind_p90_kmh: 20,
    gust_p90_kmh: null,
    rain_days_30: 3,
    heavy_rain_days_30: 0,
    instability_index: 0.10,
    predictability_score: 0.85,
  },
  weather_today: baseToday,
  building: {
    site_altitude_m: 15,
    building_floors: 5,
    building_height_m: 18,
    facade_complexity: "light",
    clearance_m: 3,
    near_hv_power: 0,
    near_base_station: 0,
    wind_channel_effect: 0,
    rooftop_condition: "good",
    crowd_density: "low",
    region_exposure: null,
  },
}

const cfg = {
  healthy_min: 5000,
  marginal_min: 3000,
  poor_min: 1500,
  marginal_adj: 5,
  poor_adj: 10,
  max_adj: 15,
}

describe("visibility helpers — pure-function contract", () => {
  it("visibilityTierAdj: null/undefined returns 0", () => {
    expect(visibilityTierAdj(null, cfg)).toBe(0)
    expect(visibilityTierAdj(undefined, cfg)).toBe(0)
  })

  it("visibilityTierAdj: ≥ healthy_min returns 0 (boundary inclusive)", () => {
    expect(visibilityTierAdj(5000, cfg)).toBe(0)
    expect(visibilityTierAdj(10000, cfg)).toBe(0)
  })

  it("visibilityTierAdj: marginal band returns marginal_adj (boundary inclusive at marginal_min)", () => {
    expect(visibilityTierAdj(4999, cfg)).toBe(5)
    expect(visibilityTierAdj(4000, cfg)).toBe(5)
    expect(visibilityTierAdj(3000, cfg)).toBe(5) // boundary inclusive
  })

  it("visibilityTierAdj: poor band returns poor_adj (boundary inclusive at poor_min)", () => {
    expect(visibilityTierAdj(2999, cfg)).toBe(10)
    expect(visibilityTierAdj(2500, cfg)).toBe(10)
    expect(visibilityTierAdj(1500, cfg)).toBe(10) // gate uses strict `<`, so 1500 falls to tier
  })

  it("visibilityTierAdj: sub-poor_min returns poor_adj as defensive default", () => {
    expect(visibilityTierAdj(800, cfg)).toBe(10)
    expect(visibilityTierAdj(0, cfg)).toBe(10)
  })

  it("visibilityTierAdj: max_adj caps poor_adj when override pushes above cap", () => {
    const cappedCfg = { ...cfg, poor_adj: 30, max_adj: 15 }
    expect(visibilityTierAdj(2500, cappedCfg)).toBe(15) // 30 capped to 15
  })

  it("visibilityForcesNoGo: null visibility_m never forces", () => {
    expect(visibilityForcesNoGo(null, 1500)).toBe(false)
    expect(visibilityForcesNoGo(undefined, 1500)).toBe(false)
  })

  it("visibilityForcesNoGo: missing min is no-op", () => {
    expect(visibilityForcesNoGo(800, undefined)).toBe(false)
  })

  it("visibilityForcesNoGo: strict less-than", () => {
    expect(visibilityForcesNoGo(1499, 1500)).toBe(true)
    expect(visibilityForcesNoGo(1500, 1500)).toBe(false) // boundary excluded from gate
    expect(visibilityForcesNoGo(2000, 1500)).toBe(false)
  })
})

describe("evaluateRisk — v2.1 visibility defaults preserve v2.0 baseline (TV-017)", () => {
  it("visibility_m=null produces bit-identical output to baseline", () => {
    const baseline = evaluateRisk(baseInput)
    const withNull = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: null },
    })
    expect(withNull.risk_score).toBe(baseline.risk_score)
    expect(withNull.weather_now).toBe(baseline.weather_now)
    expect(withNull.decision).toBe(baseline.decision)
    expect(withNull.visibility_adj).toBeUndefined()
    expect(withNull.explanations.find(e => e.factor === "能見度修正")).toBeUndefined()
  })

  it("visibility_m=6000 (≥ healthy_min) is also a no-op", () => {
    const baseline = evaluateRisk(baseInput)
    const withHealthy = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: 6000 },
    })
    expect(withHealthy.risk_score).toBe(baseline.risk_score)
    expect(withHealthy.visibility_adj).toBeUndefined()
  })
})

describe("evaluateRisk — Channel 2 (tier adder, TV-018)", () => {
  it("visibility_m=4000 (marginal band) adds +5 to risk_score", () => {
    const baseline = evaluateRisk(baseInput)
    const withMarginal = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: 4000 },
    })
    expect(withMarginal.visibility_adj).toBe(5)
    expect(withMarginal.risk_score - baseline.risk_score).toBe(5)
    // Explanation surfaces
    expect(withMarginal.explanations.find(e => e.factor === "能見度修正")).toBeDefined()
  })

  it("visibility_m=2500 (poor band) adds +10 to risk_score", () => {
    const baseline = evaluateRisk(baseInput)
    const withPoor = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: 2500 },
    })
    expect(withPoor.visibility_adj).toBe(10)
    expect(withPoor.risk_score - baseline.risk_score).toBe(10)
  })

  it("visibility_m=6000 (healthy) keeps visibility_adj undefined", () => {
    const withHealthy = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: 6000 },
    })
    expect(withHealthy.visibility_adj).toBeUndefined()
  })
})

describe("evaluateRisk — Channel 1 (VLOS gate, TV-019)", () => {
  it("visibility_m=800 forces NO_GO with controls naming visibility/VLOS/threshold", () => {
    const result = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: 800 },
    })
    expect(result.decision).toBe("NO_GO")
    expect(result.conditional_tier).toBeNull()
    const joined = result.controls.join(" ")
    expect(/能見度|VLOS|800|1500/.test(joined)).toBe(true)
  })

  it("visibility_m=1499 still triggers gate (just below threshold)", () => {
    const result = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: 1499 },
    })
    expect(result.decision).toBe("NO_GO")
  })

  it("visibility_m=1500 (boundary) does NOT trigger gate; tier adder fires with +10", () => {
    const result = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: 1500 },
    })
    expect(result.decision).not.toBe("NO_GO")
    expect(result.visibility_adj).toBe(10)
  })
})

describe("evaluateRisk — Channel-1+2 interaction", () => {
  it("visibility_m=800 produces NO_GO AND visibility_adj=10 (option iii — populate even when gate fires)", () => {
    const result = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: 800 },
    })
    expect(result.decision).toBe("NO_GO")
    expect(result.visibility_adj).toBe(10)
  })
})

describe("evaluateRisk — max_adj cap via override", () => {
  it("max_adj caps poor_adj when an override pushes it above the cap", () => {
    const baseParams = resolveParams("v2.0")!
    const overridden = resolveParams("v2.0", {
      visibility_observation_config: {
        ...baseParams.visibility_observation_config,
        poor_adj: 30, // > max_adj of 15
      },
    })!

    const withPoor = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, visibility_m: 2500 },
    }, { params: overridden })
    expect(withPoor.visibility_adj).toBe(15) // capped, not 30
  })
})
