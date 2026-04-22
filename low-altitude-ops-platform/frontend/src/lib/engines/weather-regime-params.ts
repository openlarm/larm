// Thin bridge. Schema types live in @openlarm/core; numeric defaults
// live in @openlarm/regions-taiwan. Importing this module anywhere in
// the Next.js app triggers registerParams() as a side-effect so
// @openlarm/core's registry is populated before any engine call.

import {
  ACTIVE_PARAMS_VERSION as CORE_ACTIVE_VERSION,
  registerParams,
  resolveParams as coreResolveParams,
  type WeatherRegimeParams,
} from "@openlarm/core"

import {
  TAIWAN_PARAMS_V1_0,
  TAIWAN_PARAMS_V2_0,
} from "@openlarm/regions-taiwan"

export type { WeatherRegimeParams } from "@openlarm/core"
export type {
  WCode,
  RegionKey,
  RegimeEntry,
  WindScoreRow,
  RLevelRow,
  RLevelKey,
  WRDecision,
  WeatherNowWeights,
  BufferCoefficients,
  UIInferThresholds,
  GScoreConfig,
  EScoreConfig,
  EDRThreshold,
} from "@openlarm/core"

// Side-effect: populate core's registry with Taiwan's defaults.
registerParams("v1.0", TAIWAN_PARAMS_V1_0)
registerParams("v2.0", TAIWAN_PARAMS_V2_0)

// Back-compat constants (unchanged names so in-app callers keep working).
export const WEATHER_REGIME_PARAMS_V1 = TAIWAN_PARAMS_V1_0
export const WEATHER_REGIME_PARAMS_V2 = TAIWAN_PARAMS_V2_0
export const PARAM_REGISTRY: Record<string, WeatherRegimeParams> = {
  "v1.0": TAIWAN_PARAMS_V1_0,
  "v2.0": TAIWAN_PARAMS_V2_0,
}
export const ACTIVE_PARAMS_VERSION = CORE_ACTIVE_VERSION

/**
 * @deprecated Import `resolveParams` from `@openlarm/core` and pass an
 * explicit base from `@openlarm/regions-taiwan` instead. This wrapper
 * keeps pre-Task-7 in-app callers working and will be removed in a
 * later task.
 */
export function resolveParams(
  version: string = ACTIVE_PARAMS_VERSION,
  override?: Partial<WeatherRegimeParams>,
): WeatherRegimeParams {
  // Fall back to active version for unknown keys (pre-Task-7 behaviour).
  const result = coreResolveParams(version, override) ?? coreResolveParams(ACTIVE_PARAMS_VERSION, override)
  if (!result) throw new Error(`Unknown params version: ${version}`)
  return result
}

/**
 * @deprecated Same as resolveParams(version) with no override.
 */
export function getParams(version: string = ACTIVE_PARAMS_VERSION): WeatherRegimeParams {
  return resolveParams(version)
}

// Keep the named export for backward compatibility
export const WEATHER_REGIME_PARAMS = WEATHER_REGIME_PARAMS_V2
