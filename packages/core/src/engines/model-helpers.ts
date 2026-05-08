// ─── Shared LARM model helpers ─────────────────────────────────────────────────
//
// These functions were previously duplicated in climate/page.tsx and
// Step5Weather.tsx. They are now the single source of truth, reading
// thresholds from WeatherRegimeParams so the /admin/params UI can override them.

import type {
  WeatherRegimeParams,
  CapeContributionConfig,
  LightningObservationConfig,
  VisibilityObservationConfig,
} from "../params/schema.ts"
import type { WeatherTodayInput, Weather30dInput, WeatherType, RiskLevel } from "../types/index.ts"

/** UI-side W-code inference from a single forecast day + 30-day background.
 *  Reads ui_infer_thresholds from params so adjustments propagate everywhere. */
export function inferWCode(
  today: WeatherTodayInput,
  w30d: Weather30dInput,
  P: WeatherRegimeParams,
): WeatherType {
  const t = P.ui_infer_thresholds
  const wind = today.wind_now_kmh
  const rain  = today.rain_prob_today_pct
  if (wind >= t.W5_wind_now_kmh && (w30d.gust_p90_kmh ?? 0) >= t.W5_gust_p90_kmh) return "W5"
  if (today.thunder_risk === 1 && rain >= t.W4_rain_prob_pct)                       return "W4"
  if (w30d.rain_days_30 >= t.W3_rain_days && rain >= t.W3_rain_prob_pct)            return "W3"
  if (w30d.rain_days_30 >= t.W2_rain_days && rain >= t.W2_rain_prob_pct)            return "W2"
  if (wind >= t.W1_wind_now_kmh && w30d.wind_p90_kmh >= t.W1_wind_p90_kmh)         return "W1"
  return "W0"
}

/** Estimated mission completion probability by risk + W-code.
 *  R0:97%, R1:82%, R2:60%, R3:35%, R4:10%; −3% per W-level.
 *  v2.0: localAdjustment multiplier for region-specific calibration. */
export function completionForRL(rl: RiskLevel, w: WeatherType, localAdjustment = 1.0): number {
  const rIdx = parseInt(rl[1])
  const wIdx = parseInt(w[1])
  const base = [97, 82, 60, 35, 10][rIdx] - wIdx * 3
  return Math.max(5, Math.min(99, Math.round(base * localAdjustment)))
}

/** Look up GO/COND/NOGO from the WR matrix in params. */
export function getWRDecision(
  w: WeatherType,
  r: RiskLevel,
  P: WeatherRegimeParams,
): "go" | "cond" | "nogo" {
  return P.wr_matrix[w][r]
}

/** Simple deterministic risk level from W-code (for UI display without full engine). */
export function simpleRiskFromW(w: WeatherType): RiskLevel {
  const map: Record<WeatherType, RiskLevel> = {
    W0: "R0", W1: "R1", W2: "R1", W3: "R2", W4: "R2", W5: "R3",
  }
  return map[w]
}

/**
 * v2.1 candidate (Unreleased): map cape_jkg (Convective Available Potential
 * Energy, J/kg) to a 0..1 instability-equivalent contribution via piecewise
 * linear interpolation through (lower→0), (mid→mid_value), (upper→upper_value).
 *
 * Returns 0 for null/undefined input or for cape_jkg ≤ lower_breakpoint
 * (engine fallback to weather_30d.instability_index alone — bit-identical
 * v2.0 behaviour). Returns upper_value for cape_jkg ≥ upper_breakpoint.
 *
 * See spec §5.2.7 and docs/superpowers/plans/data-expansion-v2.1.md §5.1.
 */
export function capeToInstabilityContribution(
  cape_jkg: number | null | undefined,
  cfg: CapeContributionConfig,
): number {
  if (cape_jkg == null || cape_jkg <= cfg.lower_breakpoint) return 0
  if (cape_jkg >= cfg.upper_breakpoint) return cfg.upper_value
  if (cape_jkg <= cfg.mid_breakpoint) {
    const frac = (cape_jkg - cfg.lower_breakpoint) / (cfg.mid_breakpoint - cfg.lower_breakpoint)
    return frac * cfg.mid_value
  }
  const frac = (cape_jkg - cfg.mid_breakpoint) / (cfg.upper_breakpoint - cfg.mid_breakpoint)
  return cfg.mid_value + frac * (cfg.upper_value - cfg.mid_value)
}

