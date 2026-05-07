// Golden tests for v2.1 candidate lightning_strikes_30min_5km integration (Unreleased).
//
// Two mechanisms tested:
//   A) thunder_risk forcing — observed strikes ≥ thunder_force_threshold
//      override forecast-layer thunder_risk to 1, activating thunder_add.
//   B) tiered direct adder — strikes count maps to a points adjustment
//      added directly to risk_score, capped at max_adj.
//
// Mirrors TV-015 (null fallback) and TV-016 (tier-2 binding) plus
// per-tier coverage and override demonstration.

import "./setup-taiwan.ts"

import { describe, it, expect } from "vitest"
import {
  evaluateRisk,
  resolveParams,
  lightningTierAdj,
  lightningForcesThunderRisk,
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
  thunder_force_threshold: 1,
  tier_1_max_exclusive: 3,
  tier_2_max_exclusive: 10,
  tier_1_adj: 8,
  tier_2_adj: 15,
  tier_3_adj: 20,
  max_adj: 25,
}

describe("lightning helpers — pure-function contract", () => {
  it("lightningForcesThunderRisk: null/undefined never forces", () => {
    expect(lightningForcesThunderRisk(null, cfg)).toBe(false)
    expect(lightningForcesThunderRisk(undefined, cfg)).toBe(false)
  })

  it("lightningForcesThunderRisk: strikes < threshold does not force; ≥ does", () => {
    expect(lightningForcesThunderRisk(0, cfg)).toBe(false)
    expect(lightningForcesThunderRisk(1, cfg)).toBe(true)
    expect(lightningForcesThunderRisk(99, cfg)).toBe(true)
  })

  it("lightningTierAdj: null / sub-threshold returns 0", () => {
    expect(lightningTierAdj(null, cfg)).toBe(0)
    expect(lightningTierAdj(undefined, cfg)).toBe(0)
    expect(lightningTierAdj(0, cfg)).toBe(0)
  })

  it("lightningTierAdj: tiers map correctly", () => {
    expect(lightningTierAdj(1, cfg)).toBe(8)   // tier 1 (1 ≤ x < 3)
    expect(lightningTierAdj(2, cfg)).toBe(8)
    expect(lightningTierAdj(3, cfg)).toBe(15)  // tier 2 (3 ≤ x < 10) — boundary semantics
    expect(lightningTierAdj(5, cfg)).toBe(15)
    expect(lightningTierAdj(9, cfg)).toBe(15)
    expect(lightningTierAdj(10, cfg)).toBe(20) // tier 3 (≥ 10)
    expect(lightningTierAdj(50, cfg)).toBe(20)
  })

  it("lightningTierAdj: max_adj caps tier_3 contribution", () => {
    const cappedCfg = { ...cfg, tier_3_adj: 30, max_adj: 25 }
    expect(lightningTierAdj(50, cappedCfg)).toBe(25) // 30 capped to 25
  })
})

describe("evaluateRisk — v2.1 lightning defaults preserve v2.0 baseline (TV-015)", () => {
  it("lightning_strikes_30min_5km=null produces bit-identical output to baseline", () => {
    const baseline = evaluateRisk(baseInput)
    const withNull = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, lightning_strikes_30min_5km: null },
    })
    expect(withNull.risk_score).toBe(baseline.risk_score)
    expect(withNull.weather_now).toBe(baseline.weather_now)
    expect(withNull.decision).toBe(baseline.decision)
    expect(withNull.lightning_adj).toBeUndefined()
    expect(withNull.explanations.find(e => e.factor === "閃電觀測加成")).toBeUndefined()
  })

  it("0 strikes (degenerate) is still a no-op — sub-threshold", () => {
    const baseline = evaluateRisk(baseInput)
    const withZero = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, lightning_strikes_30min_5km: 0 },
    })
    expect(withZero.risk_score).toBe(baseline.risk_score)
    expect(withZero.lightning_adj).toBeUndefined()
  })
})

