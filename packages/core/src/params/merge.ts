import type { WeatherRegimeParams } from "./schema.js"
import { PARAM_REGISTRY, ACTIVE_PARAMS_VERSION } from "./registry.js"

/**
 * Pure shallow merge of an override onto a base WeatherRegimeParams.
 *
 * Merge semantics:
 * - Top-level fields in `override` REPLACE the base field wholesale.
 *   If you want to modify a nested object (e.g. `regimes`, `wr_matrix`,
 *   `thresholds`, `weather_now_weights`), you MUST supply the full
 *   sub-object — omitted siblings will be wiped.
 *
 * This function never reads browser globals; it is safe for server
 * components, workers, and test environments.
 */
export function mergeParams(
  base: WeatherRegimeParams,
  override: Partial<WeatherRegimeParams>,
): WeatherRegimeParams {
  return { ...base, ...override }
}

/**
 * Resolve parameters by version. Returns `undefined` if the requested
 * version has not been registered (i.e. no region adapter has loaded
 * yet). Callers can pass `override` to apply a partial merge on top of
 * the resolved base.
 *
 * For deterministic tests and engines that need a guaranteed result,
 * prefer passing a concrete `base` directly into `mergeParams`.
 */
export function resolveParams(
  version: string = ACTIVE_PARAMS_VERSION,
  override?: Partial<WeatherRegimeParams>,
): WeatherRegimeParams | undefined {
  const base = PARAM_REGISTRY[version]
  if (!base) return undefined
  return override ? mergeParams(base, override) : base
}
