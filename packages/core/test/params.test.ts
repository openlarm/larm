import { describe, it, expect, beforeEach } from "vitest"
import {
  ACTIVE_PARAMS_VERSION,
  PARAM_REGISTRY,
  registerParams,
  resolveParams,
  mergeParams,
  type WeatherRegimeParams,
} from "../src/index.ts"

function makeFakeParams(overrides: Partial<WeatherRegimeParams> = {}): WeatherRegimeParams {
  return {
    version: "test",
    units: { wind: "km/h", rain_daily_heavy_threshold_mm: 80 },
    regimes: {} as WeatherRegimeParams["regimes"],
    thresholds: {} as WeatherRegimeParams["thresholds"],
    weather_now_weights: {} as WeatherRegimeParams["weather_now_weights"],
    buffer_coefficients: {} as WeatherRegimeParams["buffer_coefficients"],
    ui_infer_thresholds: {} as WeatherRegimeParams["ui_infer_thresholds"],
    g_score_config: {} as WeatherRegimeParams["g_score_config"],
    e_score_config: {} as WeatherRegimeParams["e_score_config"],
    o_score_cap: 12,
    r4_nogo_threshold: 92,
    w5_typhoon_trend_threshold: 3.6,
    w5_typhoon_trend_bonus: 2,
    wr_matrix: {} as WeatherRegimeParams["wr_matrix"],
    region_weight_table: {} as WeatherRegimeParams["region_weight_table"],
    volatility_buffer_add: {} as WeatherRegimeParams["volatility_buffer_add"],
    edr_thresholds: [],
    ...overrides,
  }
}

describe("resolveParams", () => {
  beforeEach(() => {
    for (const key of Object.keys(PARAM_REGISTRY)) delete PARAM_REGISTRY[key]
  })

  it("returns undefined when no version is registered", () => {
    expect(resolveParams()).toBeUndefined()
    expect(resolveParams("v2.0")).toBeUndefined()
  })

  it("returns the registered base when no override is given", () => {
    const p = makeFakeParams()
    registerParams("v2.0", p)
    expect(resolveParams("v2.0")).toBe(p)
  })

  it("defaults version to ACTIVE_PARAMS_VERSION", () => {
    const p = makeFakeParams()
    registerParams(ACTIVE_PARAMS_VERSION, p)
    expect(resolveParams()).toBe(p)
  })

  it("merges an override on top of the base", () => {
    const p = makeFakeParams()
    registerParams("v2.0", p)
    const result = resolveParams("v2.0", { r4_nogo_threshold: 80 })
    expect(result?.r4_nogo_threshold).toBe(80)
    expect(result?.o_score_cap).toBe(12)
  })

  it("returns a new object when override is applied (pure)", () => {
    const p = makeFakeParams()
    registerParams("v2.0", p)
    const result = resolveParams("v2.0", { r4_nogo_threshold: 80 })
    expect(result).not.toBe(p)
  })
})

describe("mergeParams", () => {
  it("performs a shallow replace of top-level fields", () => {
    const base = makeFakeParams({ r4_nogo_threshold: 92, o_score_cap: 12 })
    const result = mergeParams(base, { r4_nogo_threshold: 77 })
    expect(result.r4_nogo_threshold).toBe(77)
    expect(result.o_score_cap).toBe(12)
  })

  it("does not mutate the base", () => {
    const base = makeFakeParams({ r4_nogo_threshold: 92 })
    mergeParams(base, { r4_nogo_threshold: 77 })
    expect(base.r4_nogo_threshold).toBe(92)
  })

  it("wipes nested-object siblings on partial override (documented gotcha)", () => {
    // If you override `volatility_buffer_add` with a partial sub-object,
    // omitted W-code keys are lost. This test pins the documented
    // behaviour so a future breaking change can't sneak through.
    const base = makeFakeParams({
      volatility_buffer_add: { W0: 0, W1: 0.01, W2: 0.02 } as WeatherRegimeParams["volatility_buffer_add"],
    })
    const result = mergeParams(base, {
      volatility_buffer_add: { W5: 0.06 } as WeatherRegimeParams["volatility_buffer_add"],
    })
    expect(result.volatility_buffer_add).toEqual({ W5: 0.06 })
    expect((result.volatility_buffer_add as Record<string, number>).W0).toBeUndefined()
  })
})

describe("registerParams", () => {
  beforeEach(() => {
    for (const key of Object.keys(PARAM_REGISTRY)) delete PARAM_REGISTRY[key]
  })

  it("populates PARAM_REGISTRY under the given version key", () => {
    const p = makeFakeParams()
    registerParams("custom", p)
    expect(PARAM_REGISTRY.custom).toBe(p)
  })

  it("overwrites an existing entry (idempotent re-register)", () => {
    const p1 = makeFakeParams({ r4_nogo_threshold: 90 })
    const p2 = makeFakeParams({ r4_nogo_threshold: 85 })
    registerParams("v2.0", p1)
    registerParams("v2.0", p2)
    expect(PARAM_REGISTRY["v2.0"]).toBe(p2)
  })
})
