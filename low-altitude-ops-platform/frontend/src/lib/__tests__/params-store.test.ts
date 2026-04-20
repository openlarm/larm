import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  loadParamOverride,
  saveParamOverride,
  clearParamOverride,
  getParamsWithOverride,
  migrateLegacyPricingOverride,
  LARM_OVERRIDE_KEY,
  LEGACY_PRICING_KEY,
} from "../params-store"
import { WEATHER_REGIME_PARAMS_V2 } from "../engines/weather-regime-params"

function makeFakeStorage(): Storage {
  const store = new Map<string, string>()
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() { return store.size },
  }
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = makeFakeStorage()
})

afterEach(() => {
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage
})

describe("params-store", () => {
  it("loadParamOverride returns null when nothing is stored", () => {
    expect(loadParamOverride()).toBeNull()
  })

  it("saveParamOverride + loadParamOverride round-trip", () => {
    saveParamOverride({ r4_nogo_threshold: 90 })
    expect(loadParamOverride()).toEqual({ r4_nogo_threshold: 90 })
  })

  it("clearParamOverride removes the stored value", () => {
    saveParamOverride({ r4_nogo_threshold: 90 })
    clearParamOverride()
    expect(loadParamOverride()).toBeNull()
  })

  it("loadParamOverride returns null when stored JSON is malformed", () => {
    localStorage.setItem(LARM_OVERRIDE_KEY, "not-json")
    expect(loadParamOverride()).toBeNull()
  })

  it("getParamsWithOverride without override equals pure defaults", () => {
    expect(getParamsWithOverride()).toEqual(WEATHER_REGIME_PARAMS_V2)
  })

  it("getParamsWithOverride merges stored override over defaults", () => {
    saveParamOverride({ r4_nogo_threshold: 77 })
    expect(getParamsWithOverride().r4_nogo_threshold).toBe(77)
  })

  it("migrateLegacyPricingOverride copies old key into new key and clears old", () => {
    const legacy = { pricing: { urgent_multiplier: 1.8 } }
    localStorage.setItem(LEGACY_PRICING_KEY, JSON.stringify(legacy))
    migrateLegacyPricingOverride()
    expect(localStorage.getItem(LEGACY_PRICING_KEY)).toBeNull()
    expect(loadParamOverride()).toEqual({ pricing: { urgent_multiplier: 1.8 } })
  })

  it("migrateLegacyPricingOverride preserves existing larm override (merges)", () => {
    const legacyPricing = { pricing: { urgent_multiplier: 1.8 } }
    const existingLarm = { r4_nogo_threshold: 80 }
    localStorage.setItem(LEGACY_PRICING_KEY, JSON.stringify(legacyPricing))
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(existingLarm))
    migrateLegacyPricingOverride()
    expect(loadParamOverride()).toEqual({
      r4_nogo_threshold: 80,
      pricing: { urgent_multiplier: 1.8 },
    })
  })

  it("is safe to call during SSR (no localStorage)", () => {
    const original = (globalThis as unknown as { localStorage?: Storage }).localStorage
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage
    try {
      expect(loadParamOverride()).toBeNull()
      expect(() => saveParamOverride({ r4_nogo_threshold: 1 })).not.toThrow()
      expect(getParamsWithOverride()).toEqual(WEATHER_REGIME_PARAMS_V2)
    } finally {
      ;(globalThis as unknown as { localStorage: Storage }).localStorage = original as Storage
    }
  })
})
