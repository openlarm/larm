// LARM v2.0 — Low Altitude Risk Model
// R_score = Base(W) + WeatherNow + G + O + E  →  R_level + gating + buffer_ratio
// v2.0: SORA 2.5 GRC integration, EDR turbulence, component recalibration

import type {
  WeatherType, RiskLevel, Decision, Complexity,
  CrowdDensity, Weather30dInput, WeatherTodayInput,
  BuildingSiteInput, OperationalContextInput, LARMInput,
  RiskResult, RiskExplanation, LARMVersions,
  RegionExposure, WeatherRegimeResult, Equipment,
  PopulationDensityClass,
} from "../types/index.ts"
import { resolveParams } from "../params/merge.js"
import { ACTIVE_PARAMS_VERSION } from "../params/registry.js"
import type { WeatherRegimeParams } from "../params/schema.ts"

// ─── Options type ─────────────────────────────────────────────────────────────

/**
 * Options for `evaluateRisk()`. All fields are optional; passing `{}`
 * or omitting the argument uses `resolveParams()` defaults and
 * `new Date()` for `evaluated_at`.
 *
 * Explicitly supply `params` to turn `evaluateRisk` into a pure
 * transformation of input + params; supply `clock` for deterministic
 * timestamps in tests.
 */
export interface EvaluateRiskOptions {
  /** Explicit merged params. If omitted, resolveParams() defaults are used. */
  params?: WeatherRegimeParams
  /** Clock for deterministic `evaluated_at`. Defaults to () => new Date(). */
  clock?: () => Date
  /** Optional param-version selector; ignored when `params` is supplied. */
  paramsVersion?: string
}

const defaultClock: () => Date = () => new Date()

function resolveOrThrow(version?: string): WeatherRegimeParams {
  const p = resolveParams(version ?? ACTIVE_PARAMS_VERSION)
  if (!p) {
    throw new Error(
      `@openlarm/core: no params registered for version "${version ?? ACTIVE_PARAMS_VERSION}". ` +
      `Either import a region adapter (e.g. @openlarm/regions-taiwan) before calling evaluateRisk, ` +
      `or pass an explicit options.params.`,
    )
  }
  return p
}

// ─── Step A: Climate Regime Classification (with confidence) ──────────────────

function classifyWeatherRegimeWithParams(
  w30: Weather30dInput,
  today: WeatherTodayInput,
  override: WeatherType | undefined,
  P: WeatherRegimeParams,
  recentTyphoonCount: number | null | undefined,
): WeatherRegimeResult & { adjusted_base: number } {
  if (override) {
    return { w_code: override, confidence: 1.0, secondary_w: null, adjusted_base: P.regimes[override].base_score }
  }
  const { wind_p90_kmh, gust_p90_kmh, rain_days_30, heavy_rain_days_30, instability_index, predictability_score } = w30
  const matches: WeatherType[] = []
  if (wind_p90_kmh >= 39 || (gust_p90_kmh != null && gust_p90_kmh >= 50)) matches.push("W5")
  if (rain_days_30 >= 15 && heavy_rain_days_30 >= 3) matches.push("W3")
  if (instability_index >= 0.70 && heavy_rain_days_30 >= 2) matches.push("W4")
  if (wind_p90_kmh >= 33 && predictability_score >= 0.60) matches.push("W1")
  if (rain_days_30 >= 8 && rain_days_30 <= 14 && predictability_score < 0.55) matches.push("W2")
  const primary: WeatherType = matches[0] ?? "W0"
  const secondary: WeatherType | null = matches[1] ?? null
  const confidence = matches.length <= 1 ? 1.0 :
    matches.length === 2 ? 0.78 :
    matches.length === 3 ? 0.62 : 0.50
  let adjustedBase = P.regimes[primary].base_score
  if (primary === "W5" && recentTyphoonCount != null && recentTyphoonCount > P.w5_typhoon_trend_threshold) {
    adjustedBase += P.w5_typhoon_trend_bonus
  }
  void today
  return { w_code: primary, confidence, secondary_w: secondary, adjusted_base: adjustedBase }
}

