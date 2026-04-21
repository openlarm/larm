import { describe, it, expect, beforeEach, afterEach } from "vitest"
import {
  loadParamOverride,
  saveParamOverride,
  clearParamOverride,
  getParamsWithOverride,
  getPricingParamsWithOverride,
  loadPricingOverride,
  savePricingOverride,
  migrateLegacyPricingOverride,
  LARM_OVERRIDE_KEY,
  PRICING_OVERRIDE_KEY,
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

  it("savePricingOverride + loadPricingOverride round-trip", () => {
    savePricingOverride({ urgent_multiplier: 1.8 })
    expect(loadPricingOverride()).toEqual({ urgent_multiplier: 1.8 })
  })

  it("getPricingParamsWithOverride merges stored pricing override over defaults", () => {
    savePricingOverride({ urgent_multiplier: 1.75 })
    expect(getPricingParamsWithOverride().urgent_multiplier).toBe(1.75)
    // Other pricing fields preserved
    expect(getPricingParamsWithOverride().min_order).toBeGreaterThan(0)
  })

  it("migrateLegacyPricingOverride extracts nested pricing from larm_params_override and saves separately", () => {
    // Pre-Task-6 shape: pricing nested inside larm_params_override
    const legacyUnified = { r4_nogo_threshold: 80, pricing: { urgent_multiplier: 1.8 } }
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(legacyUnified))
    migrateLegacyPricingOverride()
    // pricing extracted to separate key
    expect(loadPricingOverride()?.urgent_multiplier).toBe(1.8)
    // pricing stripped from larm key
    const larmLoaded = loadParamOverride()
    expect((larmLoaded as Record<string, unknown>)?.pricing).toBeUndefined()
    expect(larmLoaded?.r4_nogo_threshold).toBe(80)
  })

  it("migrateLegacyPricingOverride does not overwrite existing pricing override (newer wins)", () => {
    const legacyUnified = { r4_nogo_threshold: 80, pricing: { urgent_multiplier: 1.8 } }
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(legacyUnified))
    // Existing standalone pricing override
    localStorage.setItem(PRICING_OVERRIDE_KEY, JSON.stringify({ urgent_multiplier: 1.2 }))
    migrateLegacyPricingOverride()
    // The pre-existing pricing override wins
    expect(loadPricingOverride()?.urgent_multiplier).toBe(1.2)
    // pricing still stripped from larm key
    const larmLoaded = loadParamOverride()
    expect((larmLoaded as Record<string, unknown>)?.pricing).toBeUndefined()
  })

  it("migrateLegacyPricingOverride is a no-op when larm_params_override has no pricing", () => {
    saveParamOverride({ r4_nogo_threshold: 80 })
    migrateLegacyPricingOverride()
    expect(loadParamOverride()?.r4_nogo_threshold).toBe(80)
    expect(loadPricingOverride()).toBeNull()
  })

  it("getParamsWithOverride transparently runs the legacy migration on first read", () => {
    // Simulates an existing user whose browser still holds the pre-Task-6 unified shape
    const legacyUnified = { pricing: { urgent_multiplier: 1.6 } }
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(legacyUnified))
    getParamsWithOverride()
    // pricing was migrated out
    expect(loadPricingOverride()?.urgent_multiplier).toBe(1.6)
    // larm_params_override no longer has the pricing key
    const larmLoaded = loadParamOverride()
    expect((larmLoaded as Record<string, unknown>)?.pricing).toBeUndefined()
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