/**
 * v2.1 candidate (Unreleased): does observed lightning force thunder_risk to 1?
 * Returns true iff strikes is non-null and ≥ thunder_force_threshold. Used by
 * the WeatherNow engine path to override the forecast-layer thunder_risk with
 * ground-truth observation. See spec §5.6.1.
 */
export function lightningForcesThunderRisk(
  strikes: number | null | undefined,
  cfg: LightningObservationConfig,
): boolean {
  return strikes != null && strikes >= cfg.thunder_force_threshold
}

/**
 * v2.1 candidate (Unreleased): tiered direct adder applied to risk_score after
 * component aggregation but before clamp/r_level mapping. Returns 0 for
 * null/undefined or sub-threshold strike counts. Capped above by `max_adj`
 * (defends against single-channel saturation). See spec §5.6.2.
 *
 * Tier mapping (defaults: thunder_force_threshold=1, tier_1_max_exclusive=3,
 *                         tier_2_max_exclusive=10, tier_*_adj=8/15/20, max_adj=25):
 *   strikes < thunder_force_threshold  → 0
 *   strikes < tier_1_max_exclusive     → tier_1_adj
 *   strikes < tier_2_max_exclusive     → tier_2_adj
 *   strikes ≥ tier_2_max_exclusive     → tier_3_adj  (capped at max_adj)
 *
 * Note on boundary semantics: `_max_exclusive` means strikes equal to the
 * threshold fall into the NEXT tier. `tier_1_max_exclusive=3, strikes=3`
 * → tier 2, not tier 1.
 */
export function lightningTierAdj(
  strikes: number | null | undefined,
  cfg: LightningObservationConfig,
): number {
  if (strikes == null || strikes < cfg.thunder_force_threshold) return 0
  let adj: number
  if (strikes < cfg.tier_1_max_exclusive)      adj = cfg.tier_1_adj
  else if (strikes < cfg.tier_2_max_exclusive) adj = cfg.tier_2_adj
  else                                         adj = cfg.tier_3_adj
  return Math.min(cfg.max_adj, adj)
}

/**
 * v2.1 candidate (Unreleased): does observed visibility trigger the
 * VLOS hard-stop gate? Returns true iff visibility_m is non-null and
 * strictly less than the configured minimum. Used by the gating engine
 * path to short-circuit to NO_GO with a visibility-named control.
 *
 * When `visibility_m_min` is undefined on the params record (e.g. older
 * region-adapter literals), the gate is a no-op — returns false.
 *
 * See spec §7.1 (Unreleased).
 */
export function visibilityForcesNoGo(
  visibility_m: number | null | undefined,
  visibility_m_min: number | undefined,
): boolean {
  if (visibility_m == null || visibility_m_min == null) return false
  return visibility_m < visibility_m_min
}

/**
 * v2.1 candidate (Unreleased): tiered direct adder applied to risk_score
 * after component aggregation but before clamp/r_level mapping. Returns
 * 0 for null/undefined or healthy visibility. Capped above by max_adj
 * (defends against single-channel saturation). See spec §5.7.
 *
 * Tier mapping (defaults: healthy_min=5000, marginal_min=3000, poor_min=1500,
 *                         marginal_adj=5, poor_adj=10, max_adj=15):
 *   null OR visibility_m ≥ healthy_min   → 0
 *   visibility_m ≥ marginal_min          → marginal_adj
 *   visibility_m ≥ poor_min              → poor_adj
 *   visibility_m < poor_min              → poor_adj  (defensive — gate
 *                                                     normally fires first)
 *
 * Boundary semantics: lower-bound inclusive (`≥`), parallel to
 * edr_thresholds. visibility_m == healthy_min returns 0 (healthy band).
 */
export function visibilityTierAdj(
  visibility_m: number | null | undefined,
  cfg: VisibilityObservationConfig,
): number {
  if (visibility_m == null || visibility_m >= cfg.healthy_min) return 0
  let adj: number
  if (visibility_m >= cfg.marginal_min) adj = cfg.marginal_adj
  else                                  adj = cfg.poor_adj
  return Math.min(cfg.max_adj, adj)
}