// ─── Step B.1: WeatherNow Component (0..42) ───────────────────────────────────

function getWindScore(kmh: number, P: WeatherRegimeParams): number {
  for (const row of P.thresholds.wind_score_table) {
    if (kmh >= row.min_kmh && kmh <= row.max_kmh) return row.score
  }
  return 80
}

function getRainScore(prob: number, mmph: number, P: WeatherRegimeParams): number {
  const r = P.thresholds.rain_score_rules
  if (prob < r.rule_0.rain_prob_lt_pct && mmph < r.rule_0.rain_mmph_lt) return 0
  if (prob > r.rule_3.rain_prob_gt_pct || mmph > r.rule_3.or_mmph_gt)   return r.rule_3.score
  if (
    (prob >= r.rule_2.rain_prob_gte_pct && prob <= r.rule_2.rain_prob_lte_pct) ||
    (mmph >= r.rule_2.or_mmph_gte       && mmph <= r.rule_2.or_mmph_lte)
  ) return r.rule_2.score
  if (
    (prob >= r.rule_1.rain_prob_gte_pct && prob <= r.rule_1.rain_prob_lte_pct) ||
    (mmph >= r.rule_1.or_mmph_gte       && mmph <= r.rule_1.or_mmph_lte)
  ) return r.rule_1.score
  return 0
}

function computeEDRAdj(edr: number | null | undefined, P: WeatherRegimeParams): number {
  if (edr == null) return 0
  let adj = 0
  for (const t of P.edr_thresholds) {
    if (edr >= t.min_edr) adj = t.adj
  }
  return adj
}

function computeWeatherNow(
  today: WeatherTodayInput,
  w30: Weather30dInput,
  w_code: WeatherType,
  region_exposure: RegionExposure | null | undefined,
  expl: RiskExplanation[],
  P: WeatherRegimeParams,
): { score: number; edr_adj: number } {
  const wts = P.weather_now_weights
  const cap = wts.weather_now_cap

  // Low-confidence conservative mechanism: use P90 wind
  const confThreshold = wts.ensemble_low_conf_threshold
  const lowConfidence = today.forecast_confidence != null && today.forecast_confidence < confThreshold
  const effectiveWindKmh =
    lowConfidence && today.wind_p90_kmh != null
      ? today.wind_p90_kmh
      : today.wind_now_kmh
  const windScore  = getWindScore(effectiveWindKmh, P)
  const windComp   = Math.min(50, windScore * P.thresholds.wind_weight_scale)
  const rainScore  = getRainScore(today.rain_prob_today_pct, today.rain_mmph_forecast, P)

  // v2.0: W4-specific instability scale
  const instScale = w_code === "W4" ? wts.instability_scale_w4 : wts.instability_scale
  const instComp   = w30.instability_index * instScale
  const predDisc   = -(w30.predictability_score * wts.predictability_discount)
  const thunder    = today.thunder_risk === 1 ? wts.thunder_add : 0

  // v2.0: EDR turbulence adjustment
  const edrAdj = computeEDRAdj(today.edr, P)

  // v2.0: weights sum to 1.00 (0.55 + 0.35 + 0.10)
  const raw = wts.wind * windComp + wts.rain * rainScore + wts.instability * instComp
    + predDisc + thunder + edrAdj

  // Region exposure weight
  let regionWeight = 1.0
  if (region_exposure) {
    regionWeight = (P.region_weight_table[w_code] as Record<string, number>)[region_exposure] ?? 1.0
  }

  // v2.0: W4 afternoon time-of-day multiplier (14:00–18:00)
  let timeMultiplier = 1.0
  if (w_code === "W4" && today.local_hour != null && today.local_hour >= 14 && today.local_hour < 18) {
    timeMultiplier = wts.w4_time_multiplier
  }

  const wn = Math.max(0, Math.min(cap, raw * regionWeight * timeMultiplier))

  // Explanations
  const windNote = lowConfidence
    ? `P90保守值 ${effectiveWindKmh} km/h (信心${today.forecast_confidence}%<${confThreshold}%)`
    : `wind_score=${windScore} ×0.8 ×0.55`
  expl.push({ factor: "風速", value: `${effectiveWindKmh} km/h`, score: Math.round(wts.wind * windComp * 10) / 10, note: windNote })
  expl.push({ factor: "降雨", value: `${today.rain_prob_today_pct}% / ${today.rain_mmph_forecast} mm/h`, score: Math.round(wts.rain * rainScore * 10) / 10, note: `rain_score=${rainScore} ×${wts.rain}` })
  expl.push({ factor: "不穩定指數", value: w30.instability_index.toFixed(2), score: Math.round(wts.instability * instComp * 10) / 10, note: `×${instScale} ×${wts.instability}${w_code === "W4" ? " (W4增強)" : ""}` })
  expl.push({ factor: "預測性折扣", value: w30.predictability_score.toFixed(2), score: Math.round(predDisc * 10) / 10, note: `predictability×(-10)` })
  if (thunder > 0) expl.push({ factor: "雷雨加成", value: 1, score: thunder, note: "+5" })
  if (edrAdj > 0) expl.push({ factor: "EDR湍流修正", value: today.edr?.toFixed(2) ?? "N/A", score: edrAdj, note: `EDR=${today.edr} → +${edrAdj}` })
  if (region_exposure && regionWeight !== 1.0) {
    expl.push({ factor: "地形曝露乘數", value: region_exposure, score: 0, note: `×${regionWeight} (${w_code})` })
  }
  if (timeMultiplier > 1.0) {
    expl.push({ factor: "W4午後加成", value: `${today.local_hour}:00`, score: 0, note: `14–18時 ×${timeMultiplier}` })
  }

  return { score: Math.round(wn * 10) / 10, edr_adj: edrAdj }
}

