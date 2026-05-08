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
  env_interaction_cap: number      // default 4 — outer cap on env_score + interaction_capped
  // v2.1: inner env_raw cap and per-hazard point values (RFC Recommendation A)
  env_hazards_cap: number          // default 3 — inner cap on env_raw before interaction
  env_hazard_points: {
    near_hv_power: number          // default 3
    near_base_station: number      // default 1
    narrow_clearance: number       // default 2 (added when clearance_m < 5)
  }
  total_cap: number                // default 20
}

// v2.0: E_score configuration
export interface EScoreConfig {
  cap: number                      // default 8
  block_points: number             // default 3
  warn_points: number              // default 1.5
}

// v2.1: O_score per-flag points and thresholds (param-ized v2.0 literals)
export interface OScoreFlagPoints {
  night: number                          // default 5
  weekend: number                        // default 2
  road_closure: number                   // default 3
  urgent_critical: number                // default 5
  urgent_warn: number                    // default 3
  urgent_critical_max_days: number       // default 3 (urgent_days <= this)
  urgent_warn_max_days: number           // default 7 (urgent_days <= this)
  crowd_high: number                     // default 3
  crowd_medium: number                   // default 2
  operator_junior: number                // default 2
  operator_mid: number                   // default 0
  operator_senior: number                // default 0
  long_mission_critical: number          // default 3
  long_mission_warn: number              // default 2
  long_mission_critical_min_days: number // default 7 (mission_days >= this)
  long_mission_warn_min_days: number     // default 4 (mission_days >= this)
}

// v2.1 candidate (Unreleased): lightning-observation contribution config.
// Two mechanisms feed off this single config block:
//   (A) thunder_force_threshold — observed strikes ≥ this overrides
//       weather_today.thunder_risk to 1, activating thunder_add in WeatherNow.
//   (B) tier_*_max_exclusive + tier_*_adj — piecewise tier adder applied to
//       risk_score AFTER component aggregation but BEFORE clamp/r_level mapping.
//       Bounded above by max_adj (defends against single-channel saturation).
// See spec §5.6 (Unreleased) and docs/superpowers/plans/data-expansion-v2.1.md §5.2.
export interface LightningObservationConfig {
  thunder_force_threshold: number   // strikes count to force thunder_risk=1 (default 1)
  tier_1_max_exclusive: number       // strikes < this → tier 1 (default 3)
  tier_2_max_exclusive: number       // strikes < this → tier 2; ≥ this → tier 3 (default 10)
  tier_1_adj: number                 // points added in tier 1 (default 8)
  tier_2_adj: number                 // points added in tier 2 (default 15)
  tier_3_adj: number                 // points added in tier 3 (default 20)
  max_adj: number                    // cap on the contribution (default 25)
}

// v2.1 candidate (Unreleased): visibility-observation contribution config.
// Two channels feed off two separate config blocks:
//   (Channel 1) thresholds.hard_stop.visibility_m_min — gate. Distinct
//       from this block because it lives in the existing hard-stop record.
//   (Channel 2) the tier adder below — applied to risk_score AFTER
//       component aggregation but BEFORE clamp/r_level mapping.
//
// Tier semantics (defaults: healthy_min=5000, marginal_min=3000, poor_min=1500):
//   visibility_m == null OR ≥ healthy_min  → 0
//   visibility_m ≥ marginal_min            → marginal_adj  (+5)
//   visibility_m ≥ poor_min                → poor_adj      (+10)
//   (visibility_m < poor_min is unreachable from this helper because
//    the gate at thresholds.hard_stop.visibility_m_min returns NO_GO
//    first; the tier helper returns poor_adj for that range as a
//    defensive default in case a region adapter sets visibility_m_min
//    below poor_min.)
//
// Bounded above by max_adj. See spec §5.7 (Unreleased) and
// docs/superpowers/plans/data-expansion-v2.1.md §5.3.
export interface VisibilityObservationConfig {
  healthy_min: number    // metres at/above which contribution = 0  (default 5000)
  marginal_min: number   // metres at/above which contribution = marginal_adj (default 3000)
  poor_min: number       // metres at/above which contribution = poor_adj (default 1500)
  marginal_adj: number   // points added in marginal band  (default 5)
  poor_adj: number       // points added in poor band      (default 10)
  max_adj: number        // cap on the contribution        (default 15)
}

// v2.1 candidate (Unreleased): CAPE-driven instability contribution config.
// Piecewise-linear mapping from cape_jkg (J/kg) to a 0..1 instability-equivalent
// value, additively combined with weather_30d.instability_index in the engine
// via `effective_instability = min(1, instability_index + cape_contrib)`.
// See spec §5.2.7 (Unreleased) and docs/superpowers/plans/data-expansion-v2.1.md §5.1.
export interface CapeContributionConfig {
  lower_breakpoint: number  // J/kg below which contribution = 0 (default 500)
  mid_breakpoint: number    // J/kg where contribution = mid_value     (default 1500)
  upper_breakpoint: number  // J/kg at/above which contribution = upper_value (default 2500)
  mid_value: number         // contribution at mid_breakpoint, 0..1    (default 0.4)
  upper_value: number       // contribution at upper_breakpoint, 0..1  (default 0.8)
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
    hard_stop: { wind_kmh: number; rain_mmph: number; rain_prob_pct: number; edr_threshold: number; visibility_m_min?: number }
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
  o_score_flag_points: OScoreFlagPoints
  // v2.1 candidate (Unreleased)
  cape_contribution_config: CapeContributionConfig
  lightning_observation_config: LightningObservationConfig
  visibility_observation_config: VisibilityObservationConfig
  w5_typhoon_trend_threshold: number   // default 3.6 (avg annual typhoons)
  w5_typhoon_trend_bonus: number       // default 2
  r4_nogo_threshold: number            // default 92 (R4 score above this = hard NO-GO)
}

// Re-export RiskLevel for convenience (used in wr_matrix type checks)
export type { RiskLevel }
