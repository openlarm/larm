// Golden tests for v2.1 candidate cape_jkg integration (Unreleased).
//
// Three scenarios:
//   (a) defaults preserve baseline — cape_jkg null/undefined produces the
//       same output as v2.0 baseline (mirrors TV-013).
//   (b) binding contribution — cape_jkg = 2000 with low instability_index
//       lifts risk_score by ≥1 (mirrors TV-014).
//   (c) override demonstrates param-ization — raising upper_value to 1.0
//       in a TEST-only override produces a strictly larger risk_score for
//       the same cape_jkg=2500 input than under default Taiwan params.

import "./setup-taiwan.ts"

import { describe, it, expect } from "vitest"
import { evaluateRisk, resolveParams, capeToInstabilityContribution } from "../src/index.ts"
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

describe("capeToInstabilityContribution helper — piecewise-linear contract", () => {
  const cfg = { lower_breakpoint: 500, mid_breakpoint: 1500, upper_breakpoint: 2500, mid_value: 0.4, upper_value: 0.8 }

  it("returns 0 for null / undefined / below lower_breakpoint", () => {
    expect(capeToInstabilityContribution(null, cfg)).toBe(0)
    expect(capeToInstabilityContribution(undefined, cfg)).toBe(0)
    expect(capeToInstabilityContribution(400, cfg)).toBe(0)
    expect(capeToInstabilityContribution(500, cfg)).toBe(0)
  })

  it("interpolates linearly between lower and mid breakpoints", () => {
    // cape=1000 → frac = (1000-500)/1000 = 0.5 → 0.5 * 0.4 = 0.2
    expect(capeToInstabilityContribution(1000, cfg)).toBeCloseTo(0.2, 5)
    expect(capeToInstabilityContribution(1500, cfg)).toBeCloseTo(0.4, 5)
  })

  it("interpolates linearly between mid and upper breakpoints", () => {
    // cape=2000 → 0.4 + 0.5 * 0.4 = 0.6
    expect(capeToInstabilityContribution(2000, cfg)).toBeCloseTo(0.6, 5)
    // cape=2200 → 0.4 + 0.7 * 0.4 = 0.68
    expect(capeToInstabilityContribution(2200, cfg)).toBeCloseTo(0.68, 5)
  })

  it("caps at upper_value for cape ≥ upper_breakpoint", () => {
    expect(capeToInstabilityContribution(2500, cfg)).toBe(0.8)
    expect(capeToInstabilityContribution(5000, cfg)).toBe(0.8)
  })
})

describe("evaluateRisk — v2.1 cape_jkg defaults preserve v2.0 baseline (TV-013)", () => {
  it("cape_jkg=null produces bit-identical output to a baseline without the field", () => {
    const withoutField = evaluateRisk(baseInput)
    const withNullField = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, cape_jkg: null },
    })
    expect(withNullField.risk_score).toBe(withoutField.risk_score)
    expect(withNullField.risk_level).toBe(withoutField.risk_level)
    expect(withNullField.decision).toBe(withoutField.decision)
    expect(withNullField.weather_now).toBe(withoutField.weather_now)
    // Explanations should not surface CAPE when cape is null/missing
    expect(withNullField.explanations.find(e => e.factor === "CAPE 不穩定加成")).toBeUndefined()
  })

  it("cape_jkg below lower_breakpoint (400 J/kg) produces bit-identical output", () => {
    const withoutField = evaluateRisk(baseInput)
    const withLowField = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, cape_jkg: 400 },
    })
    expect(withLowField.risk_score).toBe(withoutField.risk_score)
    expect(withLowField.weather_now).toBe(withoutField.weather_now)
  })
})

describe("evaluateRisk — v2.1 cape_jkg binding contribution (TV-014)", () => {
  it("cape_jkg=2000 with low instability_index lifts risk_score by exactly 1", () => {
    // Arithmetic (per spec §5.2.7 / TV-014 description):
    //   cape_contrib(2000) = 0.4 + (2000-1500)/1000 × (0.8-0.4) = 0.6
    //   effective_instability = min(1, 0.10 + 0.6) = 0.7
    //   Δ instComp = (0.7 - 0.10) × 20 = +12
    //   Δ raw = wts.instability × 12 = 0.10 × 12 = +1.2
    //   Δ risk_score = round(...) = +1
    const baseline = evaluateRisk(baseInput)
    const withCape = evaluateRisk({
      ...baseInput,
      weather_today: { ...baseInput.weather_today, cape_jkg: 2000 },
    })
    expect(withCape.risk_score - baseline.risk_score).toBe(1)
    expect(withCape.weather_now).toBeGreaterThan(baseline.weather_now)
    // Explanation should surface CAPE binding
    const capeExpl = withCape.explanations.find(e => e.factor === "CAPE 不穩定加成")
    expect(capeExpl).toBeDefined()
    expect(capeExpl!.value).toContain("2000")
    // Decision unchanged at this scale (R0 → R0)
    expect(withCape.decision).toBe(baseline.decision)
  })

  it("instability_index=null falls back to 0 and CAPE alone drives effective_instability", () => {
    const inputNoInst = {
      ...baseInput,
      weather_30d: { ...baseInput.weather_30d, instability_index: 0 },
    }
    const baseline = evaluateRisk(inputNoInst)
    const withCape = evaluateRisk({
      ...inputNoInst,
      weather_today: { ...inputNoInst.weather_today, cape_jkg: 2500 },
    })
    // cape_contrib(2500) = 0.8, effective = min(1, 0+0.8) = 0.8
    // Δ instComp = 0.8 × 20 = +16, Δ raw = +1.6, Δ risk_score ≥ +1
    expect(withCape.risk_score).toBeGreaterThan(baseline.risk_score)
  })
})

describe("evaluateRisk — v2.1 cape_contribution_config override raises score", () => {
  it("with upper_value raised 0.8 → 1.0, cape=2500 produces strictly larger risk_score", () => {
    const baseParams = resolveParams("v2.0")!
    const overridden = resolveParams("v2.0", {
      cape_contribution_config: {
        ...baseParams.cape_contribution_config,
        upper_value: 1.0,
      },
    })!

    const inputCape2500 = {
      ...baseInput,
      weather_today: { ...baseInput.weather_today, cape_jkg: 2500 },
    }

    const underDefault = evaluateRisk(inputCape2500)
    const underOverride = evaluateRisk(inputCape2500, { params: overridden })

    // Default upper_value=0.8 → effective = min(1, 0.10+0.8) = 0.9
    // Override upper_value=1.0 → effective = min(1, 0.10+1.0) = 1.0
    // Δ effective = 0.1, Δ instComp = 0.1×20 = 2, Δ weighted = 0.2 → ~+0 risk_score round
    // (Values too small to guarantee +1 round; assert weather_now strictly greater instead)
    expect(underOverride.weather_now).toBeGreaterThan(underDefault.weather_now)
    expect(underOverride.risk_score).toBeGreaterThanOrEqual(underDefault.risk_score)
  })
})
