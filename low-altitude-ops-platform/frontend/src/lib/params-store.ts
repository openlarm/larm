// Client-side parameter-override store.
//
// This is the ONLY module in src/lib that is allowed to talk to
// localStorage for LARM params. Engines under src/lib/engines/ stay
// browser-free; they accept params explicitly and this module is how
// the Next.js app layer threads user overrides through to them.
//
// Since Task 6, pricing parameters are stored separately under
// PRICING_OVERRIDE_KEY rather than nested under the weather regime params.
//
// Legacy migration: early builds wrote a separate "pricing_params_override"
// key (flat PricingParams). migrateLegacyPricingOverride() folds any
// surviving legacy payload into the canonical PRICING_OVERRIDE_KEY and
// deletes the old one. Pre-Task-6 builds also wrote pricing under
// larm_params_override.pricing — migrateNestedPricingOverride() moves
// that to the canonical pricing key as well.

import {
  resolveParams,
  type WeatherRegimeParams,
} from "./engines/weather-regime-params"
import {
  getPricingParams,
  type PricingParams,
} from "./engines/pricing-params"

export const LARM_OVERRIDE_KEY = "larm_params_override"
export const PRICING_OVERRIDE_KEY = "pricing_params_override"

/**
 * Silent in tests (vitest's NODE_ENV==="test") and production builds;
 * active in development. Lets malformed overrides, quota-exceeded saves,
 * and broken migrations surface in the dev console instead of vanishing.
 */
function warn(op: string, err: unknown): void {
  if (typeof process !== "undefined" && process.env?.NODE_ENV === "development") {
    // eslint-disable-next-line no-console
    console.warn(`[params-store] ${op} failed:`, err)
  }
}

function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined"
  } catch {
    return false
  }
}

export function loadParamOverride(): Partial<WeatherRegimeParams> | null {
  if (!hasStorage()) return null
  try {
    const raw = localStorage.getItem(LARM_OVERRIDE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<WeatherRegimeParams>
  } catch (err) {
    warn("loadParamOverride", err)
    return null
  }
}

export function saveParamOverride(override: Partial<WeatherRegimeParams>): void {
  if (!hasStorage()) return
  try {
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(override))
  } catch (err) {
    warn("saveParamOverride", err)
  }
}

export function clearParamOverride(): void {
  if (!hasStorage()) return
  try {
    localStorage.removeItem(LARM_OVERRIDE_KEY)
  } catch (err) {
    warn("clearParamOverride", err)
  }
}

// ─── Pricing override store ────────────────────────────────────────────────

export function loadPricingOverride(): Partial<PricingParams> | null {
  if (!hasStorage()) return null
  try {
    const raw = localStorage.getItem(PRICING_OVERRIDE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<PricingParams>
  } catch (err) {
    warn("loadPricingOverride", err)
    return null
  }
}

export function savePricingOverride(override: Partial<PricingParams>): void {
  if (!hasStorage()) return
  try {
    localStorage.setItem(PRICING_OVERRIDE_KEY, JSON.stringify(override))
  } catch (err) {
    warn("savePricingOverride", err)
  }
}

export function clearPricingOverride(): void {
  if (!hasStorage()) return
  try {
    localStorage.removeItem(PRICING_OVERRIDE_KEY)
  } catch (err) {
    warn("clearPricingOverride", err)
  }
}

// ─── Combined readers ──────────────────────────────────────────────────────

/**
 * Merge any client-side override with engine defaults and return the full
 * WeatherRegimeParams. Safe to call from server components: returns pure
 * defaults when localStorage is unavailable.
 *
 * Also triggers legacy migrations on the first call per session (idempotent).
 */
export function getParamsWithOverride(version?: string): WeatherRegimeParams {
  migrateLegacyPricingOverride()
  return resolveParams(version, loadParamOverride() ?? undefined)
}

/**
 * Return PricingParams merged with any stored override.
 * Safe to call from server components: returns pure defaults when
 * localStorage is unavailable.
 */
export function getPricingParamsWithOverride(): PricingParams {
  migrateLegacyPricingOverride()
  const override = loadPricingOverride()
  if (!override) return getPricingParams()
  return { ...getPricingParams(), ...override }
}

/**
 * One-shot migration for the legacy "pricing_params_override" key that
 * pre-dated the Task 6 separation. Since both the old flat key and the new
 * canonical key share the name PRICING_OVERRIDE_KEY, this function now
 * also handles the case where pricing was previously stored nested under
 * larm_params_override.pricing (pre-Task-6 unified store).
 *
 * Idempotent — safe to call on every page load.
 */
export function migrateLegacyPricingOverride(): void {
  if (!hasStorage()) return
  try {
    // Migration: if larm_params_override still has a nested `pricing` object
    // (written by pre-Task-6 builds), extract it to the canonical pricing key
    // and strip it from the weather override.
    const raw = localStorage.getItem(LARM_OVERRIDE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      if (parsed && typeof parsed === "object" && "pricing" in parsed) {
        const nestedPricing = parsed["pricing"] as Partial<PricingParams>
        // Merge into existing pricing override only if not already set
        const existingPricing = loadPricingOverride()
        if (!existingPricing) {
          localStorage.setItem(PRICING_OVERRIDE_KEY, JSON.stringify(nestedPricing))
        }
        // Strip pricing from the weather params override
        const { pricing: _removed, ...rest } = parsed
        void _removed
        localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(rest))
      }
    }
  } catch (err) {
    warn("migrateLegacyPricingOverride", err)
  }
}
