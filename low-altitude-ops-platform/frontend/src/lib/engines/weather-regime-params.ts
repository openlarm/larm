// LARM v2.0 — Weather Regime Parameters
// v1.0 retained for backward compatibility; v2.0 is active default

import { type PricingParams, PRICING_PARAMS_DEFAULT } from "./pricing-params"

export type WCode = "W0" | "W1" | "W2" | "W3" | "W4" | "W5"
export type RegionKey = "windward" | "leeward" | "coastal" | "rooftop_open"

export interface RegimeEntry {
  name: string
  base_score: number
  volatility_profile: string
  instability_weight: number
  predictability_weight: number
  notes: string
}

export interface WindScoreRow {
  min_kmh: number
  max_kmh: number
  score: number
}

export interface RLevelRow {
  min: number
  max: number
  r_level: string
}

export interface WeatherNowWeights {
  wind: number                       // default 0.55
  rain: number                       // default 0.35
  instability: number                // v2.0: 0.10 (was 0.15; sum now = 1.00)
  instability_scale: number          // v2.0: 20 (W4 uses 28, handled in engine)
  instability_scale_w4: number       // v2.0: 28 (W4-specific instability scale)
  predictability_discount: number    // default 10  (predictability × -N)
  thunder_add: number                // default 5
  ensemble_low_conf_threshold: number // default 55 (%)
  weather_now_cap: number            // v2.0: 42 (was 50)
  w4_time_multiplier: number         // v2.0: 1.5 (W4 14:00–18:00 time window)
}

export interface BufferCoefficients {
  base: number                 // default 0.05
  score_divisor: number        // v2.0: 400 (was 250)
  regime_conf_penalty: number  // v2.0: 0.05 (was 0.04)
  ensemble_penalty: number     // v2.0: 0.10 (was 0.08)
  min: number                  // default 0.05
  max: number                  // v2.0: 0.55 (was 0.40)
}

export interface UIInferThresholds {
  W5_wind_now_kmh: number   // default 28
  W5_gust_p90_kmh: number   // default 39
  W4_rain_prob_pct: number  // default 40
  W3_rain_days: number      // default 15
  W3_rain_prob_pct: number  // default 60
  W2_rain_days: number      // default 10
  W2_rain_prob_pct: number  // default 40
  W1_wind_now_kmh: number   // default 20
  W1_wind_p90_kmh: number   // default 28
}

// v2.0: EDR turbulence thresholds
export interface EDRThreshold {
  min_edr: number
  adj: number
}

// v2.0: G_score sub-dimension configuration
export interface GScoreConfig {
  structural_cap: number           // default 10
  ground_consequence_cap: number   // default 6
  tke_proxy_cap: number            // default 3
  env_interaction_cap: number      // default 4
  total_cap: number                // default 20
}

// v2.0: E_score configuration
export interface EScoreConfig {
  cap: number                      // default 8
  block_points: number             // default 3
  warn_points: number              // default 1.5
}

export type RLevelKey = "R0" | "R1" | "R2" | "R3" | "R4"
export type WRDecision = "go" | "cond" | "nogo"

export interface WeatherRegimeParams {
  version: string
  units: { wind: string; rain_daily_heavy_threshold_mm: number }
  regimes: Record<WCode, RegimeEntry>
  region_weight_table: Record<WCode, Record<RegionKey, number>>
  volatility_buffer_add: Record<WCode, number>
  thresholds: {
    wind_score_table: WindScoreRow[]
    wind_weight_scale: number
    rain_score_rules: {
      rule_0: { rain_prob_lt_pct: number; rain_mmph_lt: number; score: number }
      rule_1: { rain_prob_gte_pct: number; rain_prob_lte_pct: number; or_mmph_gte: number; or_mmph_lte: number; score: number }
      rule_2: { rain_prob_gte_pct: number; rain_prob_lte_pct: number; or_mmph_gte: number; or_mmph_lte: number; score: number }
      rule_3: { rain_prob_gt_pct: number; or_mmph_gt: number; score: number }
    }
    hard_stop: { wind_kmh: number; rain_mmph: number; rain_prob_pct: number; edr_threshold: number }
    mapping_r_level: RLevelRow[]
  }
  wr_matrix: Record<WCode, Record<RLevelKey, WRDecision>>
  weather_now_weights: WeatherNowWeights
  buffer_coefficients: BufferCoefficients
  ui_infer_thresholds: UIInferThresholds
  // ── v2.0 extensions ────────────────────────────────────────────────────────
  edr_thresholds: EDRThreshold[]
  g_score_config: GScoreConfig
  e_score_config: EScoreConfig
  o_score_cap: number
  quote_max_multiplier: number
  w5_typhoon_trend_threshold: number   // default 3.6 (avg annual typhoons)
  w5_typhoon_trend_bonus: number       // default 2
  r4_nogo_threshold: number            // default 92 (R4 score above this = hard NO-GO)
  pricing: PricingParams               // embedded pricing parameters
}