// ─── Step B.2: G_score — Ground/Site Score (0..20) ──────────────────────────

function computeGScore(
  b: BuildingSiteInput,
  currentWindKmh: number,
  expl: RiskExplanation[],
  P: WeatherRegimeParams,
): { total: number; ground_consequence: number; tke_proxy: number } {
  const cfg = P.g_score_config

  // Sub-dimension 1: Structural (cap 10)
  const floors = b.building_floors ?? (b.building_height_m ? Math.round(b.building_height_m / 3.2) : 0)
  const heightScore = floors > 30 ? 8 : floors > 20 ? 6 : floors > 10 ? 3 : 0
  const altScore = b.site_altitude_m > 800 ? 5 : b.site_altitude_m > 300 ? 3 : b.site_altitude_m > 100 ? 1 : 0
  const complexityMap: Record<Complexity, number> = { light: 2, medium: 4, heavy: 6 }
  const complexityScore = complexityMap[b.facade_complexity] ?? 0
  const structural = Math.min(cfg.structural_cap, heightScore + altScore + complexityScore)

  // Sub-dimension 2: Ground Consequence — SORA 2.5 iGRC (cap 6)
  const popDensity = b.population_density_class ?? "residential"
  const popMap: Record<PopulationDensityClass, number> = {
    assembly: 6, high_urban: 4, residential: 2, light: 1, isolated: 0,
  }
  let groundConsequence = popMap[popDensity] ?? 2

  // M1 mitigations (SORA 2.5 M1A/M1B/M1C)
  const mitigations = b.sora_mitigations ?? []
  const m1Reduction = mitigations.filter(m => m === "M1A" || m === "M1B" || m === "M1C").length
  groundConsequence = Math.max(0, Math.min(cfg.ground_consequence_cap, groundConsequence - m1Reduction))

  // Sub-dimension 3: TKE Proxy (cap 3)
  const floorTkeFactor = floors > 30 ? 0.8 : floors > 20 ? 1.2 : floors > 10 ? 1.0 : 0.5
  const tkeWindF = Math.sqrt(Math.max(0, currentWindKmh) / 10)
  const tkeCorridorF = b.wind_channel_effect === 1 ? 1.4 : 1.0
  const tkeProxy = Math.min(cfg.tke_proxy_cap, Math.floor(floorTkeFactor * tkeWindF * tkeCorridorF))

  // Sub-dimension 4: Environment Hazards + Interaction (cap 4)
  let envRaw = 0
  if (b.near_hv_power === 1)       envRaw += 3
  if (b.near_base_station === 1)   envRaw += 1
  if (b.clearance_m != null && b.clearance_m < 5) envRaw += 2
  const envScore = Math.min(3, envRaw)

  let interaction = 0
  if (floors > 20 && b.wind_channel_effect === 1) interaction += 2
  if ((b.site_altitude_m ?? 0) > 300 && b.clearance_m != null && b.clearance_m < 5) interaction += 2
  const interactionCapped = Math.min(2, interaction)
  const envInteraction = Math.min(cfg.env_interaction_cap, envScore + interactionCapped)

  const total = Math.min(cfg.total_cap, structural + groundConsequence + tkeProxy + envInteraction)

  // Explanations
  expl.push({ factor: "建物樓層", value: `${floors}F`, score: heightScore, note: "≤10:0 / ≤20:+3 / ≤30:+6 / >30:+8" })
  expl.push({ factor: "場址海拔", value: `${b.site_altitude_m}m`, score: altScore, note: "≤100:0 / ≤300:+1 / ≤800:+3 / >800:+5" })
  expl.push({ factor: "立面複雜度", value: b.facade_complexity, score: complexityScore, note: "light:+2 / medium:+4 / heavy:+6" })
  if (groundConsequence > 0) {
    expl.push({ factor: "地面後果(SORA GRC)", value: popDensity, score: groundConsequence, note: `人口密度=${popDensity}, M1減免=${m1Reduction}（上限${cfg.ground_consequence_cap}）` })
  }
  if (tkeProxy > 0) {
    expl.push({ factor: "TKE代理因子", value: `${tkeProxy}`, score: tkeProxy, note: `floor=${floorTkeFactor.toFixed(1)} × wind=${tkeWindF.toFixed(1)} × corridor=${tkeCorridorF}（上限${cfg.tke_proxy_cap}）` })
  }
  if (envScore > 0) {
    const parts: string[] = []
    if (b.near_hv_power === 1) parts.push("高壓電+3")
    if (b.near_base_station === 1) parts.push("基地台+1")
    if (b.clearance_m != null && b.clearance_m < 5) parts.push(`狹窄${b.clearance_m}m+2`)
    expl.push({ factor: "環境危害", value: envRaw, score: envScore, note: parts.join(", ") + "（上限3）" })
  }
  if (interactionCapped > 0) {
    const parts: string[] = []
    if (floors > 20 && b.wind_channel_effect === 1) parts.push("高樓×風道+2")
    if ((b.site_altitude_m ?? 0) > 300 && b.clearance_m != null && b.clearance_m < 5) parts.push("山區×狹窄+2")
    expl.push({ factor: "交互風險加成", value: interaction, score: interactionCapped, note: parts.join(", ") + "（上限2）" })
  }

  return { total, ground_consequence: groundConsequence, tke_proxy: tkeProxy }
}

