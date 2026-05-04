import type { WeatherRegimeParams } from "./schema.js"

/**
 * The default parameter-schema version. Region adapters SHOULD populate
 * PARAM_REGISTRY with at least this version; otherwise resolveParams(version)
 * returns `undefined` and callers must provide `base` explicitly.
 */
export const ACTIVE_PARAMS_VERSION = "v2.0"

/**
 * Empty by default. Region adapter packages (e.g. @openlarm/regions-taiwan)
 * call registerParams() to populate it on import.
 */
export const PARAM_REGISTRY: Record<string, WeatherRegimeParams> = Object.create(null) as Record<string, WeatherRegimeParams>

/**
 * Register a version's parameter set. Idempotent: re-registering the same
 * version replaces the previous entry silently.
 */
export function registerParams(version: string, params: WeatherRegimeParams): void {
  PARAM_REGISTRY[version] = params
}