// ─── v1.0 Params (legacy) ───────────────────────────────────────────────────

export const WEATHER_REGIME_PARAMS_V1: WeatherRegimeParams = {
  version: "v1.0",
  units: { wind: "km/h", rain_daily_heavy_threshold_mm: 20 },
  regimes: {
    W0: { name: "穩定高壓晴朗型",     base_score: 3,  volatility_profile: "stable",         instability_weight: 0.8, predictability_weight: -1.0, notes: "最穩定背景；常見低雨低風。" },
    W1: { name: "東北季風型",         base_score: 10, volatility_profile: "windy_stable",    instability_weight: 1.0, predictability_weight: -0.8, notes: "冬季長時間偏強風，迎風面/沿海更嚴格。" },
    W2: { name: "鋒面掃過型",         base_score: 12, volatility_profile: "moving_rain",     instability_weight: 1.1, predictability_weight: -0.6, notes: "降雨系統移動，變動性較高。" },
    W3: { name: "梅雨滯留型",         base_score: 18, volatility_profile: "persistent_rain", instability_weight: 1.2, predictability_weight: -0.3, notes: "連續多日降雨，窗口小且地面濕滑，作業彈性低。" },
    W4: { name: "午後熱對流型",       base_score: 16, volatility_profile: "convective",      instability_weight: 1.3, predictability_weight: -0.2, notes: "局部雷陣雨、突變快，不穩定高。" },
    W5: { name: "颱風外圍環流型",     base_score: 22, volatility_profile: "typhoon_outer",   instability_weight: 1.4, predictability_weight:  0.0, notes: "強風雨不確定性高，需保守。" },
  },
  region_weight_table: {
    W0: { windward: 1.00, leeward: 0.98, coastal: 1.00, rooftop_open: 1.02 },
    W1: { windward: 1.10, leeward: 0.98, coastal: 1.12, rooftop_open: 1.08 },
    W2: { windward: 1.05, leeward: 1.00, coastal: 1.06, rooftop_open: 1.05 },
    W3: { windward: 1.03, leeward: 1.00, coastal: 1.02, rooftop_open: 1.03 },
    W4: { windward: 1.04, leeward: 1.00, coastal: 1.03, rooftop_open: 1.05 },
    W5: { windward: 1.15, leeward: 1.05, coastal: 1.18, rooftop_open: 1.12 },
  },
  volatility_buffer_add: { W0: 0.00, W1: 0.02, W2: 0.03, W3: 0.04, W4: 0.05, W5: 0.06 },
  wr_matrix: {
    W0: { R0: "go",   R1: "go",   R2: "cond", R3: "nogo", R4: "nogo" },
    W1: { R0: "nogo", R1: "go",   R2: "cond", R3: "cond", R4: "nogo" },
    W2: { R0: "nogo", R1: "cond", R2: "cond", R3: "cond", R4: "nogo" },
    W3: { R0: "nogo", R1: "nogo", R2: "cond", R3: "cond", R4: "nogo" },
    W4: { R0: "nogo", R1: "cond", R2: "cond", R3: "cond", R4: "nogo" },
    W5: { R0: "nogo", R1: "nogo", R2: "cond", R3: "cond", R4: "nogo" },
  },
  weather_now_weights: {
    wind: 0.55, rain: 0.35, instability: 0.15,
    instability_scale: 15, instability_scale_w4: 15,
    predictability_discount: 10, thunder_add: 5,
    ensemble_low_conf_threshold: 55,
    weather_now_cap: 50, w4_time_multiplier: 1.0,
  },
  buffer_coefficients: {
    base: 0.05, score_divisor: 250,
    regime_conf_penalty: 0.04, ensemble_penalty: 0.08,
    min: 0.05, max: 0.40,
  },
  ui_infer_thresholds: {
    W5_wind_now_kmh: 28, W5_gust_p90_kmh: 39,
    W4_rain_prob_pct: 40, W3_rain_days: 15, W3_rain_prob_pct: 60,
    W2_rain_days: 10, W2_rain_prob_pct: 40,
    W1_wind_now_kmh: 20, W1_wind_p90_kmh: 28,
  },
  thresholds: {
    wind_score_table: [
      { min_kmh: 0,  max_kmh: 10,  score: 0  },
      { min_kmh: 11, max_kmh: 18,  score: 10 },
      { min_kmh: 19, max_kmh: 25,  score: 20 },
      { min_kmh: 26, max_kmh: 32,  score: 35 },
      { min_kmh: 33, max_kmh: 38,  score: 55 },
      { min_kmh: 39, max_kmh: 999, score: 80 },
    ],
    wind_weight_scale: 0.8,
    rain_score_rules: {
      rule_0: { rain_prob_lt_pct: 20, rain_mmph_lt: 1,  score: 0  },
      rule_1: { rain_prob_gte_pct: 20, rain_prob_lte_pct: 40, or_mmph_gte: 1,  or_mmph_lte: 3,  score: 10 },
      rule_2: { rain_prob_gte_pct: 40, rain_prob_lte_pct: 60, or_mmph_gte: 3,  or_mmph_lte: 10, score: 25 },
      rule_3: { rain_prob_gt_pct: 60, or_mmph_gt: 10, score: 45 },
    },
    hard_stop: { wind_kmh: 39, rain_mmph: 10, rain_prob_pct: 60, edr_threshold: 999 },
    mapping_r_level: [
      { min: 0,  max: 20,  r_level: "R0" },
      { min: 21, max: 40,  r_level: "R1" },
      { min: 41, max: 65,  r_level: "R2" },
      { min: 66, max: 85,  r_level: "R3" },
      { min: 86, max: 100, r_level: "R4" },
    ],
  },
  // v2.0 fields with v1.0-compatible defaults
  edr_thresholds: [],
  g_score_config: { structural_cap: 25, ground_consequence_cap: 0, tke_proxy_cap: 0, env_interaction_cap: 14, total_cap: 25 },
  e_score_config: { cap: 10, block_points: 4, warn_points: 2 },
  o_score_cap: 15,
  quote_max_multiplier: 999,
  w5_typhoon_trend_threshold: 3.6,
  w5_typhoon_trend_bonus: 0,
  r4_nogo_threshold: 86,
  pricing: PRICING_PARAMS_DEFAULT,
}

