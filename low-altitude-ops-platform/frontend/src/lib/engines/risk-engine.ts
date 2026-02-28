// LARM v1.1 — Low Altitude Risk Model
// R_score = Base(W) + WeatherNow + B + O + E  →  R_level + gating + buffer_ratio

import type {
  WeatherType, RiskLevel, Decision, Complexity, Mission,
  Weather30dInput, WeatherTodayInput, BuildingSiteInput, OperationalContextInput,
  LARMInput, RiskResult, RiskExplanation, LARMVersions,
  RegionExposure, WeatherRegimeResult, Equipment,
} from "@/lib/types"
import { getParams, ACTIVE_PARAMS_VERSION } from "./weather-regime-params"

// ─── Step A: Climate Regime Classification (with confidence) ──────────────────

function classifyWeatherRegime(
  w30: Weather30dInput,
  today: WeatherTodayInput,
  override?: WeatherType,
  paramsVersion?: string,
): WeatherRegimeResult {
  if (override) return { w_code: override, confidence: 1.0, secondary_w: null }

  const { wind_p90_kmh, gust_p90_kmh, rain_days_30, heavy_rain_days_30, instability_index, predictability_score } = w30

  // Track all matching rules to compute confidence
  const matches: WeatherType[] = []

  if (wind_p90_kmh >= 39 || (gust_p90_kmh != null && gust_p90_kmh >= 50)) matches.push("W5")
  if (rain_days_30 >= 15 && heavy_rain_days_30 >= 3) matches.push("W3")
  // [2-A] W4 fix: use 30d heavy_rain_days instead of today rain_prob
  if (instability_index >= 0.70 && heavy_rain_days_30 >= 2) matches.push("W4")
  if (wind_p90_kmh >= 33 && predictability_score >= 0.60) matches.push("W1")
  if (rain_days_30 >= 8 && rain_days_30 <= 14 && predictability_score < 0.55) matches.push("W2")

  // Primary = first match (priority order); secondary = next
  const primary: WeatherType = matches[0] ?? "W0"
  const secondary: WeatherType | null = matches[1] ?? null

  // [2-B] Confidence degrades when multiple rules fire
  const confidence = matches.length <= 1 ? 1.0 :
    matches.length === 2 ? 0.78 :
    matches.length === 3 ? 0.62 : 0.50

  void paramsVersion // reserved for future param-versioned classification
  return { w_code: primary, confidence, secondary_w: secondary }
}

// ─── Step B.1: WeatherNow Component (0..50) ───────────────────────────────────

function getWindScore(kmh: number, P: ReturnType<typeof getParams>): number {
  for (const row of P.thresholds.wind_score_table) {
    if (kmh >= row.min_kmh && kmh <= row.max_kmh) return row.score
  }
  return 80
}

