"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import {
  Cloud, Database, Wind, Zap, Building2, HardHat, Wrench,
  Gauge, ShieldCheck, ShieldAlert, ShieldX, Percent, CheckCircle2,
  DollarSign, CalendarDays, Target, X, ChevronRight, ArrowDown,
  Waves, ThermometerSun, Radio, BarChart3,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"

// ─── Node Data Types ──────────────────────────────────────────────────────────

interface NodeParam {
  name: string
  range: string
  note: string
}

interface NodeThreshold {
  condition: string
  result: string
}

interface NodeDetails {
  description: string
  parameters: NodeParam[]
  formula_lines: string[]
  thresholds?: NodeThreshold[]
  source_file: string
  source_lines: string
}

interface GraphNodeData {
  id: string
  layer: 1 | 2 | 3 | 4 | 5
  label: string
  sublabel: string
  icon: LucideIcon
  colorClass: string
  details: NodeDetails
}

interface FlowConnection {
  from: string
  to: string
  label?: string
}

// ─── All 23 Nodes ─────────────────────────────────────────────────────────────

const NODES: GraphNodeData[] = [
  // ── Layer 1: Data Sources ──
  {
    id: "om-forecast", layer: 1, label: "Open-Meteo Forecast", sublabel: "14 天每日預報",
    icon: Cloud, colorClass: "sky",
    details: {
      description: "Open-Meteo Forecast API 提供 14 天逐日天氣預報，包含風速、陣風、降雨機率與降雨量。",
      parameters: [
        { name: "wind_speed_10m_max", range: "0–120 km/h", note: "每日最大風速" },
        { name: "wind_gusts_10m_max", range: "0–180 km/h", note: "每日最大陣風" },
        { name: "precipitation_probability_max", range: "0–100%", note: "降雨機率" },
        { name: "precipitation_sum", range: "0–200 mm", note: "每日降雨量" },
      ],
      formula_lines: ["無運算公式 — 原始 API 資料"],
      source_file: "src/app/api/weather/context/route.ts",
      source_lines: "Phase 1 fetchForecast()",
    },
  },
  {
    id: "om-archive", layer: 1, label: "Open-Meteo Archive", sublabel: "ERA5 30 天歷史",
    icon: Database, colorClass: "sky",
    details: {
      description: "ERA5 歷史資料，提供過去 30 天逐小時觀測，用於計算氣候統計指標（P90 風速、降雨天數等）。",
      parameters: [
        { name: "wind_speed_10m", range: "逐小時", note: "10m 高度風速" },
        { name: "wind_gusts_10m", range: "逐小時", note: "10m 陣風" },
        { name: "precipitation", range: "逐小時 mm", note: "降雨量" },
        { name: "temperature_2m", range: "逐小時 °C", note: "地表 2m 溫度" },
      ],
      formula_lines: [
        "wind_p90_kmh = P90(max_daily_wind[30d])",
        "gust_p90_kmh = P90(max_daily_gust[30d])",
        "rain_days_30 = count(daily_rain ≥ 1mm)",
        "heavy_rain_days_30 = count(daily_rain ≥ 10mm)",
        "instability_index = heavy_rain_days / 30 × 2 (0–1)",
        "predictability_score = 1 − CV(daily_wind) (0–1)",
      ],
      source_file: "src/app/api/weather/context/route.ts",
      source_lines: "Phase 1 fetchArchive()",
    },
  },
  {
    id: "om-ensemble", layer: 1, label: "ECMWF Ensemble", sublabel: "50 成員集成預報",
    icon: Waves, colorClass: "sky",
    details: {
      description: "ECMWF IFS 集成預報系統，50 個成員提供不確定性量化，計算每日風速 P10/P90 和預報信心度。",
      parameters: [
        { name: "wind_speed_10m (×50 members)", range: "逐小時 km/h", note: "每成員風速" },
        { name: "forecast_days", range: "14 天", note: "預報天數" },
      ],
      formula_lines: [
        "each member → max(hourly_wind) per day",
        "P10 = percentile(member_maxes, 0.10)",
        "P90 = percentile(member_maxes, 0.90)",
        "spread = P90 − P10",
        "confidence = max(0, min(100, round((1 − spread/30) × 100)))",
      ],
      source_file: "src/app/api/weather/ensemble/route.ts",
      source_lines: "全檔案",
    },
  },
  {
    id: "cwa", layer: 1, label: "CWA 氣象署", sublabel: "F-C0032 / F-D0047 / O-A0003",
    icon: Radio, colorClass: "amber",
    details: {
      description: "中央氣象署三項資料集：雷雨預報（F-C0032）、鄉鎮預報（F-D0047）、自動站觀測（O-A0003）。用於交叉驗證。",
      parameters: [
        { name: "F-C0032", range: "36h", note: "一般天氣預報（含雷雨）" },
        { name: "F-D0047", range: "7d", note: "鄉鎮逐 12h 預報" },
        { name: "O-A0003", range: "即時", note: "自動氣象站觀測" },
      ],
      formula_lines: [
        "thunder_risk = F-C0032 描述含 '雷' ? 1 : 0",
        "cwa_wind = O-A0003 最近站 wind_max",
        "cwa_rain_prob = F-D0047 PoP (降雨機率)",
        "divergence.wind_delta = |om_wind − cwa_wind|",
        "divergence.level = delta > 15 ? 'high' : delta > 8 ? 'medium' : 'low'",
      ],
      source_file: "src/app/api/weather/context/route.ts",
      source_lines: "Phase 1 fetchCWA*()",
    },
  },
  {
    id: "jma", layer: 1, label: "JMA 日本氣象", sublabel: "MSM 5km / GSM 20km",
    icon: ThermometerSun, colorClass: "violet",
    details: {
      description: "日本氣象廳模式：MSM（5km 解析度 78h）用於短期精確預報，GSM（20km 11天）用於中期。透過 Open-Meteo JMA 端點取得。",
      parameters: [
        { name: "jma_msm", range: "78h / 5km", note: "中尺度模式（台灣適用）" },
        { name: "jma_gsm", range: "11d / 20km", note: "全球光譜模式" },
      ],
      formula_lines: [
        "model = lead_hours ≤ 78 ? 'jma_msm' : 'jma_gsm'",
        "jma_wind_max = max(hourly_wind) per day",
        "divergence vs Open-Meteo = 同 CWA 邏輯",
      ],
      source_file: "src/app/api/weather/context/route.ts",
      source_lines: "fetchJMAForecast()",
    },
  },

  // ── Layer 2: Data Processing ──
  {
    id: "weather-30d", layer: 2, label: "Weather30dInput", sublabel: "30 天氣候統計",
    icon: BarChart3, colorClass: "teal",
    details: {
      description: "彙整 30 天歷史資料為統計指標，作為 W-code 分類和引擎運算的氣候背景。",
      parameters: [
        { name: "wind_p90_kmh", range: "0–80", note: "30 天日最大風 P90" },
        { name: "gust_p90_kmh", range: "0–120", note: "30 天陣風 P90" },
        { name: "rain_days_30", range: "0–30", note: "降雨天數" },
        { name: "heavy_rain_days_30", range: "0–30", note: "大雨天數(≥10mm)" },
        { name: "instability_index", range: "0–1", note: "不穩定指數" },
        { name: "predictability_score", range: "0–1", note: "可預測性" },
      ],
      formula_lines: [
        "← Open-Meteo Archive 30d 聚合計算",
        "instability = heavy_rain_days / 30 × 2",
        "predictability = 1 − CV(daily_wind_max)",
      ],
      source_file: "src/app/api/weather/context/route.ts",
      source_lines: "buildWeather30d()",
    },
  },
  {
    id: "weather-today", layer: 2, label: "WeatherTodayInput[]", sublabel: "14 天逐日預報",
    icon: Cloud, colorClass: "teal",
    details: {
      description: "將各資料源融合為每日預報結構，含風速、雨量、信心度與交叉驗證結果。",
      parameters: [
        { name: "wind_now_kmh", range: "0–100", note: "預報最大風速" },
        { name: "rain_prob_today_pct", range: "0–100", note: "降雨機率" },
        { name: "rain_mmph_forecast", range: "0–50", note: "預報雨量 mm/h" },
        { name: "forecast_confidence", range: "0–100", note: "Ensemble 信心度" },
        { name: "wind_p10/p90_kmh", range: "0–100", note: "集成範圍" },
        { name: "cwa_cross / jma_cross", range: "object", note: "交叉驗證結果" },
      ],
      formula_lines: [
        "每日 = Open-Meteo Forecast + Ensemble P10/P90/confidence",
        "cwa_cross = { cwa_forecast, divergence }",
        "jma_cross = { jma_forecast, divergence }",
        "thunder_risk = CWA F-C0032 → 0 or 1",
      ],
      source_file: "src/app/api/weather/context/route.ts",
      source_lines: "Phase 2 merge logic",
    },
  },
  {
    id: "cross-validation", layer: 2, label: "交叉驗證", sublabel: "多來源差異分析",
    icon: Target, colorClass: "teal",
    details: {
      description: "比較 Open-Meteo vs CWA vs JMA 的預報差異，評估一致性等級（low/medium/high divergence）。",
      parameters: [
        { name: "wind_delta_kmh", range: "0–50", note: "|OM − CWA/JMA| 風速差" },
        { name: "rain_disagree", range: "bool", note: "雨量預報是否矛盾" },
        { name: "level", range: "low/medium/high", note: "差異等級" },
      ],
      formula_lines: [
        "wind_delta = |open_meteo_wind − other_wind|",
        "level = delta > 15 ? 'high' : delta > 8 ? 'medium' : 'low'",
        "rain_disagree = (OM prob > 50% && other rain < 1mm) || vice versa",
        "agreement = 3 sources agree ? 'high' : 2 agree ? 'medium' : 'low'",
      ],
      source_file: "src/app/api/weather/context/route.ts",
      source_lines: "computeCWADivergence() / computeJMADivergence()",
    },
  },

  // ── Layer 3: Engine ──
  {
    id: "w-classify", layer: 3, label: "W 天候分類", sublabel: "W0–W5",
    icon: Wind, colorClass: "emerald",
    details: {
      description: "根據 30 天氣候統計將天候分類為 W0（晴穩）~ W5（颱風/強風），決定基礎風險底分。",
      parameters: [
        { name: "W0", range: "base=3", note: "晴穩：rain_days<8, wind<33" },
        { name: "W1", range: "base=8", note: "乾風：wind_p90≥33, pred≥0.60" },
        { name: "W2", range: "base=10", note: "濕冷：rain_days 8–14, pred<0.55" },
        { name: "W3", range: "base=14", note: "梅雨季：rain_days≥15, heavy≥3" },
        { name: "W4", range: "base=18", note: "不穩定：instab≥0.70, heavy≥2" },
        { name: "W5", range: "base=22", note: "颱風/強風：wind_p90≥39 or gust≥50" },
      ],
      formula_lines: [
        "priority order: W5 → W3 → W4 → W1 → W2 → W0",
        "confidence = 1 match → 1.0 / 2 → 0.78 / 3 → 0.62 / ≥4 → 0.50",
        "secondary_w = 次優先匹配的 W-code",
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "classifyWeatherRegime()",
    },
  },
  {
    id: "base-w", layer: 3, label: "Base(W)", sublabel: "底分 3–22",
    icon: Gauge, colorClass: "emerald",
    details: {
      description: "W-code 對應的基礎風險底分，由 weather-regime-params.ts 定義。",
      parameters: [
        { name: "W0", range: "3", note: "晴穩" },
        { name: "W1", range: "8", note: "乾風" },
        { name: "W2", range: "10", note: "濕冷" },
        { name: "W3", range: "14", note: "梅雨" },
        { name: "W4", range: "18", note: "不穩定" },
        { name: "W5", range: "22", note: "颱風/強風" },
      ],
      formula_lines: [
        "Base(W) = P.regimes[w_code].base_score",
        "透過 Admin Params UI 可調整每個 W-code 的底分",
      ],
      source_file: "src/lib/engines/weather-regime-params.ts",
      source_lines: "regimes 定義區塊",
    },
  },
  {
    id: "weather-now", layer: 3, label: "WeatherNow", sublabel: "即時氣象分 0–50",
    icon: Zap, colorClass: "emerald",
    details: {
      description: "根據當日預報的風速、降雨、不穩定性計算即時氣象風險分數。含集成預報低信心保守機制。",
      parameters: [
        { name: "wind_comp", range: "0–27.5", note: "風速成分 × 0.55" },
        { name: "rain_comp", range: "0–17.5", note: "降雨成分 × 0.35" },
        { name: "instability", range: "0–2.25", note: "不穩定 × 0.15" },
        { name: "pred_discount", range: "−10–0", note: "可預測性折扣" },
        { name: "thunder_add", range: "0 or 5", note: "雷雨加成" },
        { name: "region_weight", range: "0.8–1.3", note: "地形曝露乘數" },
      ],
      formula_lines: [
        "effective_wind = conf < threshold ? P90 : forecast_wind",
        "wind_comp = min(50, windScore(wind) × 0.8) × 0.55",
        "rain_comp = rainScore(prob, mm/h) × 0.35",
        "instability = instab_index × 15 × 0.15",
        "pred_discount = −(predictability × 10)",
        "thunder = thunder_risk ? +5 : 0",
        "WeatherNow = clamp(0, 50, Σ × regionWeight)",
      ],
      thresholds: [
        { condition: "0–10 km/h", result: "windScore = 0" },
        { condition: "11–18 km/h", result: "windScore = 10" },
        { condition: "19–25 km/h", result: "windScore = 20" },
        { condition: "26–32 km/h", result: "windScore = 35" },
        { condition: "33–38 km/h", result: "windScore = 55" },
        { condition: "≥39 km/h", result: "windScore = 80" },
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "computeWeatherNow()",
    },
  },
  {
    id: "b-score", layer: 3, label: "B_score", sublabel: "建物難度 0–25",
    icon: Building2, colorClass: "emerald",
    details: {
      description: "建物場地風險分數，考量樓層高度、海拔、立面複雜度、環境危害及交互效應。",
      parameters: [
        { name: "height_score", range: "0–10", note: "樓層: ≤10:0 / ≤20:4 / ≤30:7 / >30:10" },
        { name: "alt_score", range: "0–6", note: "海拔: ≤100:0 / ≤300:2 / ≤800:4 / >800:6" },
        { name: "complexity", range: "0–8", note: "立面: none:0 / light:2 / medium:5 / heavy:8" },
        { name: "env_hazards", range: "0–8", note: "高壓+4/基地台+2/風道+2/狹窄+2" },
        { name: "interaction", range: "0–6", note: "高樓×風道+3/高壓×無屋頂+2/山區×狹窄+3" },
      ],
      formula_lines: [
        "B = min(25, height + altitude + complexity + env + interaction)",
        "interaction 為非線性交互項，當多個風險因子同時存在時額外加分",
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "computeBuildingScore()",
    },
  },
  {
    id: "o-score", layer: 3, label: "O_score", sublabel: "作業情境 0–15",
    icon: HardHat, colorClass: "emerald",
    details: {
      description: "作業情境風險分數：夜間、週末、急件、人流、疲勞等場景因素。",
      parameters: [
        { name: "night", range: "+6", note: "夜間作業" },
        { name: "weekend", range: "+2", note: "週末作業" },
        { name: "road_closure", range: "+4", note: "需封路" },
        { name: "urgent ≤3d", range: "+6", note: "3 天內急件" },
        { name: "urgent ≤7d", range: "+4", note: "7 天內急件" },
        { name: "crowd_high", range: "+4", note: "高人流" },
        { name: "junior_operator", range: "+2", note: "初級操作員" },
        { name: "fatigue ≥7d", range: "+4", note: "長工期疲勞" },
      ],
      formula_lines: [
        "O = min(15, Σ applicable items)",
        "fatigue = days ≥ 7 ? +4 : days ≥ 4 ? +2 : 0",
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "computeOperationalScore()",
    },
  },
  {
    id: "e-score", layer: 3, label: "E_score", sublabel: "設備狀態 0–10",
    icon: Wrench, colorClass: "emerald",
    details: {
      description: "設備可靠度評分，根據設備的健康狀態加分。Block 狀態 +4，Warn 狀態 +2。",
      parameters: [
        { name: "block", range: "+4 each", note: "Block 狀態設備" },
        { name: "warn", range: "+2 each", note: "Warn 狀態設備" },
      ],
      formula_lines: [
        "E = min(10, Σ block×4 + Σ warn×2)",
        "E ≥ 8 → 觸發 CONDITIONAL-C（需主管+客戶雙方確認）",
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "computeEquipmentScore()",
    },
  },
  {
    id: "r-score", layer: 3, label: "R_score", sublabel: "總風險分 0–100",
    icon: Gauge, colorClass: "yellow",
    details: {
      description: "LARM v1.1 核心：加總所有風險元件得出綜合風險分數。",
      parameters: [
        { name: "Base(W)", range: "3–22", note: "天候底分" },
        { name: "WeatherNow", range: "0–50", note: "即時氣象" },
        { name: "B_score", range: "0–25", note: "建物" },
        { name: "O_score", range: "0–15", note: "作業" },
        { name: "E_score", range: "0–10", note: "設備" },
      ],
      formula_lines: [
        "R_score = clamp(0, 100, Base(W) + WeatherNow + B + O + E)",
        "理論最大 = 22 + 50 + 25 + 15 + 10 = 122 → cap 100",
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "evaluateRisk() 主函數",
    },
  },
  {
    id: "r-level", layer: 3, label: "R-level", sublabel: "R0–R4 對照",
    icon: Gauge, colorClass: "yellow",
    details: {
      description: "將連續的 R_score 映射到離散的 R0–R4 風險等級。",
      parameters: [],
      formula_lines: ["R-level = mapping(R_score)"],
      thresholds: [
        { condition: "0–20", result: "R0 (極低風險)" },
        { condition: "21–40", result: "R1 (低風險)" },
        { condition: "41–65", result: "R2 (中等風險)" },
        { condition: "66–85", result: "R3 (高風險)" },
        { condition: "86–100", result: "R4 (極高風險)" },
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "mapToRLevel()",
    },
  },

  // ── Layer 4: Decision Outputs ──
  {
    id: "hard-stop", layer: 4, label: "硬停規則", sublabel: "強制 NO-GO",
    icon: ShieldX, colorClass: "red",
    details: {
      description: "不論 R-level 為何，當氣象條件超過安全紅線時強制禁飛。優先於所有其他決策。",
      parameters: [],
      formula_lines: [
        "if wind_now ≥ 39 km/h → NO-GO",
        "if rain_mmph > 10 AND rain_prob > 60% → NO-GO",
        "if R-level = R4 → NO-GO",
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "computeGating()",
    },
  },
  {
    id: "decision", layer: 4, label: "任務決策", sublabel: "GO / COND / NO-GO",
    icon: ShieldCheck, colorClass: "emerald",
    details: {
      description: "根據 R-level 和場景條件輸出最終決策，CONDITIONAL 分三層級（Tier A/B/C）。",
      parameters: [],
      formula_lines: [
        "R0/R1 → GO（無額外條件）",
        "R2 + 條件觸發 → CONDITIONAL",
        "  Tier A: 可執行，需即時監控",
        "  Tier B: 需主管事前審批",
        "R3 → CONDITIONAL-B（強制主管審核）",
        "R4 / 硬停 → NO-GO",
        "E ≥ 8 → CONDITIONAL-C（主管+客戶確認）",
      ],
      thresholds: [
        { condition: "GO", result: "正常排程，持續監控" },
        { condition: "COND-A", result: "可執行，加強監控" },
        { condition: "COND-B", result: "需主管審批" },
        { condition: "COND-C", result: "需主管 + 客戶雙方確認" },
        { condition: "NO-GO", result: "禁止排程" },
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "computeGating()",
    },
  },
  {
    id: "buffer", layer: 4, label: "Buffer Ratio", sublabel: "安全緩衝 5%–40%",
    icon: Percent, colorClass: "amber",
    details: {
      description: "根據風險分數、天候波動性、分類信心度和集成不確定性計算時間/資源緩衝比例。",
      parameters: [
        { name: "base", range: "0.05", note: "基礎緩衝" },
        { name: "score_divisor", range: "250", note: "R_score / 250" },
        { name: "volatility_add", range: "0–0.08", note: "W-code 波動附加" },
        { name: "regime_conf_penalty", range: "0–0.15", note: "分類信心度不足" },
        { name: "ensemble_penalty", range: "0–0.10", note: "集成不確定性" },
      ],
      formula_lines: [
        "buffer = base + R_score/250 + volatility[W]",
        "  + (1 − regime_confidence) × 0.15",
        "  + (1 − ensemble_confidence/100) × 0.10",
        "buffer = clamp(0.05, 0.40, buffer)",
      ],
      source_file: "src/lib/engines/risk-engine.ts",
      source_lines: "computeBufferRatio()",
    },
  },
  {
    id: "completion", layer: 4, label: "完成率", sublabel: "預估 5%–99%",
    icon: CheckCircle2, colorClass: "amber",
    details: {
      description: "根據 R-level 和 W-code 估算任務完成機率。",
      parameters: [],
      formula_lines: [
        "base = [97, 82, 60, 35, 10][R_index]",
        "completion = clamp(5, 99, base − W_index × 3)",
      ],
      thresholds: [
        { condition: "R0 + W0", result: "97%" },
        { condition: "R1 + W0", result: "82%" },
        { condition: "R2 + W3", result: "51%" },
        { condition: "R3 + W5", result: "20%" },
        { condition: "R4", result: "≤10%" },
      ],
      source_file: "src/lib/engines/model-helpers.ts",
      source_lines: "completionForRL()",
    },
  },

  // ── Layer 5: Applications ──
  {
    id: "pricing", layer: 5, label: "報價引擎", sublabel: "generateQuote()",
    icon: DollarSign, colorClass: "indigo",
    details: {
      description: "根據建物類型、立面面積、複雜度、環境條件與乘數計算作業報價。",
      parameters: [
        { name: "base_price", range: "按建物類型", note: "NTD/㎡" },
        { name: "complexity", range: "+0~+8 NTD", note: "立面複雜度附加" },
        { name: "floor_multiplier", range: "1.0–1.5×", note: "樓層乘數" },
        { name: "time_multiplier", range: "1.0–1.3×", note: "時段乘數" },
        { name: "urgent_multiplier", range: "1.0–1.3×", note: "急件乘數" },
      ],
      formula_lines: [
        "unit_price = base + complexity + env_surcharges",
        "subtotal = Σ(face_area × unit_price)",
        "total = subtotal × floor_mult × time_mult × urgent_mult",
      ],
      source_file: "src/lib/engines/pricing-engine.ts",
      source_lines: "generateQuote()",
    },
  },
  {
    id: "climate", layer: 5, label: "氣候日曆", sublabel: "365 天評估",
    icon: CalendarDays, colorClass: "indigo",
    details: {
      description: "使用 ERA5 三年歷史資料為全年每天計算 W-code 和風險預估，含偏差校正。",
      parameters: [
        { name: "climate_profile", range: "365 天", note: "ERA5 三年統計" },
        { name: "seasonal_forecast", range: "1–6 月", note: "ECMWF SEAS5" },
        { name: "bias_correction", range: "optional", note: "預報偏差校正" },
      ],
      formula_lines: [
        "每天 → inferWCode(today, w30d) → W-code",
        "W → simpleRiskFromW() → R-level",
        "若有 bias: wind = wind − bucket_bias",
        "seasonal 月份 → P10/P50/P90 顯示",
      ],
      source_file: "src/app/(main)/climate/page.tsx",
      source_lines: "build365Days()",
    },
  },
  {
    id: "accuracy", layer: 5, label: "預報訓練", sublabel: "Bias Correction",
    icon: Target, colorClass: "indigo",
    details: {
      description: "長期追蹤預報 vs 實際觀測差異，計算偏差校正係數用於改善未來預報準確度。",
      parameters: [
        { name: "wind_bias_kmh", range: "±20", note: "風速偏差 (正=高估)" },
        { name: "wind_mae_kmh", range: "0–30", note: "平均絕對誤差" },
        { name: "rain_hit_rate", range: "0–1", note: "降雨命中率" },
        { name: "sample_count", range: "0–∞", note: "樣本數" },
      ],
      formula_lines: [
        "每日記錄 14 天預報 → IndexedDB",
        "隔日回填實際觀測 → 計算誤差",
        "buckets: lead_1_3 / lead_4_7 / lead_8_14",
        "bias = avg(forecast − actual) over 90d",
        "校正: corrected_wind = forecast − bias (需 ≥14 樣本)",
      ],
      source_file: "src/lib/engines/forecast-tracker.ts",
      source_lines: "computeAndStoreBiasCorrection()",
    },
  },
]

// ─── Flow Connections ─────────────────────────────────────────────────────────

const CONNECTIONS: FlowConnection[] = [
  // Layer 1 → 2
  { from: "om-forecast", to: "weather-today", label: "14d daily" },
  { from: "om-archive", to: "weather-30d", label: "30d hourly" },
  { from: "om-ensemble", to: "weather-today", label: "P10/P90" },
  { from: "cwa", to: "weather-today", label: "thunder" },
  { from: "cwa", to: "cross-validation", label: "divergence" },
  { from: "jma", to: "cross-validation", label: "divergence" },
  { from: "jma", to: "weather-today", label: "MSM/GSM" },
  // Layer 2 → 3
  { from: "weather-30d", to: "w-classify", label: "stats" },
  { from: "weather-today", to: "w-classify" },
  { from: "w-classify", to: "base-w", label: "W-code" },
  { from: "weather-today", to: "weather-now", label: "daily" },
  { from: "weather-30d", to: "weather-now", label: "instab" },
  { from: "cross-validation", to: "weather-today", label: "merge" },
  // Layer 3 internal
  { from: "base-w", to: "r-score", label: "3–22" },
  { from: "weather-now", to: "r-score", label: "0–50" },
  { from: "b-score", to: "r-score", label: "0–25" },
  { from: "o-score", to: "r-score", label: "0–15" },
  { from: "e-score", to: "r-score", label: "0–10" },
  { from: "r-score", to: "r-level", label: "map" },
  // Layer 3 → 4
  { from: "r-level", to: "hard-stop" },
  { from: "r-level", to: "decision" },
  { from: "r-level", to: "buffer" },
  { from: "r-level", to: "completion" },
  { from: "weather-now", to: "hard-stop", label: "wind/rain" },
  { from: "e-score", to: "decision", label: "E≥8" },
  // Layer 4 → 5
  { from: "decision", to: "pricing" },
  { from: "buffer", to: "pricing", label: "markup" },
  { from: "completion", to: "climate" },
  { from: "weather-today", to: "accuracy", label: "log" },
  { from: "om-archive", to: "accuracy", label: "actuals" },
]

// ─── Layer Layout ─────────────────────────────────────────────────────────────

const LAYERS: { layer: 1 | 2 | 3 | 4 | 5; title: string; subtitle: string }[] = [
  { layer: 1, title: "數據源", subtitle: "Data Sources" },
  { layer: 2, title: "資料解析", subtitle: "Data Processing" },
  { layer: 3, title: "引擎運算", subtitle: "LARM v1.1 Engine" },
  { layer: 4, title: "決策輸出", subtitle: "Decision Outputs" },
  { layer: 5, title: "應用層", subtitle: "Applications" },
]

// ─── Color Utilities ──────────────────────────────────────────────────────────

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; glow: string; line: string }> = {
  sky:     { bg: "bg-sky-950/60",    border: "border-sky-500/40",    text: "text-sky-400",    glow: "shadow-sky-500/20",    line: "#38bdf8" },
  amber:   { bg: "bg-amber-950/60",  border: "border-amber-500/40",  text: "text-amber-400",  glow: "shadow-amber-500/20",  line: "#fbbf24" },
  violet:  { bg: "bg-violet-950/60", border: "border-violet-500/40", text: "text-violet-400", glow: "shadow-violet-500/20", line: "#a78bfa" },
  teal:    { bg: "bg-teal-950/60",   border: "border-teal-500/40",   text: "text-teal-400",   glow: "shadow-teal-500/20",   line: "#2dd4bf" },
  emerald: { bg: "bg-emerald-950/60",border: "border-emerald-500/40",text: "text-emerald-400",glow: "shadow-emerald-500/20",line: "#34d399" },
  yellow:  { bg: "bg-yellow-950/60", border: "border-yellow-500/40", text: "text-yellow-400", glow: "shadow-yellow-500/20", line: "#facc15" },
  red:     { bg: "bg-red-950/60",    border: "border-red-500/40",    text: "text-red-400",    glow: "shadow-red-500/20",    line: "#f87171" },
  indigo:  { bg: "bg-indigo-950/60", border: "border-indigo-500/40", text: "text-indigo-400", glow: "shadow-indigo-500/20", line: "#818cf8" },
}

// ─── Components ───────────────────────────────────────────────────────────────

function NodeCard({
  node,
  selected,
  onClick,
}: {
  node: GraphNodeData
  selected: boolean
  onClick: () => void
}) {
  const c = COLOR_MAP[node.colorClass]
  const Icon = node.icon
  return (
    <button
      data-node-id={node.id}
      onClick={onClick}
      className={`
        group relative flex items-center gap-3 px-4 py-3 rounded-lg border transition-all duration-200
        ${c.bg} ${c.border} hover:shadow-lg ${c.glow}
        ${selected ? `ring-2 ring-offset-1 ring-offset-zinc-950 ring-${node.colorClass}-400 shadow-lg ${c.glow}` : ""}
        text-left w-full min-w-[180px] max-w-[220px]
      `}
    >
      <Icon className={`h-5 w-5 shrink-0 ${c.text}`} />
      <div className="min-w-0">
        <div className="text-sm font-medium text-zinc-100 truncate">{node.label}</div>
        <div className="text-[10px] text-zinc-500 truncate">{node.sublabel}</div>
      </div>
      <ChevronRight className={`h-3.5 w-3.5 ml-auto shrink-0 transition-transform ${c.text} opacity-0 group-hover:opacity-100 ${selected ? "opacity-100 rotate-90" : ""}`} />
    </button>
  )
}

function FormulaPanel({
  node,
  onClose,
}: {
  node: GraphNodeData
  onClose: () => void
}) {
  const c = COLOR_MAP[node.colorClass]
  const Icon = node.icon
  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className={`flex items-center gap-3 px-5 py-4 border-b border-zinc-800 ${c.bg}`}>
        <Icon className={`h-5 w-5 ${c.text}`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-white">{node.label}</h3>
          <p className="text-xs text-zinc-400">{node.sublabel}</p>
        </div>
        <button onClick={onClose} className="p-1 text-zinc-500 hover:text-white transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-5 max-h-[60vh] overflow-y-auto">
        {/* Description */}
        <p className="text-sm text-zinc-300 leading-relaxed">{node.details.description}</p>

        {/* Parameters */}
        {node.details.parameters.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">參數 Parameters</h4>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-zinc-800/50">
                    <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">名稱</th>
                    <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">範圍</th>
                    <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">說明</th>
                  </tr>
                </thead>
                <tbody>
                  {node.details.parameters.map((p, i) => (
                    <tr key={i} className="border-t border-zinc-800/50">
                      <td className="px-3 py-1.5 font-mono text-emerald-400">{p.name}</td>
                      <td className="px-3 py-1.5 text-zinc-400">{p.range}</td>
                      <td className="px-3 py-1.5 text-zinc-500">{p.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Formula */}
        <div>
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">公式 Formula</h4>
          <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 font-mono text-xs leading-relaxed">
            {node.details.formula_lines.map((line, i) => (
              <div key={i} className={line.startsWith("  ") ? "text-zinc-500 pl-2" : "text-yellow-300"}>
                {line}
              </div>
            ))}
          </div>
        </div>

        {/* Thresholds */}
        {node.details.thresholds && node.details.thresholds.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">閾值 Thresholds</h4>
            <div className="border border-zinc-800 rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-zinc-800/50">
                    <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">條件</th>
                    <th className="text-left px-3 py-1.5 text-zinc-500 font-medium">結果</th>
                  </tr>
                </thead>
                <tbody>
                  {node.details.thresholds.map((t, i) => (
                    <tr key={i} className="border-t border-zinc-800/50">
                      <td className="px-3 py-1.5 font-mono text-amber-400">{t.condition}</td>
                      <td className="px-3 py-1.5 text-zinc-300">{t.result}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Source */}
        <div className="flex items-center gap-2 text-[10px] text-zinc-600 pt-2 border-t border-zinc-800">
          <span className="font-mono">{node.details.source_file}</span>
          <span>→</span>
          <span>{node.details.source_lines}</span>
        </div>
      </div>
    </div>
  )
}

// ─── SVG Flow Lines ───────────────────────────────────────────────────────────

function FlowLines({
  connections,
  nodePositions,
}: {
  connections: FlowConnection[]
  nodePositions: Map<string, { x: number; y: number; w: number; h: number }>
}) {
  const lines: React.ReactNode[] = []

  for (let i = 0; i < connections.length; i++) {
    const conn = connections[i]
    const fromPos = nodePositions.get(conn.from)
    const toPos = nodePositions.get(conn.to)
    if (!fromPos || !toPos) continue

    const fromNode = NODES.find(n => n.id === conn.from)
    const lineColor = fromNode ? COLOR_MAP[fromNode.colorClass]?.line ?? "#555" : "#555"

    // Start from bottom center of source, end at top center of target
    const x1 = fromPos.x + fromPos.w / 2
    const y1 = fromPos.y + fromPos.h
    const x2 = toPos.x + toPos.w / 2
    const y2 = toPos.y

    const dy = y2 - y1
    const cp1y = y1 + dy * 0.4
    const cp2y = y2 - dy * 0.4

    const pathD = `M ${x1} ${y1} C ${x1} ${cp1y}, ${x2} ${cp2y}, ${x2} ${y2}`

    lines.push(
      <g key={`${conn.from}-${conn.to}-${i}`}>
        <path
          d={pathD}
          fill="none"
          stroke={lineColor}
          strokeWidth={1.5}
          strokeOpacity={0.35}
          strokeDasharray="6 4"
          className="animate-flow-dash"
        />
        {/* Arrow */}
        <circle cx={x2} cy={y2} r={3} fill={lineColor} fillOpacity={0.6} />
        {/* Label */}
        {conn.label && (
          <text
            x={(x1 + x2) / 2}
            y={(y1 + y2) / 2 - 4}
            textAnchor="middle"
            className="fill-zinc-600 text-[9px]"
            fontFamily="monospace"
          >
            {conn.label}
          </text>
        )}
      </g>
    )
  }

  return <>{lines}</>
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GraphPage() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null)
  const [nodePositions, setNodePositions] = useState<Map<string, { x: number; y: number; w: number; h: number }>>(new Map())
  const containerRef = useRef<HTMLDivElement>(null)

  const measureNodes = useCallback(() => {
    if (!containerRef.current) return
    const containerRect = containerRef.current.getBoundingClientRect()
    const newPositions = new Map<string, { x: number; y: number; w: number; h: number }>()

    for (const node of NODES) {
      const el = containerRef.current.querySelector(`[data-node-id="${node.id}"]`)
      if (!el) continue
      const r = el.getBoundingClientRect()
      newPositions.set(node.id, {
        x: r.left - containerRect.left,
        y: r.top - containerRect.top,
        w: r.width,
        h: r.height,
      })
    }
    setNodePositions(newPositions)
  }, [])

  useEffect(() => {
    const timer = setTimeout(measureNodes, 100)
    window.addEventListener("resize", measureNodes)
    return () => {
      clearTimeout(timer)
      window.removeEventListener("resize", measureNodes)
    }
  }, [measureNodes])

  const selectedData = selectedNode ? NODES.find(n => n.id === selectedNode) ?? null : null

  return (
    <div className="p-4 sm:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">LARM 數據流架構圖</h1>
        <p className="text-sm text-zinc-500 mt-1">
          點擊任一節點查看詳細公式、參數與閾值。虛線表示數據流向。
        </p>
      </div>

      {/* CSS for flow animation */}
      <style>{`
        @keyframes flow-dash {
          to { stroke-dashoffset: -20; }
        }
        .animate-flow-dash {
          animation: flow-dash 1.5s linear infinite;
        }
      `}</style>

      <div className="flex flex-col xl:flex-row gap-6">
        {/* Graph Area */}
        <div className="flex-1 min-w-0">
          <div ref={containerRef} className="relative bg-zinc-950/50 border border-zinc-800 rounded-xl p-4 sm:p-6 space-y-8 overflow-x-auto">
            {/* SVG overlay for flow lines */}
            {nodePositions.size > 0 && (
              <svg
                className="absolute inset-0 pointer-events-none"
                width="100%"
                height="100%"
                style={{ zIndex: 0 }}
              >
                <FlowLines connections={CONNECTIONS} nodePositions={nodePositions} />
              </svg>
            )}

            {/* Layers */}
            {LAYERS.map(({ layer, title, subtitle }) => {
              const layerNodes = NODES.filter(n => n.layer === layer)
              return (
                <div key={layer} className="relative z-10">
                  {/* Layer header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="flex items-center justify-center w-7 h-7 rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                      {layer}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-zinc-300">{title}</div>
                      <div className="text-[10px] text-zinc-600">{subtitle}</div>
                    </div>
                    <div className="flex-1 border-t border-zinc-800/50" />
                  </div>

                  {/* Nodes row */}
                  <div className="flex flex-wrap gap-3 pl-10">
                    {layerNodes.map(node => (
                      <NodeCard
                        key={node.id}
                        node={node}
                        selected={selectedNode === node.id}
                        onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                      />
                    ))}
                  </div>

                  {/* Arrow between layers */}
                  {layer < 5 && (
                    <div className="flex justify-center mt-4">
                      <ArrowDown className="h-4 w-4 text-zinc-700" />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="xl:w-[420px] shrink-0">
          {selectedData ? (
            <div className="sticky top-6">
              <FormulaPanel node={selectedData} onClose={() => setSelectedNode(null)} />
            </div>
          ) : (
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 text-center">
              <ShieldAlert className="h-8 w-8 text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">點擊左側任一節點</p>
              <p className="text-xs text-zinc-600 mt-1">查看詳細公式與參數</p>

              {/* Legend */}
              <div className="mt-6 text-left space-y-2">
                <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">圖例 Legend</div>
                {[
                  { color: "sky", label: "Open-Meteo 資料" },
                  { color: "amber", label: "CWA 氣象署" },
                  { color: "violet", label: "JMA 日本氣象" },
                  { color: "teal", label: "資料解析層" },
                  { color: "emerald", label: "LARM 引擎" },
                  { color: "yellow", label: "風險彙總" },
                  { color: "red", label: "硬停 / NO-GO" },
                  { color: "indigo", label: "應用層" },
                ].map(({ color, label }) => {
                  const c = COLOR_MAP[color]
                  return (
                    <div key={color} className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-sm ${c.bg} ${c.border} border`} />
                      <span className="text-xs text-zinc-500">{label}</span>
                    </div>
                  )
                })}
              </div>

              {/* Summary */}
              <div className="mt-6 text-left border-t border-zinc-800 pt-4">
                <div className="text-[10px] text-zinc-600 uppercase tracking-wider mb-2">模型摘要</div>
                <div className="font-mono text-[11px] text-zinc-500 space-y-1">
                  <div>R = Base(W) + WeatherNow + B + O + E</div>
                  <div className="text-zinc-600">    [0–100] → R0–R4 → Decision</div>
                  <div className="text-zinc-600">    + Buffer (5%–40%)</div>
                  <div className="text-zinc-600">    + Completion (5%–99%)</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