// ─── v2.0 Params (active) ───────────────────────────────────────────────────

export const WEATHER_REGIME_PARAMS_V2: WeatherRegimeParams = {
  version: "v2.0",
  units: { wind: "km/h", rain_daily_heavy_threshold_mm: 20 },
  regimes: {
    W0: { name: "穩定高壓晴朗型",     base_score: 3,  volatility_profile: "stable",         instability_weight: 0.8, predictability_weight: -1.0, notes: "最穩定背景；常見低雨低風。" },
    W1: { name: "東北季風型",         base_score: 9,  volatility_profile: "windy_stable",    instability_weight: 1.0, predictability_weight: -0.8, notes: "冬季長時間偏強風，迎風面/沿海更嚴格。" },
    W2: { name: "鋒面掃過型",         base_score: 11, volatility_profile: "moving_rain",     instability_weight: 1.1, predictability_weight: -0.6, notes: "降雨系統移動，變動性較高。" },
    W3: { name: "梅雨滯留型",         base_score: 16, volatility_profile: "persistent_rain", instability_weight: 1.2, predictability_weight: -0.3, notes: "連續多日降雨，窗口小且地面濕滑，作業彈性低。" },
    W4: { name: "午後熱對流型",       base_score: 15, volatility_profile: "convective",      instability_weight: 1.3, predictability_weight: -0.2, notes: "局部雷陣雨、突變快，不穩定高。" },
    W5: { name: "颱風外圍環流型",     base_score: 20, volatility_profile: "typhoon_outer",   instability_weight: 1.4, predictability_weight:  0.0, notes: "強風雨不確定性高，需保守。" },
  },
  region_weight_table: {
    W0: { windward: 1.00, leeward: 0.98, coastal: 1.00, rooftop_open: 1.02 },
    W1: { windward: 1.10, leeward: 0.98, coastal: 1.12, rooftop_open: 1.08 },
    W2: { windward: 1.05, leeward: 1.00, coastal: 1.06, rooftop_open: 1.05 },
    W3: { windward: 1.03, leeward: 1.00, coastal: 1.02, rooftop_open: 1.03 },
    W4: { windward: 1.04, leeward: 1.00, coastal: 1.03, rooftop_open: 1.05 },
    W5: { windward: 1.15, leeward: 1.05, coastal: 1.18, rooftop_open: 1.12 },
  },
  volatility_buffer_add: { W0: 0.00, W1: 0.02, W2: 0.03, W3: 0.04, W4: 0.05, W5: 0.06 },
  wr_matrix: {
    W0: { R0: "go",   R1: "go",   R2: "cond", R3: "nogo", R4: "nogo" },
    W1: { R0: "cond", R1: "go",   R2: "cond", R3: "cond", R4: "nogo" },  // [Bug 3] W1/R0: nogo→cond
    W2: { R0: "nogo", R1: "cond", R2: "cond", R3: "cond", R4: "nogo" },
    W3: { R0: "nogo", R1: "nogo", R2: "cond", R3: "cond", R4: "nogo" },
    W4: { R0: "nogo", R1: "cond", R2: "cond", R3: "cond", R4: "nogo" },
    W5: { R0: "nogo", R1: "nogo", R2: "cond", R3: "cond", R4: "nogo" },
  },
  weather_now_weights: {
    wind: 0.55,
    rain: 0.35,
    instability: 0.10,            // [Bug 1] 0.15→0.10, sum now = 1.00
    instability_scale: 20,        // 15→20 (general)
    instability_scale_w4: 28,     // W4-specific: 15→28 (convective amplification)
    predictability_discount: 10,
    thunder_add: 5,
    ensemble_low_conf_threshold: 55,
    weather_now_cap: 42,          // 50→42 (component recalibration)
    w4_time_multiplier: 1.5,      // W4 14:00–18:00 afternoon convection boost
  },
  buffer_coefficients: {
    base: 0.05,
    score_divisor: 400,           // [Bug 6] 250→400
    regime_conf_penalty: 0.05,    // 0.04→0.05
    ensemble_penalty: 0.10,       // 0.08→0.10
    min: 0.05,
    max: 0.55,                    // [Bug 6] 0.40→0.55
  },
  ui_infer_thresholds: {
    W5_wind_now_kmh: 28, W5_gust_p90_kmh: 39,
    W4_rain_prob_pct: 40, W3_rain_days: 15, W3_rain_prob_pct: 60,
    W2_rain_days: 10, W2_rain_prob_pct: 40,
    W1_wind_now_kmh: 20, W1_wind_p90_kmh: 28,
  },
  thresholds: {
    wind_score_table: [
      { min_kmh: 0,  max_kmh: 10,  score: 0  },
      { min_kmh: 11, max_kmh: 18,  score: 10 },
      { min_kmh: 19, max_kmh: 25,  score: 20 },
      { min_kmh: 26, max_kmh: 32,  score: 35 },
      { min_kmh: 33, max_kmh: 38,  score: 55 },
      { min_kmh: 39, max_kmh: 999, score: 80 },
    ],
    wind_weight_scale: 0.8,
    rain_score_rules: {
      rule_0: { rain_prob_lt_pct: 20, rain_mmph_lt: 1,  score: 0  },
      rule_1: { rain_prob_gte_pct: 20, rain_prob_lte_pct: 40, or_mmph_gte: 1,  or_mmph_lte: 3,  score: 10 },
      rule_2: { rain_prob_gte_pct: 40, rain_prob_lte_pct: 60, or_mmph_gte: 3,  or_mmph_lte: 10, score: 25 },
      rule_3: { rain_prob_gt_pct: 60, or_mmph_gt: 10, score: 45 },
    },
    hard_stop: { wind_kmh: 39, rain_mmph: 10, rain_prob_pct: 60, edr_threshold: 0.8 },
    mapping_r_level: [
      { min: 0,  max: 20,  r_level: "R0" },
      { min: 21, max: 40,  r_level: "R1" },
      { min: 41, max: 65,  r_level: "R2" },
      { min: 66, max: 85,  r_level: "R3" },
      { min: 86, max: 100, r_level: "R4" },
    ],
  },
  // ── v2.0 extensions ──────────────────────────────────────────────────────
  edr_thresholds: [
    { min_edr: 0.1, adj: 3 },
    { min_edr: 0.3, adj: 7 },
    { min_edr: 0.5, adj: 12 },
    { min_edr: 0.8, adj: 20 },
  ],
  g_score_config: {
    structural_cap: 10,
    ground_consequence_cap: 6,
    tke_proxy_cap: 3,
    env_interaction_cap: 4,
    total_cap: 20,
  },
  e_score_config: { cap: 8, block_points: 3, warn_points: 1.5 },
  o_score_cap: 12,
  quote_max_multiplier: 4.5,                   // [Bug 8]
  w5_typhoon_trend_threshold: 3.6,
  w5_typhoon_trend_bonus: 2,
  r4_nogo_threshold: 92,                       // [Bug 2] R4 86–92 = COND-D2, >92 = NO-GO
  pricing: PRICING_PARAMS_DEFAULT,
}