// ─── Step B.3: Operational Score (0..12) ─────────────────────────────────────

function computeOperationalScore(
  ops: OperationalContextInput,
  crowd_density: CrowdDensity | null,
  expl: RiskExplanation[],
  P: WeatherRegimeParams,
): number {
  const parts: string[] = []
  let score = 0

  if (ops.time_window === "night")                { score += 5; parts.push("夜間+5") }
  if (ops.weekend === 1)                          { score += 2; parts.push("週末+2") }
  if (ops.road_closure_needed === 1)              { score += 3; parts.push("封路+3") }
  if (ops.urgent_days != null) {
    const pts = ops.urgent_days <= 3 ? 5 : ops.urgent_days <= 7 ? 3 : 0
    if (pts > 0) { score += pts; parts.push(`急件(${ops.urgent_days}d)+${pts}`) }
  }
  if (crowd_density === "high")                   { score += 3; parts.push("高人流+3") }
  else if (crowd_density === "medium")            { score += 2; parts.push("中人流+2") }
  if (ops.operator_experience_level === "junior") { score += 2; parts.push("初級操作員+2") }

  // Personnel fatigue
  if (ops.mission_days != null) {
    const fatigue = ops.mission_days >= 7 ? 3 : ops.mission_days >= 4 ? 2 : 0
    if (fatigue > 0) { score += fatigue; parts.push(`長工期疲勞(${ops.mission_days}天)+${fatigue}`) }
  }

  const total = Math.min(P.o_score_cap, score)
  if (parts.length > 0) expl.push({ factor: "作業情境", value: parts.join(" / "), score: total, note: `上限 ${P.o_score_cap}` })
  return total
}

