// Taiwan calibration for LARM v1.0. Retained for back-compat against
// operators calibrated on the earlier schema. Not recommended for new
// deployments — use TAIWAN_PARAMS_V2_0 (active) instead.

import type { WeatherRegimeParams } from "@openlarm/core"

export const TAIWAN_PARAMS_V1_0: WeatherRegimeParams = {
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
  g_score_config: {
    structural_cap: 25, ground_consequence_cap: 0, tke_proxy_cap: 0,
    env_interaction_cap: 14, total_cap: 25,
    env_hazards_cap: 3,
    env_hazard_points: { near_hv_power: 3, near_base_station: 1, narrow_clearance: 2 },
  },
  e_score_config: { cap: 10, block_points: 4, warn_points: 2 },
  o_score_cap: 15,
  o_score_flag_points: {
    night: 5,
    weekend: 2,
    road_closure: 3,
    urgent_critical: 5,
    urgent_warn: 3,
    urgent_critical_max_days: 3,
    urgent_warn_max_days: 7,
    crowd_high: 3,
    crowd_medium: 2,
    operator_junior: 2,
    operator_mid: 0,
    operator_senior: 0,
    long_mission_critical: 3,
    long_mission_warn: 2,
    long_mission_critical_min_days: 7,
    long_mission_warn_min_days: 4,
  },
  // v2.1 candidate (Unreleased): CAPE-driven instability contribution.
  // v1.0 inputs won't carry cape_jkg, but the param block must exist so the
  // engine doesn't crash when v1.0 params are passed.
  cape_contribution_config: {
    lower_breakpoint: 500,
    mid_breakpoint: 1500,
    upper_breakpoint: 2500,
    mid_value: 0.4,
    upper_value: 0.8,
  },
  w5_typhoon_trend_threshold: 3.6,
  w5_typhoon_trend_bonus: 0,
  r4_nogo_threshold: 86,
}
