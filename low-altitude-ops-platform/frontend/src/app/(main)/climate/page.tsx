"use client"
import { useState, useCallback, useMemo, useEffect } from "react"
import { Search, ChevronLeft, ChevronRight, CloudSun, Wind, Droplets, Zap, TrendingUp, Info, CheckCircle, AlertCircle, Loader } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { WeatherType, RiskLevel, WeatherTodayInput, Weather30dInput } from "@/lib/types"

// ── Constants ──────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]

const W_LEVELS: { type: WeatherType; label: string; cond: string; color: string; bg: string }[] = [
  { type: "W0", label: "穩定高壓晴朗型",   cond: "最穩定背景，低雨低風",                    color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { type: "W1", label: "東北季風型",       cond: "偏強風 P90≥33 km/h，迎風面/沿海保守",    color: "text-sky-400",     bg: "bg-sky-500/10" },
  { type: "W2", label: "鋒面掃過型",       cond: "降雨系統移動，變動性較高",                color: "text-yellow-400",  bg: "bg-yellow-500/10" },
  { type: "W3", label: "梅雨滯留型",       cond: "連續多日降雨（≥15天），窗口小",           color: "text-orange-400",  bg: "bg-orange-500/10" },
  { type: "W4", label: "午後熱對流型",     cond: "局部雷陣雨、突變快，不穩定高",            color: "text-orange-500",  bg: "bg-orange-500/15" },
  { type: "W5", label: "颱風外圍環流型",   cond: "強風 P90≥39 km/h / 強雨，需保守",       color: "text-red-400",     bg: "bg-red-500/10" },
]

const R_LEVELS: { level: RiskLevel; label: string; desc: string; color: string; bg: string }[] = [
  { level: "R0", label: "無風險",   desc: "R_score 0–20，正常排程",            color: "text-emerald-400", bg: "bg-emerald-500/10" },
  { level: "R1", label: "輕微",     desc: "R_score 21–40，GO 持續監控",        color: "text-sky-400",     bg: "bg-sky-500/10" },
  { level: "R2", label: "中度",     desc: "R_score 41–65，視條件 GO/COND",     color: "text-amber-400",   bg: "bg-amber-500/10" },
  { level: "R3", label: "重度",     desc: "R_score 66–85，需主管審核",          color: "text-orange-400",  bg: "bg-orange-500/10" },
  { level: "R4", label: "禁止",     desc: "R_score 86–100，NO-GO",             color: "text-red-400",     bg: "bg-red-500/10" },
]

const WR_MATRIX: Record<WeatherType, Record<RiskLevel, "go" | "cond" | "nogo">> = {
  W0: { R0: "go",   R1: "go",   R2: "cond", R3: "nogo", R4: "nogo" },
  W1: { R0: "nogo", R1: "go",   R2: "cond", R3: "cond", R4: "nogo" },
  W2: { R0: "nogo", R1: "cond", R2: "cond", R3: "cond", R4: "nogo" },
  W3: { R0: "nogo", R1: "nogo", R2: "cond", R3: "cond", R4: "nogo" },
  W4: { R0: "nogo", R1: "cond", R2: "cond", R3: "cond", R4: "nogo" },
  W5: { R0: "nogo", R1: "nogo", R2: "cond", R3: "cond", R4: "nogo" },
}

const MATRIX_CELL: Record<"go" | "cond" | "nogo", { label: string; cls: string; fullLabel: string }> = {
  go:   { label: "GO",   fullLabel: "可執行",   cls: "bg-emerald-500/20 text-emerald-300 font-semibold" },
  cond: { label: "COND", fullLabel: "條件執行", cls: "bg-amber-500/20 text-amber-300" },
  nogo: { label: "✕",   fullLabel: "不可執行", cls: "bg-zinc-800/60 text-zinc-600" },
}

const R_COLOR: Record<RiskLevel, string> = {
  R0: "text-emerald-400", R1: "text-sky-400",
  R2: "text-amber-400",   R3: "text-orange-400", R4: "text-red-500",
}
const R_BG: Record<RiskLevel, string> = {
  R0: "bg-emerald-500/10", R1: "bg-sky-500/10",
  R2: "bg-amber-500/10",   R3: "bg-orange-500/10", R4: "bg-red-500/10",
}

// ── Seasonal generation (Taiwan MONTH_PROFILES) ────────────────────────────────
// Mirrors the algorithm in @/lib/mock-data/index.ts

type WDist = [number, WeatherType][]
type MonthProfile = { wDist: WDist; riskBase: RiskLevel }

const MONTH_PROFILES: MonthProfile[] = [
  /* Jan */ { wDist: [[0.50, "W0"], [0.85, "W1"], [1.00, "W2"]], riskBase: "R0" },
  /* Feb */ { wDist: [[0.45, "W0"], [0.80, "W1"], [1.00, "W2"]], riskBase: "R0" },
  /* Mar */ { wDist: [[0.40, "W0"], [0.65, "W1"], [0.90, "W2"], [1.00, "W3"]], riskBase: "R1" },
  /* Apr */ { wDist: [[0.35, "W0"], [0.55, "W1"], [0.80, "W2"], [0.95, "W3"], [1.00, "W4"]], riskBase: "R1" },
  /* May */ { wDist: [[0.20, "W0"], [0.35, "W1"], [0.55, "W2"], [0.85, "W3"], [1.00, "W4"]], riskBase: "R2" },
  /* Jun */ { wDist: [[0.15, "W0"], [0.25, "W1"], [0.45, "W2"], [0.75, "W3"], [0.95, "W4"], [1.00, "W5"]], riskBase: "R2" },
  /* Jul */ { wDist: [[0.15, "W0"], [0.25, "W1"], [0.40, "W2"], [0.55, "W3"], [0.80, "W4"], [1.00, "W5"]], riskBase: "R3" },
  /* Aug */ { wDist: [[0.12, "W0"], [0.22, "W1"], [0.38, "W2"], [0.52, "W3"], [0.78, "W4"], [1.00, "W5"]], riskBase: "R3" },
  /* Sep */ { wDist: [[0.20, "W0"], [0.35, "W1"], [0.55, "W2"], [0.70, "W3"], [0.88, "W4"], [1.00, "W5"]], riskBase: "R2" },
  /* Oct */ { wDist: [[0.40, "W0"], [0.65, "W1"], [0.85, "W2"], [0.95, "W3"], [1.00, "W4"]], riskBase: "R1" },
  /* Nov */ { wDist: [[0.50, "W0"], [0.80, "W1"], [0.95, "W2"], [1.00, "W3"]], riskBase: "R0" },
  /* Dec */ { wDist: [[0.55, "W0"], [0.88, "W1"], [1.00, "W2"]], riskBase: "R0" },
]

function hash(seed: number): number {
  let h = (seed * 2654435761) >>> 0
  h = (((h >>> 16) ^ h) * 0x45d9f3b) >>> 0
  h = ((h >>> 16) ^ h) >>> 0
  return (h & 0x7fffffff) / 0x7fffffff
}

function pickFromDist(dist: WDist, rand: number): WeatherType {
  for (const [threshold, w] of dist) {
    if (rand <= threshold) return w
  }
  return dist[dist.length - 1][1]
}

function riskForW(w: WeatherType, baseRisk: RiskLevel, rand: number): RiskLevel {
  const wIdx = parseInt(w[1])
  const rBase = parseInt(baseRisk[1])
  let r = Math.min(4, Math.max(0, rBase + Math.floor(wIdx / 2) - 1))
  if (rand > 0.85) r = Math.min(4, r + 1)
  if (rand < 0.15) r = Math.max(0, r - 1)
  return `R${r}` as RiskLevel
}

// ── Weather inference (from real forecast data) ────────────────────────────────

function inferWCode(today: WeatherTodayInput, w30d: Weather30dInput): WeatherType {
  const wind = today.wind_now_kmh
  const rain = today.rain_prob_today_pct
  if (wind >= 28 && (w30d.gust_p90_kmh ?? 0) >= 39) return "W5"
  if (today.thunder_risk === 1 && rain >= 40) return "W4"
  if (w30d.rain_days_30 >= 15 && rain >= 60) return "W3"
  if (w30d.rain_days_30 >= 10 && rain >= 40) return "W2"
  if (wind >= 20 && w30d.wind_p90_kmh >= 28) return "W1"
  return "W0"
}

function simpleRiskFromW(w: WeatherType): RiskLevel {
  const map: Record<WeatherType, RiskLevel> = {
    W0: "R0", W1: "R1", W2: "R1", W3: "R2", W4: "R2", W5: "R3",
  }
  return map[w]
}

function completionForRL(rl: RiskLevel, w: WeatherType): number {
  const rIdx = parseInt(rl[1])
  const wIdx = parseInt(w[1])
  return Math.max(5, Math.min(99, [97, 82, 60, 35, 10][rIdx] - wIdx * 3))
}

function genWeatherTodayForW(w: WeatherType, seed: number): WeatherTodayInput {
  const h1 = hash(seed)
  const h2 = hash(seed + 3333)
  const wIdx = parseInt(w[1])
  if (wIdx === 0) {
    return {
      wind_now_kmh:        5 + Math.floor(h1 * 10),
      gust_now_kmh:        10 + Math.floor(h2 * 10),
      rain_prob_today_pct: Math.floor(h1 * 12),
      rain_mmph_forecast:  0,
      thunder_risk:        0,
    }
  } else if (wIdx <= 3) {
    return {
      wind_now_kmh:        14 + Math.floor(h1 * 16),
      gust_now_kmh:        22 + Math.floor(h2 * 18),
      rain_prob_today_pct: 20 + Math.floor(h1 * 45),
      rain_mmph_forecast:  Math.round(h2 * 5 * 10) / 10,
      thunder_risk:        wIdx >= 3 && h1 > 0.6 ? 1 : 0,
    }
  } else {
    return {
      wind_now_kmh:        28 + Math.floor(h1 * 16),
      gust_now_kmh:        38 + Math.floor(h2 * 17),
      rain_prob_today_pct: 55 + Math.floor(h1 * 40),
      rain_mmph_forecast:  Math.round((4 + h2 * 14) * 10) / 10,
      thunder_risk:        h1 > 0.33 ? 1 : 0,
    }
  }
}

// Taiwan seasonal risk bar (for pre-search state)
const SEASONAL_PROFILE: { label: string; risk: number; note: string }[] = [
  { label: "一月", risk: 35, note: "東北季風" },
  { label: "二月", risk: 32, note: "冬末，低溫" },
  { label: "三月", risk: 40, note: "春雨開始" },
  { label: "四月", risk: 45, note: "梅雨前期" },
  { label: "五月", risk: 60, note: "梅雨季" },
  { label: "六月", risk: 65, note: "梅雨/颱風季" },
  { label: "七月", risk: 70, note: "颱風高峰" },
  { label: "八月", risk: 72, note: "颱風/午後對流" },
  { label: "九月", risk: 55, note: "颱風末期" },
  { label: "十月", risk: 30, note: "秋高氣爽" },
  { label: "十一月", risk: 30, note: "東北季風" },
  { label: "十二月", risk: 32, note: "冬季乾燥" },
]

// ── Types ──────────────────────────────────────────────────────────────────────

interface ForecastDay {
  date: string
  weather_today: WeatherTodayInput
  weather_type: WeatherType
  risk_level: RiskLevel
  wind_ms: number
  rain_prob: number
  completion_prob: number
  source: "real" | "seasonal"   // data provenance badge
}

interface WeatherContext {
  weather_30d: Weather30dInput
  forecast: { date: string; weather_today: WeatherTodayInput }[]
  _meta?: { meteo_plan: "paid" | "free" }
}

interface HealthStatus {
  status: "ok" | "degraded" | "loading" | "error"
  meteo_plan: "paid" | "free" | null
  services?: {
    forecast: { ok: boolean; latency_ms: number | null }
    archive:  { ok: boolean; latency_ms: number | null }
    cwa:      { ok: boolean; latency_ms: number | null; error?: string }
  }
}

// ── Build 365-day dataset ──────────────────────────────────────────────────────

function build365Days(
  ctx: WeatherContext,
  locationSeed: number,
): ForecastDay[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Index real forecast by date string for O(1) lookup
  const realMap = new Map(ctx.forecast.map(f => [f.date, f.weather_today]))

  const days: ForecastDay[] = []
  for (let i = 0; i < 365; i++) {
    const d = new Date(today)
    d.setDate(today.getDate() + i)
    const dateStr = d.toISOString().split("T")[0]
    const month = d.getMonth()
    const profile = MONTH_PROFILES[month]

    const realToday = realMap.get(dateStr)
    if (realToday) {
      // Real forecast data
      const wt = inferWCode(realToday, ctx.weather_30d)
      const rl = simpleRiskFromW(wt)
      days.push({
        date: dateStr,
        weather_today: realToday,
        weather_type: wt,
        risk_level: rl,
        wind_ms: Math.round(realToday.wind_now_kmh / 3.6 * 10) / 10,
        rain_prob: realToday.rain_prob_today_pct,
        completion_prob: completionForRL(rl, wt),
        source: "real",
      })
    } else {
      // Seasonal estimate — use location + day offset as seed for consistent results
      const seed = locationSeed * 1000 + i
      const r1 = hash(seed)
      const r2 = hash(seed + 7919)

      const w = pickFromDist(profile.wDist, r1)
      const rl = riskForW(w, profile.riskBase, r2)
      const weather_today = genWeatherTodayForW(w, seed)

      days.push({
        date: dateStr,
        weather_today,
        weather_type: w,
        risk_level: rl,
        wind_ms: Math.round(weather_today.wind_now_kmh / 3.6 * 10) / 10,
        rain_prob: weather_today.rain_prob_today_pct,
        completion_prob: completionForRL(rl, w),
        source: "seasonal",
      })
    }
  }
  return days
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ClimatePage() {
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [health, setHealth] = useState<HealthStatus>({ status: "loading", meteo_plan: null })

  // Fetch health status once on mount
  useEffect(() => {
    fetch("/api/weather/health")
      .then(r => r.json())
      .then(d => setHealth({
        status: d.status === "ok" ? "ok" : "degraded",
        meteo_plan: d.meteo_plan ?? "free",
        services: d.services,
      }))
      .catch(() => setHealth({ status: "error", meteo_plan: null }))
  }, [])
  const [location, setLocation] = useState<{ lat: number; lng: number; city: string; label: string } | null>(null)
  const [ctx, setCtx] = useState<WeatherContext | null>(null)
  const [allDays, setAllDays] = useState<ForecastDay[]>([])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [siteRisk, setSiteRisk] = useState<RiskLevel>("R1")
  const [monthOffset, setMonthOffset] = useState(0)

  // ── Search ─────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    setCtx(null)
    setAllDays([])
    setSelectedDate(null)

    try {
      const geoRes = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&mode=address`)
      const geo = await geoRes.json()
      if (geo.status !== "success") {
        setError("找不到該地址，請嘗試更精確的地址（例如：台北市信義區松仁路100號）")
        return
      }

      const loc = { lat: geo.lat as number, lng: geo.lng as number, city: (geo.city as string) ?? "", label: query }
      setLocation(loc)

      const wxRes = await fetch(
        `/api/weather/context?lat=${loc.lat}&lng=${loc.lng}&city=${encodeURIComponent(loc.city)}`
      )
      if (!wxRes.ok) throw new Error("weather API error")
      const wxData: WeatherContext = await wxRes.json()
      if (!wxData.weather_30d || !wxData.forecast) throw new Error("incomplete data")
      setCtx(wxData)

      // Deterministic seed from lat/lng (so same location always gives same seasonal pattern)
      const locationSeed = Math.round(Math.abs(loc.lat * 1000 + loc.lng * 100)) % 9999
      const days = build365Days(wxData, locationSeed)
      setAllDays(days)
      setMonthOffset(0)
    } catch {
      setError("無法取得天氣資料，請稍後再試")
    } finally {
      setLoading(false)
    }
  }, [query])

  // ── Month grouping ──────────────────────────────────────────────────────────

  const monthGroups = useMemo(() => {
    const groups: { year: number; month: number; label: string; days: ForecastDay[] }[] = []
    const seen = new Map<string, number>()
    for (const day of allDays) {
      const d = new Date(day.date)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (!seen.has(key)) {
        seen.set(key, groups.length)
        groups.push({ year: d.getFullYear(), month: d.getMonth(), label: `${d.getFullYear()} ${MONTH_NAMES[d.getMonth()]}`, days: [] })
      }
      groups[seen.get(key)!].days.push(day)
    }
    return groups
  }, [allDays])

  const clampedOffset = Math.min(monthOffset, Math.max(0, monthGroups.length - 1))
  const currentGroup = monthGroups[clampedOffset]
  const visibleDays = currentGroup?.days ?? []

  const selectedDay = selectedDate ? allDays.find(d => d.date === selectedDate) ?? null : null
  const wrDecision = selectedDay ? WR_MATRIX[selectedDay.weather_type][siteRisk] : null

  // ── Monthly stats ──────────────────────────────────────────────────────────

  const monthStats = useMemo(() => {
    const goC = visibleDays.filter(d => d.risk_level === "R0" || d.risk_level === "R1").length
    const condC = visibleDays.filter(d => d.risk_level === "R2").length
    const nogoC = visibleDays.filter(d => d.risk_level === "R3" || d.risk_level === "R4").length
    const avg = visibleDays.length > 0
      ? Math.round(visibleDays.reduce((s, d) => s + d.completion_prob, 0) / visibleDays.length)
      : 0
    const realCount = visibleDays.filter(d => d.source === "real").length
    return { goC, condC, nogoC, avg, realCount }
  }, [visibleDays])

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CloudSun className="h-7 w-7 text-sky-400" />
          <div>
            <h1 className="text-xl font-semibold text-white">Climate Assessment</h1>
            <p className="text-sm text-zinc-400">氣候評估 — 全年12個月天候窗口與場域風險查詢</p>
          </div>
        </div>

        {/* ── Open-Meteo connection status badge ── */}
        <a
          href="/api/weather/health"
          target="_blank"
          rel="noopener noreferrer"
          title="點擊查看完整診斷報告"
          className="flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors hover:bg-zinc-800/60 cursor-pointer"
          style={{ textDecoration: "none" }}
        >
          {health.status === "loading" && (
            <>
              <Loader className="h-3.5 w-3.5 text-zinc-500 animate-spin" />
              <span className="text-xs text-zinc-500">檢查連線…</span>
            </>
          )}
          {health.status === "ok" && (
            <>
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400" />
              <div className="text-left">
                <p className="text-[11px] font-medium text-emerald-400 leading-tight">Open-Meteo 正常</p>
                <p className="text-[10px] text-zinc-500 leading-tight">
                  {health.meteo_plan === "paid" ? "付費方案 ✦" : "免費方案"}
                  {health.services?.forecast.latency_ms != null && ` · ${health.services.forecast.latency_ms}ms`}
                </p>
              </div>
            </>
          )}
          {(health.status === "degraded" || health.status === "error") && (
            <>
              <AlertCircle className="h-3.5 w-3.5 text-red-400" />
              <div className="text-left">
                <p className="text-[11px] font-medium text-red-400 leading-tight">連線異常</p>
                <p className="text-[10px] text-zinc-500 leading-tight">點擊查看詳情</p>
              </div>
            </>
          )}
        </a>
      </div>

      {/* ── Search ──────────────────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <input
            className="w-full pl-9 pr-4 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-500 transition-colors"
            placeholder="輸入地址（例如：台北市信義區松仁路100號）"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
          />
        </div>
        <button
          onClick={handleSearch}
          disabled={loading || !query.trim()}
          className="px-4 py-2.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
        >
          {loading ? "查詢中…" : "查詢天候"}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          {error}
        </div>
      )}

      {/* ── 30-day summary bar ──────────────────────────────────────────────── */}
      {ctx && location && (
        <div className="rounded-lg border border-zinc-700 bg-zinc-800/30 px-4 py-3 flex flex-wrap gap-4 items-center">
          <div>
            <p className="text-xs text-zinc-500 mb-0.5">查詢地點</p>
            <p className="text-sm font-medium text-white">{location.label}</p>
            <p className="text-[10px] text-zinc-600 font-mono">{location.lat.toFixed(4)}, {location.lng.toFixed(4)}</p>
          </div>
          <div className="h-8 w-px bg-zinc-700 hidden sm:block" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 flex-1 min-w-0">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">30日均風</p>
              <p className="text-sm font-semibold text-white font-mono">{ctx.weather_30d.wind_mean_kmh} <span className="text-xs text-zinc-500">km/h</span></p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">風速 P90</p>
              <p className="text-sm font-semibold text-white font-mono">{ctx.weather_30d.wind_p90_kmh} <span className="text-xs text-zinc-500">km/h</span></p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">降雨天數</p>
              <p className="text-sm font-semibold text-white font-mono">{ctx.weather_30d.rain_days_30}<span className="text-xs text-zinc-500">/30天</span></p>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider mb-0.5">可預測性</p>
              <p className="text-sm font-semibold text-white font-mono">{Math.round(ctx.weather_30d.predictability_score * 100)}<span className="text-xs text-zinc-500">%</span></p>
            </div>
          </div>
          {/* Data source legend */}
          <div className="flex gap-3 text-[10px] w-full sm:w-auto">
            <span className="flex items-center gap-1 text-emerald-400"><span className="inline-block w-2 h-2 rounded-full bg-emerald-400" /> 即時預報（14天）</span>
            <span className="flex items-center gap-1 text-zinc-500"><span className="inline-block w-2 h-2 rounded-full bg-zinc-600" /> 季節估算</span>
          </div>
        </div>
      )}

      {/* ── Main content (post-search) ──────────────────────────────────────── */}
      {allDays.length > 0 ? (
        <div className="flex flex-col lg:flex-row gap-5">

          {/* ── Left: Calendar + table ─────────────────────────────────────── */}
          <div className="flex-1 min-w-0 space-y-3">

            {/* Month navigation */}
            <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
              <button
                onClick={() => setMonthOffset(m => Math.max(0, m - 1))}
                disabled={clampedOffset === 0}
                className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-zinc-300" />
              </button>
              <div className="flex-1 flex items-center justify-center gap-3 flex-wrap">
                <span className="text-sm font-semibold text-white">{currentGroup?.label ?? "—"}</span>
                {visibleDays.length > 0 && (
                  <span className="text-[10px] text-zinc-500">
                    {visibleDays.length}天 · GO {monthStats.goC} · COND {monthStats.condC} · NO-GO {monthStats.nogoC} · 均{monthStats.avg}%
                    {monthStats.realCount > 0 && <span className="text-emerald-600 ml-1">· {monthStats.realCount}天即時</span>}
                  </span>
                )}
              </div>
              <button
                onClick={() => setMonthOffset(m => Math.min(monthGroups.length - 1, m + 1))}
                disabled={clampedOffset >= monthGroups.length - 1}
                className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-zinc-300" />
              </button>
            </div>

            {/* Month tabs — all 12 (or however many months are covered) */}
            <div className="flex flex-wrap gap-1">
              {monthGroups.map((g, i) => {
                const hasReal = g.days.some(d => d.source === "real")
                return (
                  <button
                    key={i}
                    onClick={() => setMonthOffset(i)}
                    className={cn(
                      "px-2 py-1 text-[10px] rounded border transition-colors relative",
                      i === clampedOffset
                        ? "bg-zinc-600 border-zinc-500 text-white"
                        : "border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                    )}
                  >
                    {MONTH_NAMES[g.month].slice(0, 2)}
                    {hasReal && <span className="ml-0.5 text-emerald-500">·</span>}
                  </button>
                )
              })}
            </div>

            {/* Forecast table */}
            <div className="border border-zinc-700 rounded-lg overflow-hidden max-h-[520px] overflow-y-auto">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-xs">
                  <thead className="bg-zinc-800/80 text-zinc-400 sticky top-0 z-10">
                    <tr>
                      <th className="px-3 py-2 text-left">日期</th>
                      <th className="px-3 py-2 text-left">天候</th>
                      <th className="px-3 py-2 text-center">風速</th>
                      <th className="px-3 py-2 text-center">陣風</th>
                      <th className="px-3 py-2 text-center">降雨%</th>
                      <th className="px-3 py-2 text-center">雷</th>
                      <th className="px-3 py-2 text-center">風險</th>
                      <th className="px-3 py-2 text-center">完成率</th>
                      <th className="px-3 py-2 text-center">來源</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {visibleDays.map(day => {
                      const isSel = selectedDate === day.date
                      const wDef = W_LEVELS.find(w => w.type === day.weather_type)
                      return (
                        <tr
                          key={day.date}
                          onClick={() => setSelectedDate(isSel ? null : day.date)}
                          className={cn(
                            "cursor-pointer transition-colors select-none",
                            isSel ? "bg-sky-600/20" : "hover:bg-zinc-800/50"
                          )}
                        >
                          <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">{day.date}</td>
                          <td className={cn("px-3 py-2 font-mono font-bold", wDef?.color ?? "text-zinc-300")}>
                            {day.weather_type}
                          </td>
                          <td className="px-3 py-2 text-center text-zinc-300 whitespace-nowrap">{day.wind_ms.toFixed(1)} m/s</td>
                          <td className="px-3 py-2 text-center text-zinc-400 whitespace-nowrap">
                            {day.weather_today.gust_now_kmh != null
                              ? `${(day.weather_today.gust_now_kmh / 3.6).toFixed(1)} m/s`
                              : "—"}
                          </td>
                          <td className="px-3 py-2 text-center text-zinc-300">{day.rain_prob}%</td>
                          <td className="px-3 py-2 text-center">
                            {day.weather_today.thunder_risk === 1
                              ? <span className="text-yellow-400">⚡</span>
                              : <span className="text-zinc-700">—</span>}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={cn("px-1.5 py-0.5 rounded font-mono font-bold text-[11px]", R_BG[day.risk_level], R_COLOR[day.risk_level])}>
                              {day.risk_level}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <div className="w-10 h-1.5 bg-zinc-700 rounded-full">
                                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${day.completion_prob}%` }} />
                              </div>
                              <span className="text-zinc-300 w-7 text-right">{day.completion_prob}%</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-center">
                            {day.source === "real"
                              ? <span className="text-[9px] text-emerald-500 font-medium">即時</span>
                              : <span className="text-[9px] text-zinc-600">估算</span>}
                          </td>
                        </tr>
                      )
                    })}
                    {visibleDays.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-8 text-center text-zinc-600 text-sm">此月無資料</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Day detail panel */}
            {selectedDay ? (
              <div className="border border-sky-500/30 rounded-lg bg-sky-500/5 p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="text-xs text-zinc-500">詳細天候分析</p>
                      <span className={cn(
                        "text-[9px] px-1.5 py-0.5 rounded font-medium",
                        selectedDay.source === "real"
                          ? "bg-emerald-500/20 text-emerald-400"
                          : "bg-zinc-700 text-zinc-400"
                      )}>
                        {selectedDay.source === "real" ? "即時預報" : "季節估算"}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-white font-mono">{selectedDay.date}</p>
                  </div>
                  {(() => {
                    const wDef = W_LEVELS.find(w => w.type === selectedDay.weather_type)
                    return (
                      <div className={cn("px-3 py-2 rounded-lg", wDef?.bg)}>
                        <p className={cn("text-sm font-bold font-mono", wDef?.color)}>{selectedDay.weather_type}</p>
                        <p className="text-[11px] text-zinc-400">{wDef?.label}</p>
                      </div>
                    )
                  })()}
                </div>

                {/* Metric cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wind className="h-3.5 w-3.5 text-sky-400" />
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">風速</p>
                    </div>
                    <p className="text-lg font-bold text-white font-mono">{selectedDay.wind_ms.toFixed(1)}</p>
                    <p className="text-[10px] text-zinc-500">m/s ({Math.round(selectedDay.wind_ms * 3.6)} km/h)</p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Wind className="h-3.5 w-3.5 text-zinc-400" />
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">陣風</p>
                    </div>
                    <p className="text-lg font-bold text-white font-mono">
                      {selectedDay.weather_today.gust_now_kmh != null
                        ? `${(selectedDay.weather_today.gust_now_kmh / 3.6).toFixed(1)}`
                        : "—"}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {selectedDay.weather_today.gust_now_kmh != null
                        ? `m/s (${selectedDay.weather_today.gust_now_kmh} km/h)`
                        : "無資料"}
                    </p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Droplets className="h-3.5 w-3.5 text-blue-400" />
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">降雨機率</p>
                    </div>
                    <p className="text-lg font-bold text-white font-mono">{selectedDay.rain_prob}%</p>
                    <p className="text-[10px] text-zinc-500">
                      {selectedDay.source === "real"
                        ? `累積 ${selectedDay.weather_today.rain_mmph_forecast} mm/h`
                        : "季節估算"}
                    </p>
                  </div>
                  <div className="bg-zinc-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Zap className="h-3.5 w-3.5 text-yellow-400" />
                      <p className="text-[10px] text-zinc-500 uppercase tracking-wider">雷陣雨</p>
                    </div>
                    <p className={cn("text-lg font-bold font-mono", selectedDay.weather_today.thunder_risk === 1 ? "text-yellow-400" : "text-emerald-400")}>
                      {selectedDay.weather_today.thunder_risk === 1 ? "有風險" : "無"}
                    </p>
                    <p className="text-[10px] text-zinc-500">
                      {selectedDay.weather_today.thunder_risk === 1 ? "建議取消" : "正常作業"}
                    </p>
                  </div>
                </div>

                {/* Site risk selector + WR decision */}
                <div className="border-t border-zinc-700 pt-3 space-y-3">
                  <p className="text-xs text-zinc-500 flex items-center gap-1.5">
                    <Info className="h-3 w-3" />
                    選擇假設場域風險等級，查看 W×R 決策結果：
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {R_LEVELS.map(r => (
                      <button
                        key={r.level}
                        onClick={() => setSiteRisk(r.level)}
                        className={cn(
                          "px-3 py-1.5 text-xs rounded-lg border transition-colors font-mono font-bold",
                          siteRisk === r.level
                            ? `${r.bg} ${r.color} border-current`
                            : "border-zinc-700 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                        )}
                      >
                        {r.level}
                        <span className={cn("ml-1 font-normal text-[10px]", siteRisk === r.level ? "opacity-80" : "text-zinc-600")}>
                          {r.label}
                        </span>
                      </button>
                    ))}
                  </div>
                  {wrDecision && (
                    <div className={cn("flex flex-wrap items-center gap-3 px-4 py-3 rounded-lg border", {
                      "bg-emerald-500/10 border-emerald-500/30": wrDecision === "go",
                      "bg-amber-500/10 border-amber-500/30": wrDecision === "cond",
                      "bg-zinc-800/60 border-zinc-700": wrDecision === "nogo",
                    })}>
                      <span className={cn("text-2xl font-bold font-mono", MATRIX_CELL[wrDecision].cls.split(" ").filter(c => c.startsWith("text-")).join(" "))}>
                        {MATRIX_CELL[wrDecision].label}
                      </span>
                      <div>
                        <p className={cn("text-sm font-semibold", {
                          "text-emerald-300": wrDecision === "go",
                          "text-amber-300": wrDecision === "cond",
                          "text-zinc-500": wrDecision === "nogo",
                        })}>
                          {MATRIX_CELL[wrDecision].fullLabel}
                        </p>
                        <p className="text-[11px] text-zinc-500">
                          {selectedDay.weather_type} × {siteRisk} → {MATRIX_CELL[wrDecision].label}
                          {wrDecision === "cond" && " · 需額外風險管控措施"}
                          {wrDecision === "nogo" && " · 建議取消或改期"}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-1.5">
                        <TrendingUp className="h-3.5 w-3.5 text-zinc-500" />
                        <span className="text-xs text-zinc-400">完成率估計</span>
                        <span className="text-sm font-bold text-white font-mono">
                          {completionForRL(siteRisk, selectedDay.weather_type)}%
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-xs text-zinc-600 px-1 flex items-center gap-1.5">
                <Info className="h-3 w-3" />
                點擊日期列查看詳細天候分析與 W×R 決策
              </p>
            )}
          </div>

          {/* ── Right: Legends ─────────────────────────────────────────────── */}
          <div className="w-full lg:w-60 lg:shrink-0 space-y-3">

            {/* 30d context */}
            <Card className="border-zinc-700 bg-zinc-800/20">
              <CardContent className="pt-3 pb-3 space-y-2">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">過去30日背景</p>
                <div className="space-y-1.5 text-[11px]">
                  {[
                    ["不穩定指數", `${Math.round(ctx!.weather_30d.instability_index * 100)}%`],
                    ["可預測性",   `${Math.round(ctx!.weather_30d.predictability_score * 100)}%`],
                    ["陣風 P90",  `${ctx!.weather_30d.gust_p90_kmh ?? "—"} km/h`],
                    ["大雨天數",  `${ctx!.weather_30d.heavy_rain_days_30} 天`],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-zinc-500">{label}</span>
                      <span className="text-zinc-300 font-mono">{val}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* W levels */}
            <Card className="border-zinc-700 bg-zinc-800/20">
              <CardContent className="pt-3 pb-3 space-y-1.5">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">天候等級 (W)</p>
                {W_LEVELS.map(w => (
                  <div key={w.type} className={cn("flex gap-2 px-2 py-1.5 rounded", w.bg)}>
                    <span className={cn("font-mono font-bold text-xs w-7 shrink-0 pt-0.5", w.color)}>{w.type}</span>
                    <div>
                      <p className="text-[11px] font-medium text-zinc-200 leading-tight">{w.label}</p>
                      <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{w.cond}</p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* W×R matrix */}
            <Card className="border-zinc-700 bg-zinc-800/20">
              <CardContent className="pt-3 pb-3">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">W × R 決策矩陣</p>
                <table className="w-full text-[10px]">
                  <thead>
                    <tr>
                      <th className="text-zinc-700 w-8 pb-1" />
                      {(["R0","R1","R2","R3","R4"] as RiskLevel[]).map(r => (
                        <th key={r} className={cn("text-center font-mono pb-1", R_COLOR[r])}>{r}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(["W0","W1","W2","W3","W4","W5"] as WeatherType[]).map(w => {
                      const wDef = W_LEVELS.find(wl => wl.type === w)
                      return (
                        <tr key={w}>
                          <td className={cn("font-mono font-bold pr-1 py-0.5", wDef?.color ?? "text-zinc-400")}>{w}</td>
                          {(["R0","R1","R2","R3","R4"] as RiskLevel[]).map(r => {
                            const cell = MATRIX_CELL[WR_MATRIX[w][r]]
                            const isActive = selectedDay?.weather_type === w && siteRisk === r
                            return (
                              <td key={r} className="py-0.5 px-0.5 text-center">
                                <span className={cn(
                                  "inline-block px-1 py-px rounded text-[9px] w-full text-center transition-all",
                                  cell.cls,
                                  isActive && "ring-1 ring-white/60 scale-110"
                                )}>
                                  {cell.label}
                                </span>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                <div className="flex gap-3 mt-2.5 text-[9px] text-zinc-600 border-t border-zinc-800 pt-2">
                  <span><span className="text-emerald-400">GO</span> 可排程</span>
                  <span><span className="text-amber-400">COND</span> 條件排</span>
                  <span><span className="text-zinc-500">✕</span> 不可排</span>
                </div>
              </CardContent>
            </Card>

          </div>
        </div>
      ) : (

        /* ── Pre-search: seasonal overview ──────────────────────────────── */
        !loading && (
          <div className="space-y-4">
            <div className="border border-zinc-800 rounded-lg p-5 bg-zinc-800/20">
              <p className="text-sm font-semibold text-zinc-300 mb-1 flex items-center gap-2">
                <CloudSun className="h-4 w-4 text-sky-400" />
                台灣全年季節性作業風險概覽
              </p>
              <p className="text-xs text-zinc-500 mb-4">
                輸入地址後，將顯示該地點實際14天預報（Open-Meteo）+ 全年365天季節估算。以下為台灣典型季節背景供參考。
              </p>
              <div className="flex items-end gap-1 h-24">
                {SEASONAL_PROFILE.map((m, i) => {
                  const pct = m.risk
                  const color =
                    pct >= 65 ? "bg-red-500/60" :
                    pct >= 50 ? "bg-orange-500/60" :
                    pct >= 40 ? "bg-amber-500/60" :
                    "bg-emerald-500/60"
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1 group">
                      <div className="relative w-full">
                        <div
                          className={cn("w-full rounded-sm", color)}
                          style={{ height: `${(pct / 100) * 80}px` }}
                        />
                        <div className="absolute -top-5 left-1/2 -translate-x-1/2 hidden group-hover:block bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-[9px] text-zinc-300 whitespace-nowrap z-10">
                          {m.note}
                        </div>
                      </div>
                      <span className="text-[8px] text-zinc-600">{m.label.slice(0, 2)}</span>
                    </div>
                  )
                })}
              </div>
              <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-zinc-600">
                <span><span className="text-emerald-400">■</span> 低風險</span>
                <span><span className="text-amber-400">■</span> 中風險</span>
                <span><span className="text-orange-400">■</span> 高風險</span>
                <span><span className="text-red-400">■</span> 極高風險（颱風/梅雨）</span>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="border-zinc-700 bg-zinc-800/20">
                <CardContent className="pt-3 pb-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">天候等級 (W)</p>
                  {W_LEVELS.map(w => (
                    <div key={w.type} className={cn("flex gap-2 px-2 py-1.5 rounded", w.bg)}>
                      <span className={cn("font-mono font-bold text-xs w-7 shrink-0 pt-0.5", w.color)}>{w.type}</span>
                      <div>
                        <p className="text-[11px] font-medium text-zinc-200 leading-tight">{w.label}</p>
                        <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{w.cond}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              <Card className="border-zinc-700 bg-zinc-800/20">
                <CardContent className="pt-3 pb-3 space-y-1.5">
                  <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">場域風險 (R)</p>
                  {R_LEVELS.map(r => (
                    <div key={r.level} className={cn("flex gap-2 px-2 py-1.5 rounded", r.bg)}>
                      <span className={cn("font-mono font-bold text-xs w-7 shrink-0 pt-0.5", r.color)}>{r.level}</span>
                      <div>
                        <p className="text-[11px] font-medium text-zinc-200 leading-tight">{r.label}</p>
                        <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{r.desc}</p>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        )
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-zinc-500 gap-3">
          <div className="w-5 h-5 rounded-full border-2 border-sky-500 border-t-transparent animate-spin" />
          <span className="text-sm">正在查詢地址與取得天候資料…</span>
        </div>
      )}
    </div>
  )
}
