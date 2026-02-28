// LARM v1.0 — Weather Regime Parameters
// Corresponds to weather_regime_params_v1.json

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
  instability: number                // default 0.15
  instability_scale: number          // default 15  (instability_index × N)
  predictability_discount: number    // default 10  (predictability × -N)
  thunder_add: number                // default 5
  ensemble_low_conf_threshold: number // default 55 (%)
}

export interface BufferCoefficients {
  base: number                 // default 0.05
  score_divisor: number        // default 250
  regime_conf_penalty: number  // default 0.04
  ensemble_penalty: number     // default 0.08
  min: number                  // default 0.05
  max: number                  // default 0.40
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
    hard_stop: { wind_kmh: number; rain_mmph: number; rain_prob_pct: number }
    mapping_r_level: RLevelRow[]
  }
  // ── v1.1 extensions ────────────────────────────────────────────────────────
  wr_matrix: Record<WCode, Record<RLevelKey, WRDecision>>
  weather_now_weights: WeatherNowWeights
  buffer_coefficients: BufferCoefficients
  ui_infer_thresholds: UIInferThresholds
}

const WEATHER_REGIME_PARAMS_V1: WeatherRegimeParams = {
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
    wind: 0.55,
    rain: 0.35,
    instability: 0.15,
    instability_scale: 15,
    predictability_discount: 10,
    thunder_add: 5,
    ensemble_low_conf_threshold: 55,
  },
  buffer_coefficients: {
    base: 0.05,
    score_divisor: 250,
    regime_conf_penalty: 0.04,
    ensemble_penalty: 0.08,
    min: 0.05,
    max: 0.40,
  },
  ui_infer_thresholds: {
    W5_wind_now_kmh: 28,
    W5_gust_p90_kmh: 39,
    W4_rain_prob_pct: 40,
    W3_rain_days: 15,
    W3_rain_prob_pct: 60,
    W2_rain_days: 10,
    W2_rain_prob_pct: 40,
    W1_wind_now_kmh: 20,
    W1_wind_p90_kmh: 28,
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
    hard_stop: { wind_kmh: 39, rain_mmph: 10, rain_prob_pct: 60 },
    mapping_r_level: [
      { min: 0,  max: 20,  r_level: "R0" },
      { min: 21, max: 40,  r_level: "R1" },
      { min: 41, max: 65,  r_level: "R2" },
      { min: 66, max: 85,  r_level: "R3" },
      { min: 86, max: 100, r_level: "R4" },
    ],
  },
}

// ─── Params Registry (versioned) ──────────────────────────────────────────────

export const PARAM_REGISTRY: Record<string, WeatherRegimeParams> = {
  "v1.0": WEATHER_REGIME_PARAMS_V1,
}

export const ACTIVE_PARAMS_VERSION = "v1.0"

export function getParams(version: string = ACTIVE_PARAMS_VERSION): WeatherRegimeParams {
  return PARAM_REGISTRY[version] ?? PARAM_REGISTRY[ACTIVE_PARAMS_VERSION]
}

// Keep the named export for backward compatibility
export const WEATHER_REGIME_PARAMS = WEATHER_REGIME_PARAMS_V1
