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

  it("migrateLegacyPricingOverride wraps flat legacy payload under pricing key and clears old", () => {
    // Legacy shape: flat Partial<PricingParams>, no top-level `pricing` wrapper.
    const legacyFlat = { urgent_multiplier: 1.8 }
    localStorage.setItem(LEGACY_PRICING_KEY, JSON.stringify(legacyFlat))
    migrateLegacyPricingOverride()
    expect(localStorage.getItem(LEGACY_PRICING_KEY)).toBeNull()
    const loaded = loadParamOverride()
    expect(loaded?.pricing?.urgent_multiplier).toBe(1.8)
  })

  it("migrateLegacyPricingOverride discards legacy when larm override already has pricing (legacy loses)", () => {
    // Matches prior behaviour in pricing-params.ts:140: if larmOverride.pricing
    // already set, the newer value wins; legacy is dropped (but still removed).
    const legacyFlat = { urgent_multiplier: 1.8 }
    const existingLarm = {
      r4_nogo_threshold: 80,
      pricing: { urgent_multiplier: 1.2 },
    }
    localStorage.setItem(LEGACY_PRICING_KEY, JSON.stringify(legacyFlat))
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(existingLarm))
    migrateLegacyPricingOverride()
    expect(localStorage.getItem(LEGACY_PRICING_KEY)).toBeNull()
    const loaded = loadParamOverride()
    expect(loaded?.r4_nogo_threshold).toBe(80)
    expect(loaded?.pricing?.urgent_multiplier).toBe(1.2)  // newer wins
  })

  it("migrateLegacyPricingOverride folds legacy into existing larm override without pricing", () => {
    const legacyFlat = { urgent_multiplier: 1.5 }
    const existingLarm = { r4_nogo_threshold: 80 }  // no pricing sub-object
    localStorage.setItem(LEGACY_PRICING_KEY, JSON.stringify(legacyFlat))
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(existingLarm))
    migrateLegacyPricingOverride()
    const loaded = loadParamOverride()
    expect(loaded?.r4_nogo_threshold).toBe(80)
    expect(loaded?.pricing?.urgent_multiplier).toBe(1.5)
  })

  it("getParamsWithOverride transparently runs the legacy migration on first read", () => {
    // Simulates an existing user whose browser still holds the old flat key
    // from a pre-unification build. After any client-side read, the legacy
    // key must be migrated to the canonical location — otherwise their
    // override silently disappears.
    const legacyFlat = { urgent_multiplier: 1.6 }
    localStorage.setItem(LEGACY_PRICING_KEY, JSON.stringify(legacyFlat))
    const merged = getParamsWithOverride()
    expect(localStorage.getItem(LEGACY_PRICING_KEY)).toBeNull()
    expect(merged.pricing.urgent_multiplier).toBe(1.6)
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