// ─── Step E: Equipment Reliability Score (0..8) ─────────────────────────────

function computeEquipmentScore(
  equipment: Equipment[],
  expl: RiskExplanation[],
  P: WeatherRegimeParams,
): number {
  if (equipment.length === 0) return 0

  const eCfg = P.e_score_config
  let score = 0
  const parts: string[] = []

  for (const eq of equipment) {
    if (eq.health_status === "block") {
      score += eCfg.block_points
      parts.push(`${eq.name}:Block+${eCfg.block_points}`)
    } else if (eq.health_status === "warn") {
      score += eCfg.warn_points
      parts.push(`${eq.name}:Warn+${eCfg.warn_points}`)
    }
  }

  const capped = Math.min(eCfg.cap, score)
  if (capped > 0) {
    expl.push({ factor: "設備可靠度(E)", value: `${equipment.length} 件`, score: capped, note: parts.join(", ") + `（上限${eCfg.cap}）` })
  }
  return capped
}

// ─── Score → R_level ──────────────────────────────────────────────────────────

function mapToRLevel(score: number, P: WeatherRegimeParams): RiskLevel {
  for (const row of P.thresholds.mapping_r_level) {
    if (score >= row.min && score <= row.max) return row.r_level as RiskLevel
  }
  return "R4"
}

// ─── Internal Grade (v2.0: D split into D1/D2) ─────────────────────────────

function getInternalGrade(r: RiskLevel): "A" | "B" | "C" | "D1" | "D2" {
  return ({ R0: "A", R1: "B", R2: "C", R3: "D1", R4: "D2" } as const)[r]
}

// ─── Hard Stops + Gating with CONDITIONAL tiers ───────────────────────────────