// ─── Params Registry (versioned) ──────────────────────────────────────────────

export const PARAM_REGISTRY: Record<string, WeatherRegimeParams> = {
  "v1.0": WEATHER_REGIME_PARAMS_V1,
  "v2.0": WEATHER_REGIME_PARAMS_V2,
}

export const ACTIVE_PARAMS_VERSION = "v2.0"

/**
 * Pure parameter resolver. Takes a version key and an optional override
 * and returns a merged `WeatherRegimeParams`. Does NOT read
 * `localStorage`, `window`, or any other browser-only global. Safe to
 * call from server components, tests, and future package extractions.
 *
 * Merge semantics:
 * - Top-level fields in `override` replace the base field wholesale.
 *   To override a nested object field (e.g. `regimes`, `wr_matrix`,
 *   `thresholds`, `weather_now_weights`), you MUST supply the full
 *   sub-object — any fields you omit will be wiped.
 * - `pricing` is the one exception: it is shallow-merged into the base
 *   pricing defaults, so callers can patch a single pricing field
 *   without redeclaring the whole `PricingParams` shape.
 */
export function resolveParams(
  version: string = ACTIVE_PARAMS_VERSION,
  override?: Partial<WeatherRegimeParams>,
): WeatherRegimeParams {
  const base = PARAM_REGISTRY[version] ?? PARAM_REGISTRY[ACTIVE_PARAMS_VERSION]
  if (!override) return base
  return {
    ...base,
    ...override,
    pricing: { ...base.pricing, ...(override.pricing ?? {}) },
  }
}

/**
 * @deprecated Call `resolveParams()` directly. Retained as a thin pure
 * wrapper so existing imports compile. Returns defaults only — the
 * localStorage override path moved to `src/lib/params-store.ts`.
 */
export function getParams(version: string = ACTIVE_PARAMS_VERSION): WeatherRegimeParams {
  return resolveParams(version)
}

// Keep the named export for backward compatibility
export const WEATHER_REGIME_PARAMS = WEATHER_REGIME_PARAMS_V2
