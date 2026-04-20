// ─── Shared LARM model helpers ─────────────────────────────────────────────────
//
// These functions were previously duplicated in climate/page.tsx and
// Step5Weather.tsx. They are now the single source of truth, reading
// thresholds from WeatherRegimeParams so the /admin/params UI can override them.

import { getParams } from "./weather-regime-params"
import type { WeatherRegimeParams } from "./weather-regime-params"
import type { WeatherTodayInput, Weather30dInput, WeatherType, RiskLevel } from "../types"

/** UI-side W-code inference from a single forecast day + 30-day background.
 *  Reads ui_infer_thresholds from params so adjustments propagate everywhere. */
export function inferWCode(
  today: WeatherTodayInput,
  w30d: Weather30dInput,
  P?: WeatherRegimeParams,
): WeatherType {
  const t = (P ?? getParams()).ui_infer_thresholds
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
  P?: WeatherRegimeParams,
): "go" | "cond" | "nogo" {
  return (P ?? getParams()).wr_matrix[w][r]
}

/** Simple deterministic risk level from W-code (for UI display without full engine). */
export function simpleRiskFromW(w: WeatherType): RiskLevel {
  const map: Record<WeatherType, RiskLevel> = {
    W0: "R0", W1: "R1", W2: "R1", W3: "R2", W4: "R2", W5: "R3",
  }
  return map[w]
}