function computeGating(
  risk_level: RiskLevel,
  risk_score: number,
  today: WeatherTodayInput,
  building: BuildingSiteInput,
  ops: OperationalContextInput,
  w_code: WeatherType,
  e_score: number,
  P: WeatherRegimeParams,
): { decision: Decision; requires_approval: boolean; controls: string[]; conditional_tier: "A" | "C" | "D1" | "D2" | null } {
  const hs = P.thresholds.hard_stop

  // Hard stops (highest priority, non-overridable)
  if (today.wind_now_kmh >= hs.wind_kmh) {
    return { decision: "NO_GO", requires_approval: false, conditional_tier: null, controls: [`當前風速 ${today.wind_now_kmh} km/h ≥ 上限 ${hs.wind_kmh} km/h，禁止起飛`] }
  }
  if (today.rain_mmph_forecast > hs.rain_mmph && today.rain_prob_today_pct > hs.rain_prob_pct) {
    return { decision: "NO_GO", requires_approval: false, conditional_tier: null, controls: [`大雨 ${today.rain_mmph_forecast} mm/h 且降雨概率 ${today.rain_prob_today_pct}%，超過安全門檻`] }
  }
  // v2.0: EDR hard stop
  if (today.edr != null && today.edr > hs.edr_threshold) {
    return { decision: "NO_GO", requires_approval: false, conditional_tier: null, controls: [`EDR ${today.edr.toFixed(2)} > ${hs.edr_threshold}（極端湍流），禁止起飛`] }
  }

  // [Bug 2] R4 split: >92 = hard NO-GO, 86–92 = CONDITIONAL-D2
  if (risk_score > P.r4_nogo_threshold) {
    return { decision: "NO_GO", requires_approval: false, conditional_tier: null, controls: [`綜合風險 R4（${risk_score}分 > ${P.r4_nogo_threshold}），任務不可排程`] }
  }
  if (risk_level === "R4") {
    return {
      decision: "CONDITIONAL", requires_approval: true, conditional_tier: "D2",
      controls: [`極高風險（R4, ${risk_score}分）— Tier D2：需主管 + 客戶雙方確認 + 安全簡報`, "作業時段縮短至 2 hr 以下", "全程安全觀察員 + 即時監控"],
    }
  }
  if (risk_level === "R3") {
    return {
      decision: "CONDITIONAL", requires_approval: true, conditional_tier: "D1",
      controls: ["重度風險（R3）— Tier D1：需主管審核 + 書面安全計畫", "作業時段縮短至 4 hr 以下", "加派安全觀察員並強化即時監控"],
    }
  }

  // WR matrix check
  const wrResult = P.wr_matrix[w_code]?.[risk_level]
  if (wrResult === "nogo") {
    return { decision: "NO_GO", requires_approval: false, conditional_tier: null, controls: [`WR 矩陣 ${w_code}×${risk_level} = NO-GO`] }
  }

  // E-score hard block
  if (e_score >= P.e_score_config.cap) {
    return {
      decision: "CONDITIONAL", requires_approval: true, conditional_tier: "C",
      controls: ["設備狀態異常（E-Score高）— Tier C：需主管 + 客戶雙方書面確認", "建議更換 Block 狀態設備後重新評估"],
    }
  }

  if (risk_level === "R2") {
    const conds: string[] = []
    if (ops.time_window === "night")        conds.push("夜間作業加劇風險，需主管核准")
    if (building.wind_channel_effect === 1) conds.push("風道效應環境，需加強風速監控")
    if (building.near_hv_power === 1)       conds.push("鄰近高壓電，飛行路徑需嚴格管制")
    const exp = building.region_exposure
    if (exp && (exp === "windward" || exp === "coastal") && (w_code === "W1" || w_code === "W5")) {
      conds.push(`${exp === "windward" ? "迎風面" : "沿海"}建物在 ${w_code} 天候下需保守評估`)
    }
    if (conds.length > 0) {
      const tier: "A" | "C" = (e_score >= 6 || ops.time_window === "night") ? "C" : "A"
      const tierLabel = tier === "C" ? "Tier C：需主管事前審批" : "Tier A：可執行，需即時監控"
      return { decision: "CONDITIONAL", requires_approval: tier === "C", conditional_tier: tier, controls: [tierLabel, ...conds] }
    }
    return { decision: "GO", requires_approval: false, conditional_tier: null, controls: ["中度風險（R2），建議加強環境監控", "確認安全觀察員在場"] }
  }

  // E-score >= 6 triggers CONDITIONAL-C at any lower R-level
  if (e_score >= 6) {
    return {
      decision: "CONDITIONAL", requires_approval: true, conditional_tier: "C",
      controls: ["設備狀態警告（E≥6）— Tier C：需主管確認", "建議檢查 Warn 狀態設備"],
    }
  }

  if (wrResult === "cond") {
    return { decision: "CONDITIONAL", requires_approval: false, conditional_tier: "A", controls: ["需確認當前氣象條件，加強監控"] }
  }

  return { decision: "GO", requires_approval: false, conditional_tier: null, controls: risk_level === "R0" ? ["正常流程"] : ["持續監控風速", "確認場地安全"] }
}

// ─── Buffer Ratio ─────────────────────────────────────────────────────────────