function getRainScore(prob: number, mmph: number, P: ReturnType<typeof getParams>): number {
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

function computeWeatherNow(
  today: WeatherTodayInput,
  w30: Weather30dInput,
  w_code: WeatherType,
  region_exposure: RegionExposure | null | undefined,
  expl: RiskExplanation[],
  P: ReturnType<typeof getParams>,
): number {
  // When ensemble confidence is low (<55%), use the conservative P90 wind bound
  // so the risk score reflects the pessimistic scenario rather than the point forecast.
  const lowConfidence = today.forecast_confidence != null && today.forecast_confidence < 55
  const effectiveWindKmh =
    lowConfidence && today.wind_p90_kmh != null
      ? today.wind_p90_kmh
      : today.wind_now_kmh
  const windScore  = getWindScore(effectiveWindKmh, P)
  const windComp   = Math.min(50, windScore * P.thresholds.wind_weight_scale)
  const rainScore  = getRainScore(today.rain_prob_today_pct, today.rain_mmph_forecast, P)
  const instComp   = w30.instability_index * 15
  const predDisc   = -(w30.predictability_score * 10)
  const thunder    = today.thunder_risk === 1 ? 5 : 0

  const raw = 0.55 * windComp + 0.35 * rainScore + 0.15 * instComp + predDisc + thunder
  let wn = Math.max(0, Math.min(50, raw))

  let regionWeight = 1.0
  if (region_exposure) {
    regionWeight = (P.region_weight_table[w_code] as Record<string, number>)[region_exposure] ?? 1.0
    wn = Math.max(0, Math.min(50, wn * regionWeight))
  }

  const windNote = lowConfidence
    ? `P90保守值 ${effectiveWindKmh} km/h (信心${today.forecast_confidence}%<55%)`
    : `wind_score=${windScore} ×0.8 ×0.55`
  expl.push({ factor: "風速", value: `${effectiveWindKmh} km/h`, score: Math.round(0.55 * windComp * 10) / 10, note: windNote })
  expl.push({ factor: "降雨",           value: `${today.rain_prob_today_pct}% / ${today.rain_mmph_forecast} mm/h`, score: Math.round(0.35 * rainScore * 10) / 10, note: `rain_score=${rainScore} ×0.35` })
  expl.push({ factor: "不穩定指數",     value: w30.instability_index.toFixed(2),                  score: Math.round(0.15 * instComp * 10) / 10, note: `×15 ×0.15` })
  expl.push({ factor: "預測性折扣",     value: w30.predictability_score.toFixed(2),                score: Math.round(predDisc * 10) / 10,        note: `predictability×(-10)` })
  if (thunder > 0) expl.push({ factor: "雷雨加成", value: 1, score: thunder, note: "+5" })
  if (region_exposure && regionWeight !== 1.0) {
    expl.push({ factor: "地形曝露乘數", value: region_exposure, score: 0, note: `×${regionWeight} (${w_code})` })
  }

  return Math.round(wn * 10) / 10
}

// ─── Step B.2: Building / Site Score (0..25) with interaction terms ───────────

function computeBuildingScore(b: BuildingSiteInput, expl: RiskExplanation[]): number {
  const altScore =
    b.site_altitude_m > 800 ? 6 :
    b.site_altitude_m > 300 ? 4 :
    b.site_altitude_m > 100 ? 2 : 0

  const floors = b.building_floors ?? (b.building_height_m ? Math.round(b.building_height_m / 3.2) : 0)
  const heightScore = floors > 30 ? 10 : floors > 20 ? 7 : floors > 10 ? 4 : 0

  const complexityMap: Record<Complexity, number> = { none: 0, light: 2, medium: 5, heavy: 8 }
  const complexityScore = complexityMap[b.facade_complexity] ?? 0

  let envRaw = 0
  if (b.near_hv_power === 1)       envRaw += 4
  if (b.near_base_station === 1)   envRaw += 2
  if (b.wind_channel_effect === 1) envRaw += 2
  if (b.clearance_m != null && b.clearance_m < 5) envRaw += 2
  const envScore = Math.min(8, envRaw)

  // [3-B] Non-linear interaction terms
  let interaction = 0
  if (floors > 20 && b.wind_channel_effect === 1) interaction += 3        // high-rise + wind channel
  if (b.near_hv_power === 1 && b.rooftop_condition === "not_available") interaction += 2  // no emergency landing
  if ((b.site_altitude_m ?? 0) > 300 && b.clearance_m != null && b.clearance_m < 5) interaction += 3  // mountain + tight clearance
  const interactionCapped = Math.min(6, interaction)

  const total = Math.min(25, altScore + heightScore + complexityScore + envScore + interactionCapped)

  expl.push({ factor: "建物樓層",   value: `${floors}F`,            score: heightScore,    note: "≤10:0 / ≤20:+4 / ≤30:+7 / >30:+10" })
  expl.push({ factor: "場址海拔",   value: `${b.site_altitude_m}m`, score: altScore,       note: "≤100:0 / ≤300:+2 / ≤800:+4 / >800:+6" })
  expl.push({ factor: "立面複雜度", value: b.facade_complexity,      score: complexityScore, note: "none:0 / light:+2 / medium:+5 / heavy:+8" })
  if (envRaw > 0) {
    const parts: string[] = []
    if (b.near_hv_power === 1)       parts.push("高壓電+4")
    if (b.near_base_station === 1)   parts.push("基地台+2")
    if (b.wind_channel_effect === 1) parts.push("風道效應+2")
    if (b.clearance_m != null && b.clearance_m < 5) parts.push(`狹窄${b.clearance_m}m+2`)
    expl.push({ factor: "環境危害", value: envRaw, score: envScore, note: parts.join(", ") + "（上限8）" })
  }
  if (interactionCapped > 0) {
    const parts: string[] = []
    if (floors > 20 && b.wind_channel_effect === 1) parts.push("高樓×風道+3")
    if (b.near_hv_power === 1 && b.rooftop_condition === "not_available") parts.push("高壓×無屋頂+2")
    if ((b.site_altitude_m ?? 0) > 300 && b.clearance_m != null && b.clearance_m < 5) parts.push("山區×狹窄+3")
    expl.push({ factor: "交互風險加成", value: interaction, score: interactionCapped, note: parts.join(", ") + "（上限6）" })
  }

  return total
}

// ─── Step B.3: Operational Score (0..15) with fatigue ─────────────────────────

function computeOperationalScore(
  ops: OperationalContextInput,
  crowd_density: import("@/lib/types").CrowdDensity | null,
  expl: RiskExplanation[],
): number {
  const parts: string[] = []
  let score = 0

  if (ops.time_window === "night")                { score += 6; parts.push("夜間+6") }
  if (ops.weekend === 1)                          { score += 2; parts.push("週末+2") }
  if (ops.road_closure_needed === 1)              { score += 4; parts.push("封路+4") }
  if (ops.urgent_days != null) {
    const pts = ops.urgent_days <= 3 ? 6 : ops.urgent_days <= 7 ? 4 : 0
    if (pts > 0) { score += pts; parts.push(`急件(${ops.urgent_days}d)+${pts}`) }
  }
  if (crowd_density === "high")                   { score += 4; parts.push("高人流+4") }
  else if (crowd_density === "medium")            { score += 2; parts.push("中人流+2") }
  if (ops.operator_experience_level === "junior") { score += 2; parts.push("初級操作員+2") }

  // [3-A] Personnel fatigue from multi-day mission
  if (ops.mission_days != null) {
    const fatigue = ops.mission_days >= 7 ? 4 : ops.mission_days >= 4 ? 2 : 0
    if (fatigue > 0) { score += fatigue; parts.push(`長工期疲勞(${ops.mission_days}天)+${fatigue}`) }
  }

  const total = Math.min(15, score)
  if (parts.length > 0) expl.push({ factor: "作業情境", value: parts.join(" / "), score: total, note: "上限 15" })
  return total
}

// ─── Step E: Equipment Reliability Score (0..10) ─────────────────────────────

function computeEquipmentScore(equipment: Equipment[], expl: RiskExplanation[]): number {
  if (equipment.length === 0) return 0

  let score = 0
  const parts: string[] = []

  for (const eq of equipment) {
    if (eq.health_status === "block") {
      score += 4
      parts.push(`${eq.name}:Block+4`)
    } else if (eq.health_status === "warn") {
      score += 2
      parts.push(`${eq.name}:Warn+2`)
    }
  }

  const capped = Math.min(10, score)
  if (capped > 0) {
    expl.push({ factor: "設備可靠度(E)", value: `${equipment.length} 件`, score: capped, note: parts.join(", ") + "（上限10）" })
  }
  return capped
}

// ─── Score → R_level ──────────────────────────────────────────────────────────

function mapToRLevel(score: number, P: ReturnType<typeof getParams>): RiskLevel {
  for (const row of P.thresholds.mapping_r_level) {
    if (score >= row.min && score <= row.max) return row.r_level as RiskLevel
  }
  return "R4"
}

// ─── Hard Stops + Gating with CONDITIONAL tiers ───────────────────────────────

function computeGating(
  risk_level: RiskLevel,
  today: WeatherTodayInput,
  building: BuildingSiteInput,
  ops: OperationalContextInput,
  w_code: WeatherType,
  e_score: number,
  P: ReturnType<typeof getParams>,
): { decision: Decision; requires_approval: boolean; controls: string[]; conditional_tier: "A" | "B" | "C" | null } {
  const hs = P.thresholds.hard_stop

  if (today.wind_now_kmh >= hs.wind_kmh) {
    return { decision: "NO_GO", requires_approval: false, conditional_tier: null, controls: [`當前風速 ${today.wind_now_kmh} km/h ≥ 上限 ${hs.wind_kmh} km/h，禁止起飛`] }
  }
  if (today.rain_mmph_forecast > hs.rain_mmph && today.rain_prob_today_pct > hs.rain_prob_pct) {
    return { decision: "NO_GO", requires_approval: false, conditional_tier: null, controls: [`大雨 ${today.rain_mmph_forecast} mm/h 且降雨概率 ${today.rain_prob_today_pct}%，超過安全門檻`] }
  }
  if (risk_level === "R4") {
    return { decision: "NO_GO", requires_approval: false, conditional_tier: null, controls: ["綜合風險 R4（≥86分），任務不可排程"] }
  }
  if (risk_level === "R3") {
    // [3-C] R3 always CONDITIONAL-B (manager approval required)
    return {
      decision: "CONDITIONAL", requires_approval: true, conditional_tier: "B",
      controls: ["重度風險（R3）— Tier B：需主管審核後方可排程", "作業時段縮短至 4 hr 以下", "加派安全觀察員並強化即時監控"],
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
      // [3-C] R2 + high E-Score or night/hv/wind → CONDITIONAL-B, otherwise CONDITIONAL-A
      const tier: "A" | "B" = (e_score >= 6 || ops.time_window === "night") ? "B" : "A"
      const tierLabel = tier === "B" ? "Tier B：需主管事前審批" : "Tier A：可執行，需即時監控"
      return { decision: "CONDITIONAL", requires_approval: tier === "B", conditional_tier: tier, controls: [tierLabel, ...conds] }
    }
    return { decision: "GO", requires_approval: false, conditional_tier: null, controls: ["中度風險（R2），建議加強環境監控", "確認安全觀察員在場"] }
  }
  // E-score hard block: block-status equipment triggers CONDITIONAL-C
  if (e_score >= 8) {
    return {
      decision: "CONDITIONAL", requires_approval: true, conditional_tier: "C",
      controls: ["設備狀態異常（E-Score高）— Tier C：需主管 + 客戶雙方書面確認", "建議更換 Block 狀態設備後重新評估"],
    }
  }
  return { decision: "GO", requires_approval: false, conditional_tier: null, controls: risk_level === "R0" ? ["正常流程"] : ["持續監控風速", "確認場地安全"] }
}

// ─── Buffer Ratio ─────────────────────────────────────────────────────────────

function computeBufferRatio(
  risk_score: number,
  w_code: WeatherType,
  confidence: number,       // regime classification confidence (0..1)
  P: ReturnType<typeof getParams>,
  forecast_confidence?: number, // ensemble agreement (0..100), optional
): number {
  const base = 0.05 + risk_score / 250
  const vol  = (P.volatility_buffer_add as Record<string, number>)[w_code] ?? 0
  // [2-B] Regime confidence penalty: lower regime confidence → higher buffer
  const confPenalty = (1 - confidence) * 0.04
  // Ensemble uncertainty penalty: low forecast_confidence → additional buffer (+0 to +0.08)
  const ensemblePenalty = forecast_confidence != null
    ? (1 - forecast_confidence / 100) * 0.08
    : 0
  return Math.round(Math.max(0.05, Math.min(0.40, base + vol + confPenalty + ensemblePenalty)) * 1000) / 1000
}

function getInternalGrade(r: RiskLevel): "A" | "B" | "C" | "D" {
  return ({ R0: "A", R1: "B", R2: "C", R3: "D", R4: "D" } as const)[r]
}

// ─── Main: evaluateRisk ───────────────────────────────────────────────────────

export function evaluateRisk(input: LARMInput, paramsVersion?: string): RiskResult {
  const P = getParams(paramsVersion)
  const { weather_30d, weather_today, building, operational, w_override, equipment = [] } = input
  const ops: OperationalContextInput = operational ?? {
    time_window: "day", weekend: 0, urgent_days: null,
    road_closure_needed: 0, multi_day_split: null, operator_experience_level: null,
  }

  const expl: RiskExplanation[] = []

  // A — regime classification with confidence
  const regimeResult = classifyWeatherRegime(weather_30d, weather_today, w_override, paramsVersion)
  const { w_code, confidence, secondary_w } = regimeResult
  const base_w = P.regimes[w_code].base_score
  expl.push({
    factor: "天候背景（W Regime）",
    value: `${w_code} — ${P.regimes[w_code].name}`,
    score: base_w,
    note: confidence < 1 ? `${P.regimes[w_code].notes} 置信度=${(confidence * 100).toFixed(0)}%` : P.regimes[w_code].notes,
  })

  // B.1
  const weather_now = computeWeatherNow(weather_today, weather_30d, w_code, building.region_exposure, expl, P)

  // B.2
  const b_score = computeBuildingScore(building, expl)

  // B.3
  const o_score = computeOperationalScore(ops, building.crowd_density, expl)

  // E — equipment score
  const e_score = computeEquipmentScore(equipment, expl)

  // C
  const risk_score = Math.min(100, Math.max(0, Math.round(base_w + weather_now + b_score + o_score + e_score)))
  const risk_level = mapToRLevel(risk_score, P)

  // D
  const { decision, requires_approval, controls, conditional_tier } = computeGating(risk_level, weather_today, building, ops, w_code, e_score, P)

  const buffer_ratio = computeBufferRatio(risk_score, w_code, confidence, P, weather_today.forecast_confidence)

  const usedVersion = paramsVersion ?? ACTIVE_PARAMS_VERSION
  const versions: LARMVersions = {
    larm_version: "v1.1",
    weather_regime_params_version: P.version ?? usedVersion,
    thresholds_version: "v1.1",
  }

  return {
    weather_type: w_code, risk_level,
    internal_grade: getInternalGrade(risk_level),
    decision, requires_approval, controls,
    ruleset_version: "larm_v1.1",
    evaluated_at: new Date().toISOString(),
    w_code, base_w, weather_now, b_score, o_score, risk_score, buffer_ratio,
    explanations: expl, versions,
    // v1.1 extensions
    regime_confidence: confidence,
    secondary_w,
    e_score,
    conditional_tier,
  }
}

// ─── Mission → LARM Input Helpers ────────────────────────────────────────────

export function buildingSiteFromMission(mission: Partial<Mission>): BuildingSiteInput {
  const bld = mission.building
  const facades = mission.facades ?? []

  const dominant: import("@/lib/types").Complexity =
    facades.some(f => f.complexity === "heavy")  ? "heavy"  :
    facades.some(f => f.complexity === "medium") ? "medium" :
    facades.some(f => f.complexity === "light")  ? "light"  : "none"

  const rooftop_condition =
    bld?.rooftop_access === "Good"         ? "good"          :
    bld?.rooftop_access === "Limited"      ? "limited"       :
    bld?.rooftop_access === "NotAvailable" ? "not_available" : null

  return {
    // [1-A] Use real altitude from address geocoding
    site_altitude_m:     mission.address?.altitude_m ?? 10,
    building_floors:     bld?.height_floors ?? null,
    building_height_m:   bld?.height_m ?? null,
    facade_complexity:   dominant,
    // [1-A] Populate from BuildingData (captured in Step 3)
    clearance_m:         bld?.clearance_m ?? null,
    near_hv_power:       facades.some(f => f.high_risk_env) ? 1 : 0,
    near_base_station:   bld?.near_base_station ?? 0,
    wind_channel_effect: bld?.wind_channel_effect ?? (facades.some(f => f.road_closure) ? 1 : 0),
    rooftop_condition,
    crowd_density:       bld?.crowd_density ?? null,
    region_exposure:     bld?.region_exposure ?? null,
  }
}

export function operationalContextFromMission(
  mission: Partial<Mission>,
  timeWindow: "day" | "weekend" | "night" = "day",
): OperationalContextInput {
  return {
    time_window:                timeWindow === "night" ? "night" : "day",
    weekend:                    timeWindow === "weekend" ? 1 : 0,
    urgent_days:                null,
    road_closure_needed:        mission.facades?.some(f => f.road_closure) ? 1 : 0,
    multi_day_split:            null,
    operator_experience_level:  null,
    mission_days:               mission.selected_dates?.length ?? 1,
  }
}
