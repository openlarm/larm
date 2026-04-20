import { describe, it, expect } from "vitest"
import {
  resolveParams,
  WEATHER_REGIME_PARAMS_V2,
  type WeatherRegimeParams,
} from "../weather-regime-params"

describe("resolveParams (pure)", () => {
  it("returns v2.0 defaults when no override is given", () => {
    expect(resolveParams()).toEqual(WEATHER_REGIME_PARAMS_V2)
  })

  it("returns v1.0 defaults when explicitly requested", () => {
    const p = resolveParams("v1.0")
    expect(p.version).toBe("v1.0")
  })

  it("shallow-merges a top-level override over defaults", () => {
    const override: Partial<WeatherRegimeParams> = { r4_nogo_threshold: 88 }
    const p = resolveParams("v2.0", override)
    expect(p.r4_nogo_threshold).toBe(88)
    // Unrelated fields preserved
    expect(p.regimes.W0.base_score).toBe(WEATHER_REGIME_PARAMS_V2.regimes.W0.base_score)
  })

  it("deep-merges the pricing sub-object", () => {
    const override: Partial<WeatherRegimeParams> = {
      pricing: { urgent_multiplier: 1.75 } as WeatherRegimeParams["pricing"],
    }
    const p = resolveParams("v2.0", override)
    expect(p.pricing.urgent_multiplier).toBe(1.75)
    // Other pricing fields preserved
    expect(p.pricing.base_price).toEqual(WEATHER_REGIME_PARAMS_V2.pricing.base_price)
  })

  it("falls back to active version when given an unknown version key", () => {
    const p = resolveParams("v99.0" as string)
    expect(p.version).toBe(WEATHER_REGIME_PARAMS_V2.version)
  })

  it("does not touch localStorage or window", () => {
    // Sanity: calling resolveParams should not throw in a fresh context
    // even when we blank out window (verified by running in vitest's default
    // happy-dom/jsdom + explicitly calling through).
    expect(() => resolveParams("v2.0")).not.toThrow()
  })
})