function computeBufferRatio(
  risk_score: number,
  w_code: WeatherType,
  confidence: number,
  P: WeatherRegimeParams,
  forecast_confidence?: number,
): number {
  const bc = P.buffer_coefficients
  const base = bc.base + risk_score / bc.score_divisor
  const vol  = (P.volatility_buffer_add as Record<string, number>)[w_code] ?? 0
  const confPenalty = (1 - confidence) * bc.regime_conf_penalty
  const ensemblePenalty = forecast_confidence != null
    ? (1 - forecast_confidence / 100) * bc.ensemble_penalty
    : 0
  return Math.round(Math.max(bc.min, Math.min(bc.max, base + vol + confPenalty + ensemblePenalty)) * 1000) / 1000
}

// ─── Main: evaluateRisk ───────────────────────────────────────────────────────

export function evaluateRisk(
  input: LARMInput,
  options: EvaluateRiskOptions = {},
): RiskResult {
  const P: WeatherRegimeParams = options.params ?? resolveOrThrow(options.paramsVersion)
  const clock = options.clock ?? defaultClock
  const { weather_30d, weather_today, building, operational, w_override, equipment = [] } = input
  const ops: OperationalContextInput = operational ?? {
    time_window: "day", weekend: 0, urgent_days: null,
    road_closure_needed: 0, multi_day_split: null, operator_experience_level: null,
  }

  const expl: RiskExplanation[] = []

  // A — regime classification with confidence + W5 trend
  const regimeResult = classifyWeatherRegimeWithParams(
    weather_30d, weather_today, w_override, P, input.recent_typhoon_count,
  )
  const { w_code, confidence, secondary_w, adjusted_base } = regimeResult
  const base_w = adjusted_base
  expl.push({
    factor: "天候背景（W Regime）",
    value: `${w_code} — ${P.regimes[w_code].name}`,
    score: base_w,
    note: confidence < 1
      ? `${P.regimes[w_code].notes} 置信度=${(confidence * 100).toFixed(0)}%`
      : P.regimes[w_code].notes + (base_w !== P.regimes[w_code].base_score ? ` (含氣候趨勢+${P.w5_typhoon_trend_bonus})` : ""),
  })

  // B.1
  const { score: weather_now, edr_adj } = computeWeatherNow(weather_today, weather_30d, w_code, building.region_exposure, expl, P)

  // B.2 — G_score (replaces B_score)
  const { total: g_score, ground_consequence, tke_proxy } = computeGScore(building, weather_today.wind_now_kmh, expl, P)

  // B.3
  const o_score = computeOperationalScore(ops, building.crowd_density, expl, P)

  // E — equipment score
  const e_score = computeEquipmentScore(equipment, expl, P)

  // C
  const risk_score = Math.min(100, Math.max(0, Math.round(base_w + weather_now + g_score + o_score + e_score)))
  const risk_level = mapToRLevel(risk_score, P)

  // D — gating with risk_score for R4 split
  const { decision, requires_approval, controls, conditional_tier } = computeGating(
    risk_level, risk_score, weather_today, building, ops, w_code, e_score, P,
  )

  const buffer_ratio = computeBufferRatio(risk_score, w_code, confidence, P, weather_today.forecast_confidence)

  const versions: LARMVersions = {
    larm_version: "v2.0",
    weather_regime_params_version: P.version ?? ACTIVE_PARAMS_VERSION,
    thresholds_version: "v2.0",
  }

  return {
    weather_type: w_code, risk_level,
    internal_grade: getInternalGrade(risk_level),
    decision, requires_approval, controls,
    ruleset_version: "larm_v2.0",
    evaluated_at: clock().toISOString(),
    w_code, base_w, weather_now, g_score,
    b_score: g_score,  // backward compatibility alias
    o_score, risk_score, buffer_ratio,
    explanations: expl, versions,
    regime_confidence: confidence,
    secondary_w,
    e_score,
    conditional_tier,
    edr_adj,
    tke_proxy,
    ground_consequence,
  }
}
