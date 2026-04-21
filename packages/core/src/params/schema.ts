// LARM WeatherRegimeParams schema — pure region-agnostic parameter shape.
// Note: `pricing` and `quote_max_multiplier` are NOT part of this schema.
// Pricing parameters are owned by app-layer packages. See
// OPEN_SOURCE_DECOUPLING_AUDIT.md §2.4.

import type { RiskLevel } from "../types/index.ts"

// ─── WCode ────────────────────────────────────────────────────────────────────
//
// WCode ("W0"–"W5") is structurally identical to WeatherType in
// packages/core/src/types/index.ts.  We re-declare it here under the name
// used by the parameter schema (WCode) so that callers can import exactly
// the term they need without a confusing alias.

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
  w5_typhoon_trend_threshold: number   // default 3.6 (avg annual typhoons)
  w5_typhoon_trend_bonus: number       // default 2
  r4_nogo_threshold: number            // default 92 (R4 score above this = hard NO-GO)
}

// Re-export RiskLevel for convenience (used in wr_matrix type checks)
export type { RiskLevel }
