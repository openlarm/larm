// Client-side parameter-override store.
//
// This is the ONLY module in src/lib that is allowed to talk to
// localStorage for LARM params. Engines under src/lib/engines/ stay
// browser-free; they accept params explicitly and this module is how
// the Next.js app layer threads user overrides through to them.
//
// Legacy migration: early builds wrote a separate "pricing_params_override"
// key. migrateLegacyPricingOverride() folds any surviving legacy payload
// into the canonical "larm_params_override" key and deletes the old one.

import {
  resolveParams,
  type WeatherRegimeParams,
} from "./engines/weather-regime-params"

export const LARM_OVERRIDE_KEY = "larm_params_override"
export const LEGACY_PRICING_KEY = "pricing_params_override"

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

/**
 * Merge any client-side override with engine defaults and return the full
 * WeatherRegimeParams. Safe to call from server components: returns pure
 * defaults when localStorage is unavailable.
 *
 * Also triggers the legacy `pricing_params_override` migration on the first
 * call per session (idempotent; no-op when the legacy key is absent). This
 * ensures users who set pricing overrides in pre-unification builds do not
 * silently lose them when the app updates.
 */
export function getParamsWithOverride(version?: string): WeatherRegimeParams {
  migrateLegacyPricingOverride()
  return resolveParams(version, loadParamOverride() ?? undefined)
}

/**
 * One-shot migration for the "pricing_params_override" key that pre-dated
 * the unified override. The legacy value is a flat `Partial<PricingParams>`
 * written by earlier builds of the admin-params UI. This migration wraps it
 * under the canonical `pricing` sub-key of `larm_params_override`. Idempotent.
 *
 * Collision semantics: if `larm_params_override` already has a `pricing`
 * sub-object, the legacy value is discarded — the newer explicit setting
 * wins. This matches the original migration in `pricing-params.ts` that
 * this helper replaces.
 */
export function migrateLegacyPricingOverride(): void {
  if (!hasStorage()) return
  try {
    const oldRaw = localStorage.getItem(LEGACY_PRICING_KEY)
    if (!oldRaw) return
    const oldPricing = JSON.parse(oldRaw) as Partial<WeatherRegimeParams["pricing"]>
    const existing = loadParamOverride() ?? {}
    if (!existing.pricing) {
      const merged: Partial<WeatherRegimeParams> = {
        ...existing,
        pricing: oldPricing as WeatherRegimeParams["pricing"],
      }
      localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(merged))
    }
    localStorage.removeItem(LEGACY_PRICING_KEY)
  } catch (err) {
    warn("migrateLegacyPricingOverride", err)
  }
}
