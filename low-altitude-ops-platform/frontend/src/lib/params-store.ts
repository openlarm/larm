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
  } catch {
    return null
  }
}

export function saveParamOverride(override: Partial<WeatherRegimeParams>): void {
  if (!hasStorage()) return
  try {
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(override))
  } catch {
    // Quota exceeded or storage disabled — silent, same as prior behaviour.
  }
}

export function clearParamOverride(): void {
  if (!hasStorage()) return
  try {
    localStorage.removeItem(LARM_OVERRIDE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Merge any client-side override with engine defaults and return the full
 * WeatherRegimeParams. Safe to call from server components: returns pure
 * defaults when localStorage is unavailable.
 */
export function getParamsWithOverride(version?: string): WeatherRegimeParams {
  return resolveParams(version, loadParamOverride() ?? undefined)
}

/**
 * One-shot migration for the "pricing_params_override" key that pre-dated
 * the unified override. Idempotent.
 */
export function migrateLegacyPricingOverride(): void {
  if (!hasStorage()) return
  try {
    const oldRaw = localStorage.getItem(LEGACY_PRICING_KEY)
    if (!oldRaw) return
    const oldValue = JSON.parse(oldRaw) as { pricing?: unknown }
    if (oldValue && typeof oldValue === "object" && "pricing" in oldValue) {
      const existingRaw = localStorage.getItem(LARM_OVERRIDE_KEY)
      const existing = existingRaw
        ? (JSON.parse(existingRaw) as Partial<WeatherRegimeParams>)
        : {}
      const merged = { ...existing, pricing: oldValue.pricing } as Partial<WeatherRegimeParams>
      localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(merged))
    }
    localStorage.removeItem(LEGACY_PRICING_KEY)
  } catch {
    // Best-effort migration. If it fails, leave both keys alone.
  }
}