describe("evaluateRisk — v2.1 lightning Mechanism A (thunder_risk forcing)", () => {
  it("1 strike forces thunder_risk 0→1 and activates thunder_add (+5 inside weather_now)", () => {
    // 1 strike → tier 1 (+8 from Mechanism B) AND forces thunder (+5 inside weather_now)
    const baseline = evaluateRisk(baseInput) // thunder_risk=0
    const withOne = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, lightning_strikes_30min_5km: 1 },
    })
    expect(withOne.weather_now).toBeGreaterThan(baseline.weather_now) // forcing landed
    expect(withOne.lightning_adj).toBe(8) // tier 1
    expect(withOne.risk_score - baseline.risk_score).toBeGreaterThanOrEqual(8)
    // Explanation surfaces both
    expect(withOne.explanations.find(e => e.factor === "閃電觀測加成")).toBeDefined()
    const thunderExpl = withOne.explanations.find(e => e.factor === "雷雨加成")
    expect(thunderExpl).toBeDefined()
    expect(thunderExpl!.note).toContain("閃電觀測強制")
  })

  it("when thunder_risk is already 1, forcing is a no-op (no double-count)", () => {
    const inputThunderOn = {
      ...baseInput,
      weather_today: { ...baseInput.weather_today, thunder_risk: 1 as const },
    }
    const baseline = evaluateRisk(inputThunderOn)
    const withLightning = evaluateRisk({
      ...inputThunderOn,
      weather_today: { ...inputThunderOn.weather_today, lightning_strikes_30min_5km: 5 },
    })
    // Δ should equal exactly tier_2_adj (15), not tier_2_adj + thunder_add (would be 20)
    expect(withLightning.risk_score - baseline.risk_score).toBe(15)
    expect(withLightning.lightning_adj).toBe(15)
    // Thunder explanation present in BOTH but note must NOT mention forcing in baseline
    const thunderBaseline = baseline.explanations.find(e => e.factor === "雷雨加成")
    const thunderForced = withLightning.explanations.find(e => e.factor === "雷雨加成")
    expect(thunderBaseline!.note).not.toContain("閃電觀測強制")
    expect(thunderForced!.note).not.toContain("閃電觀測強制") // already 1, not forced
  })
})

describe("evaluateRisk — v2.1 lightning Mechanism B (tier adder, TV-016)", () => {
  it("5 strikes (tier 2) adds +15 directly to risk_score AND forces thunder", () => {
    // TV-016: combined Δ should be +20 (= +5 forcing in weather_now + +15 adder)
    const baseline = evaluateRisk(baseInput)
    const withFive = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, lightning_strikes_30min_5km: 5 },
    })
    expect(withFive.lightning_adj).toBe(15)
    expect(withFive.risk_score - baseline.risk_score).toBe(20)
  })

  it("12 strikes (tier 3) adds +20 directly to risk_score", () => {
    const baseline = evaluateRisk(baseInput)
    const withTwelve = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, lightning_strikes_30min_5km: 12 },
    })
    expect(withTwelve.lightning_adj).toBe(20)
    // +5 forcing + +20 tier = +25 risk_score
    expect(withTwelve.risk_score - baseline.risk_score).toBe(25)
  })

  it("max_adj caps tier_3_adj when an override pushes it above the cap", () => {
    const baseParams = resolveParams("v2.0")!
    const overridden = resolveParams("v2.0", {
      lightning_observation_config: {
        ...baseParams.lightning_observation_config,
        tier_3_adj: 30, // > max_adj of 25
      },
    })!

    const withTwelve = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, lightning_strikes_30min_5km: 12 },
    }, { params: overridden })
    expect(withTwelve.lightning_adj).toBe(25) // capped, not 30
  })

  it("risk_score remains clamped to 100 even with extreme lightning + base risk", () => {
    // Construct a high-baseline input then add tier-3 lightning; verify clamp.
    const highRiskInput: LARMInput = {
      ...baseInput,
      weather_30d: { ...baseInput.weather_30d, instability_index: 0.95, predictability_score: 0.3 },
      weather_today: {
        ...baseInput.weather_today,
        wind_now_kmh: 35, // band 33-38, score 55
        rain_prob_today_pct: 65,
        rain_mmph_forecast: 8,
        thunder_risk: 1,
        lightning_strikes_30min_5km: 50, // tier 3, capped at +25
      },
    }
    const r = evaluateRisk(highRiskInput)
    expect(r.risk_score).toBeLessThanOrEqual(100)
  })
})
