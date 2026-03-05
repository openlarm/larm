"use client"
import { useState, useMemo, useEffect, useCallback } from "react"
import { StepShell } from "../StepShell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import {
  AlertTriangle, CalendarX, CheckCircle2, Info, ChevronLeft, ChevronRight,
  XCircle, ChevronDown, ChevronUp, Clock, ShieldCheck,
} from "lucide-react"
import { MOCK_WEATHER_SCENARIOS, MOCK_WEATHER_30D, MOCK_CONFLICTS } from "@/lib/mock-data"
import type {
  Mission, WeatherDay, RiskLevel, WeatherType, RiskResult, TimeResult,
  Weather30dInput, WeatherTodayInput, Contamination, TimeWindow,
} from "@/lib/types"
import { cn } from "@/lib/utils"
import { inferWCode, completionForRL, getWRDecision, simpleRiskFromW } from "@/lib/engines/model-helpers"
import { evaluateRisk, buildingSiteFromMission, operationalContextFromMission } from "@/lib/engines/risk-engine"
import { estimateTime } from "@/lib/engines/time-engine"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

// ── Weather legend data ─────────────────────────────────────────────────────

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

const MONTH_NAMES = ["一月", "二月", "三月", "四月", "五月", "六月", "七月", "八月", "九月", "十月", "十一月", "十二月"]

const MATRIX_CELL: Record<"go" | "cond" | "nogo", { label: string; cls: string }> = {
  go:   { label: "GO",   cls: "bg-emerald-500/20 text-emerald-300 font-semibold" },
  cond: { label: "COND", cls: "bg-amber-500/20 text-amber-300" },
  nogo: { label: "✕",   cls: "bg-zinc-800/60 text-zinc-600" },
}

const R_COLOR: Record<RiskLevel, string> = {
  R0: "text-emerald-400", R1: "text-sky-400",
  R2: "text-amber-400",   R3: "text-orange-400", R4: "text-red-500",
}
const R_BG: Record<RiskLevel, string> = {
  R0: "bg-emerald-500/10", R1: "bg-sky-500/10",
  R2: "bg-amber-500/10",   R3: "bg-orange-500/10", R4: "bg-red-500/10",
}

const R_LABEL: Record<string, string> = {
  R0: "無風險",  R1: "輕微",  R2: "中度",  R3: "重度",  R4: "禁止",
}

const DECISION_STYLE = {
  GO:          { icon: <CheckCircle2 className="h-5 w-5" />, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  CONDITIONAL: { icon: <AlertTriangle className="h-5 w-5" />, color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
  NO_GO:       { icon: <XCircle className="h-5 w-5" />,       color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
}

const GRADE_COLOR: Record<string, string> = { A: "text-emerald-400", B: "text-sky-400", C: "text-amber-400", D: "text-red-400" }

// R-level sort order (worst first)
const R_ORDER: RiskLevel[] = ["R4", "R3", "R2", "R1", "R0"]

function worstWeather(days: WeatherDay[], dates: string[]): WeatherDay | null {
  const sel = days.filter(d => dates.includes(d.date))
  if (sel.length === 0) return null
  for (const r of R_ORDER) {
    const found = sel.find(d => d.risk_level === r)
    if (found) return found
  }
  return sel[0]
}

function quickEstimateDays(facades: { area_m2: number }[], buildingType?: string): number {
  const baseline =
    buildingType === "solar" ? 500 :
    buildingType === "factory" ? 280 :
    buildingType === "luxury" ? 200 : 250
  const total = facades.reduce((s, f) => s + f.area_m2, 0)
  if (total === 0) return 1
  return Math.max(1, Math.ceil(total / (baseline * 8)))
}

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// Score bar
function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-300 w-8 text-right">{value}</span>
      <span className="text-xs text-zinc-600">/{max}</span>
    </div>
  )
}

// Ring gauge
function RScoreGauge({ score }: { score: number }) {
  const color =
    score >= 86 ? "#ef4444" :
    score >= 66 ? "#f97316" :
    score >= 41 ? "#f59e0b" :
    score >= 21 ? "#38bdf8" : "#34d399"
  const radius = 38
  const circumference = 2 * Math.PI * radius
  const offset = circumference * (1 - score / 100)
  return (
    <div className="relative w-24 h-24 flex-shrink-0">
      <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#27272a" strokeWidth="10" />
        <circle cx="50" cy="50" r={radius} fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.5s ease" }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white leading-none">{score}</span>
        <span className="text-[10px] text-zinc-500 mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

// ── Main Component ──────────────────────────────────────────────────────────

export function Step6Operations({ mission, update, next, back }: Props) {
  const scenarioKey = mission.airspace?.status === "NeedPermit" ? "W1-R2" : "W0-R0"

  // ── Weather data ─────────────────────────────────────────────────────────
  const [realWeather, setRealWeather] = useState<{
    weather_30d: Weather30dInput
    forecast: { date: string; weather_today: WeatherTodayInput }[]
  } | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(true)

  useEffect(() => {
    const lat = mission.address?.lat
    const lng = mission.address?.lng
    if (!lat || !lng) { setWeatherLoading(false); return }
    const city = encodeURIComponent(mission.address?.city ?? "")
    fetch(`/api/weather/context?lat=${lat}&lng=${lng}&city=${city}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (data?.weather_30d) setRealWeather(data) })
      .catch(() => {})
      .finally(() => setWeatherLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const allDays = useMemo(() => {
    const mockDays = MOCK_WEATHER_SCENARIOS[scenarioKey]
    if (!realWeather?.forecast?.length) return mockDays
    const forecastMap = new Map(realWeather.forecast.map(f => [f.date, f.weather_today]))
    return mockDays.map((day): WeatherDay => {
      const realToday = forecastMap.get(day.date)
      if (!realToday) return day
      const wt = inferWCode(realToday, realWeather.weather_30d)
      const rl = simpleRiskFromW(wt)
      return { ...day, weather_type: wt, risk_level: rl, wind_ms: Math.round(realToday.wind_now_kmh / 3.6 * 10) / 10,
        rain_prob: realToday.rain_prob_today_pct, completion_prob: completionForRL(rl, wt), weather_today: realToday }
    })
  }, [scenarioKey, realWeather])

  // ── Date selection ───────────────────────────────────────────────────────
  const initSelected = mission.selected_dates ?? (mission.selected_date ? [mission.selected_date] : [])
  const [selected, setSelected] = useState<string[]>(initSelected)
  const [hideHighRisk, setHideHighRisk] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0)

  // ── Risk + Time state ────────────────────────────────────────────────────
  const [riskResult, setRiskResult] = useState<RiskResult | null>(mission.risk ?? null)
  const [timeResult, setTimeResult] = useState<TimeResult | null>(mission.time_estimate ?? null)
  const [riskLoading, setRiskLoading] = useState(false)
  const [showExpl, setShowExpl] = useState(false)
  const [contamination, setContamination] = useState<Contamination[]>(["scale"])
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("day")

  // ── Month groups ─────────────────────────────────────────────────────────
  const monthGroups = useMemo(() => {
    const groups: { year: number; month: number; label: string; days: WeatherDay[] }[] = []
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

  const currentGroup = monthGroups[Math.min(monthOffset, monthGroups.length - 1)]
  const days = currentGroup?.days ?? []
  const filtered = hideHighRisk ? days.filter(d => d.risk_level !== "R3" && d.risk_level !== "R4") : days

  const top3 = useMemo(() => [...allDays].sort((a, b) => b.completion_prob - a.completion_prob).slice(0, 5).map(d => d.date), [allDays])
  const monthTop3 = useMemo(() => [...days].sort((a, b) => b.completion_prob - a.completion_prob).slice(0, 3).map(d => d.date), [days])

  const estimatedDays = quickEstimateDays(mission.facades ?? [], mission.building?.building_type)
  const conflictCount = selected.filter(d => MOCK_CONFLICTS[d]?.length > 0).length
  const hasR4Selected = selected.some(d => allDays.find(day => day.date === d)?.risk_level === "R4")
  const worst = worstWeather(allDays, selected)

  const toggleDate = (date: string) => setSelected(prev => prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date])

  // ── Auto-run risk + time when dates change ───────────────────────────────
  const runRiskAndTime = useCallback(() => {
    if (selected.length === 0) { setRiskResult(null); setTimeResult(null); return }
    const w = worstWeather(allDays, selected)
    if (!w) return

    setRiskLoading(true)
    setTimeout(() => {
      const w30 = realWeather?.weather_30d ?? MOCK_WEATHER_30D[scenarioKey]
      const building = buildingSiteFromMission(mission)
      const operational = operationalContextFromMission(mission, timeWindow)
      const r = evaluateRisk({ weather_30d: w30, weather_today: w.weather_today, building, operational, equipment: [] })
      setRiskResult(r)

      const t = estimateTime({
        missionType: mission.mission_type ?? "Cleaning",
        buildingType: mission.building?.building_type ?? "commercial",
        floors: mission.building?.height_floors ?? 10,
        wind_ms: w.wind_ms,
        facades: mission.facades ?? [],
        contamination,
        timeWindow,
        riskLevel: r.risk_level,
        bufferRatioOverride: r.buffer_ratio,
        waterSupply: mission.building?.water_supply ?? "Provided",
        powerSupply: mission.building?.power_supply ?? "Provided",
        rooftopAccess: mission.building?.rooftop_access ?? "Good",
        missionDays: selected.length,
      })
      setTimeResult(t)
      setRiskLoading(false)
    }, 800)
  }, [selected, allDays, realWeather, scenarioKey, mission, contamination, timeWindow])

  useEffect(() => { runRiskAndTime() }, [selected.length, contamination, timeWindow]) // eslint-disable-line react-hooks/exhaustive-deps

  const enough = selected.length >= estimatedDays

  const monthStats = useMemo(() => {
    const goCount = days.filter(d => d.risk_level === "R0" || d.risk_level === "R1").length
    const condCount = days.filter(d => d.risk_level === "R2").length
    const nogoCount = days.filter(d => d.risk_level === "R3" || d.risk_level === "R4").length
    const avgCompletion = days.length > 0 ? Math.round(days.reduce((s, d) => s + d.completion_prob, 0) / days.length) : 0
    return { goCount, condCount, nogoCount, avgCompletion }
  }, [days])

  // ── Next handler ─────────────────────────────────────────────────────────
  const handleNext = () => {
    if (selected.length === 0 || !worst || !riskResult || !timeResult) return
    if (riskResult.decision === "NO_GO") return
    update({
      selected_dates: selected,
      selected_date: selected[0],
      weather: worst,
      weather_30d: realWeather?.weather_30d ?? MOCK_WEATHER_30D[scenarioKey],
      risk: riskResult,
      time_estimate: timeResult,
    })
    next()
  }

  const canNext = selected.length > 0 && riskResult && riskResult.decision !== "NO_GO" && timeResult && !riskLoading

  return (
    <StepShell
      title="Step 6 — Operations"
      subtitle="作業規劃：天候 → 風險 → 時間"
      onBack={back}
      onNext={handleNext}
      nextDisabled={!canNext}
      wide
    >
      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION A: WEATHER WINDOW                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">A. 可作業日期 / 天候窗口</h3>

        <div className="flex flex-col lg:flex-row gap-5">
          {/* Calendar table */}
          <div className="flex-1 min-w-0 space-y-3">
            {/* Month navigation */}
            <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
              <button onClick={() => setMonthOffset(m => Math.max(0, m - 1))} disabled={monthOffset === 0}
                className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30 transition-colors">
                <ChevronLeft className="h-4 w-4 text-zinc-300" />
              </button>
              <div className="flex-1 flex items-center justify-center gap-3">
                <span className="text-sm font-semibold text-white">{currentGroup?.label}</span>
                <span className="text-[10px] text-zinc-500">
                  {days.length} 天 · GO {monthStats.goCount} · COND {monthStats.condCount} · NO-GO {monthStats.nogoCount} · 平均完成率 {monthStats.avgCompletion}%
                </span>
              </div>
              <button onClick={() => setMonthOffset(m => Math.min(monthGroups.length - 1, m + 1))} disabled={monthOffset >= monthGroups.length - 1}
                className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30 transition-colors">
                <ChevronRight className="h-4 w-4 text-zinc-300" />
              </button>
            </div>

            {/* Month tabs */}
            <div className="flex flex-wrap gap-1">
              {monthGroups.map((g, i) => {
                const selInMonth = selected.filter(d => g.days.some(gd => gd.date === d)).length
                return (
                  <button key={i} onClick={() => setMonthOffset(i)}
                    className={cn("px-2 py-1 text-[10px] rounded border transition-colors",
                      i === monthOffset ? "bg-zinc-600 border-zinc-500 text-white" : "border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300")}>
                    {MONTH_NAMES[g.month].slice(0, 2)}
                    {selInMonth > 0 && <span className="ml-1 text-emerald-400">{selInMonth}</span>}
                  </button>
                )
              })}
            </div>

            {/* Controls */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500">本月推薦：</span>
              {monthTop3.map(d => (
                <button key={d} onClick={() => toggleDate(d)}
                  className={cn("px-2.5 py-1 text-xs rounded border transition-colors",
                    selected.includes(d) ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200" : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20")}>
                  {d} ★
                </button>
              ))}
              <button onClick={() => setSelected(prev => [...new Set([...prev, ...monthTop3])])}
                className="px-2.5 py-1 text-xs rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors">全選本月 Top 3</button>
              <button onClick={() => setSelected([])}
                className="px-2.5 py-1 text-xs rounded border border-zinc-800 text-zinc-600 hover:bg-zinc-800 transition-colors">清除全部</button>
              <button onClick={() => setHideHighRisk(h => !h)}
                className={cn("ml-auto px-2.5 py-1 text-xs rounded border transition-colors",
                  hideHighRisk ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "border-zinc-700 text-zinc-500 hover:bg-zinc-800")}>
                {hideHighRisk ? "顯示全部" : "隱藏 R3/R4"}
              </button>
            </div>

            {/* Weather table */}
            <div className="border border-zinc-700 rounded-lg overflow-hidden max-h-[380px] overflow-y-auto">
              <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-xs">
                <thead className="bg-zinc-800/80 text-zinc-400 sticky top-0 z-10">
                  <tr>
                    <th className="px-2 py-2 w-8" />
                    <th className="px-3 py-2 text-left">日期</th>
                    <th className="px-3 py-2 text-left">
                      天候
                      {weatherLoading && <span className="ml-1 text-[9px] text-zinc-600 animate-pulse">取得中…</span>}
                      {!weatherLoading && realWeather && <span className="ml-1 text-[9px] text-emerald-600">● 即時</span>}
                      {!weatherLoading && !realWeather && <span className="ml-1 text-[9px] text-zinc-600">● 模擬</span>}
                    </th>
                    <th className="px-3 py-2 text-center">風速</th>
                    <th className="px-3 py-2 text-center">降雨%</th>
                    <th className="px-3 py-2 text-center">風險</th>
                    <th className="px-3 py-2 text-center">完成率</th>
                    <th className="px-3 py-2 text-center">衝突</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {filtered.map(day => {
                    const isSel = selected.includes(day.date)
                    const isTop = top3.includes(day.date)
                    const conflicts = MOCK_CONFLICTS[day.date] ?? []
                    const hasConflict = conflicts.length > 0
                    const wDef = W_LEVELS.find(w => w.type === day.weather_type)
                    return (
                      <tr key={day.date} onClick={() => toggleDate(day.date)}
                        className={cn("transition-colors cursor-pointer select-none",
                          isSel ? "bg-zinc-700/50" : hasConflict ? "hover:bg-amber-500/5" : "hover:bg-zinc-800/40")}>
                        <td className="px-2 py-2 text-center">
                          <div className={cn("w-4 h-4 rounded border-2 mx-auto transition-colors",
                            isSel ? "bg-emerald-500 border-emerald-500" : "border-zinc-600 hover:border-zinc-400")} />
                        </td>
                        <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">{day.date}{isTop && <span className="ml-1 text-emerald-400">★</span>}</td>
                        <td className={cn("px-3 py-2 font-mono font-bold", wDef?.color ?? "text-zinc-300")}>{day.weather_type}</td>
                        <td className="px-3 py-2 text-center text-zinc-300">{day.wind_ms.toFixed(1)} m/s</td>
                        <td className="px-3 py-2 text-center text-zinc-300">{day.rain_prob}%</td>
                        <td className="px-3 py-2 text-center">
                          <span className={cn("px-1.5 py-0.5 rounded font-mono font-bold", R_BG[day.risk_level], R_COLOR[day.risk_level])}>{day.risk_level}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <div className="w-10 h-1.5 bg-zinc-700 rounded-full"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${day.completion_prob}%` }} /></div>
                            <span className="text-zinc-300 w-7 text-right">{day.completion_prob}%</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-center">
                          {hasConflict ? (
                            <div className="relative group inline-block">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 border border-amber-500/30 text-amber-300 cursor-help whitespace-nowrap">⚠ {conflicts.length} 件</span>
                              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-20 w-52 p-2.5 rounded-lg bg-zinc-800 border border-zinc-600 text-left shadow-xl">
                                <p className="text-[10px] font-semibold text-zinc-400 mb-1.5 uppercase tracking-wider">衝突任務</p>
                                {conflicts.map(c => (
                                  <div key={c.mission_id} className="text-[10px] text-zinc-300 mb-1 leading-snug">
                                    <span className="font-mono text-zinc-500">{c.mission_id}</span><br />
                                    <span className="text-zinc-200">{c.client}</span>
                                    <span className="text-zinc-500"> · {c.type}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ) : <span className="text-zinc-700">—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {/* Selection summary */}
            <div className={cn("flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-lg border text-sm transition-colors",
              selected.length === 0 ? "border-zinc-800 bg-zinc-800/20 text-zinc-600" : enough ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5")}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-500">已選</span>
                <span className="text-xl font-bold text-white">{selected.length}</span>
                <span className="text-xs text-zinc-500">天</span>
              </div>
              <div className="h-4 w-px bg-zinc-700" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-500">預估需要</span>
                <span className="text-lg font-semibold text-zinc-200">~{estimatedDays}</span>
                <span className="text-xs text-zinc-500">天</span>
              </div>
              {conflictCount > 0 && (
                <>
                  <div className="h-4 w-px bg-zinc-700" />
                  <div className="flex items-center gap-1 text-amber-400 text-xs"><AlertTriangle className="h-3 w-3" />{conflictCount} 天衝突</div>
                </>
              )}
              <div className="ml-auto text-xs">
                {selected.length === 0 && <span className="text-zinc-600">請至少選擇一天</span>}
                {selected.length > 0 && enough && <span className="text-emerald-400">✓ 天數充足</span>}
                {selected.length > 0 && !enough && <span className="text-amber-400">⚠ 可能不足，可繼續或補選 {estimatedDays - selected.length} 天</span>}
              </div>
            </div>

            {selected.length > 1 && worst && (
              <div className="flex items-center gap-2 text-xs text-zinc-500 px-1">
                <Info className="h-3 w-3 shrink-0 text-zinc-600" /><span>風險評估以最高風險日為準：</span>
                <span className={cn("font-mono font-bold", R_COLOR[worst.risk_level])}>{worst.date} · {worst.weather_type}–{worst.risk_level}</span>
              </div>
            )}

            {hasR4Selected && (
              <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>已選日期含 R4（禁飛）。R4 日期無法進行作業，建議取消選取。</AlertDescription>
              </Alert>
            )}
            {conflictCount > 0 && (
              <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-300">
                <CalendarX className="h-4 w-4" />
                <AlertDescription>{conflictCount} 個已選日期與排定任務衝突。可繼續安排，衝突將在 Mission Plan 中標記待協調。</AlertDescription>
              </Alert>
            )}
          </div>

          {/* Legend sidebar */}
          <div className="w-full lg:w-60 lg:shrink-0 space-y-3">
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
            <Card className="border-zinc-700 bg-zinc-800/20">
              <CardContent className="pt-3 pb-3">
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">W × R 決策矩陣</p>
                <table className="w-full text-[10px]">
                  <thead><tr><th className="text-zinc-700 w-8 pb-1" />
                    {(["R0","R1","R2","R3","R4"] as RiskLevel[]).map(r => <th key={r} className={cn("text-center font-mono pb-1", R_COLOR[r])}>{r}</th>)}
                  </tr></thead>
                  <tbody>
                    {(["W0","W1","W2","W3","W4","W5"] as WeatherType[]).map(w => {
                      const wDef = W_LEVELS.find(wl => wl.type === w)
                      return (
                        <tr key={w}>
                          <td className={cn("font-mono font-bold pr-1 py-0.5", wDef?.color ?? "text-zinc-400")}>{w}</td>
                          {(["R0","R1","R2","R3","R4"] as RiskLevel[]).map(r => {
                            const cell = MATRIX_CELL[getWRDecision(w, r)]
                            return <td key={r} className="py-0.5 px-0.5 text-center"><span className={cn("inline-block px-1 py-px rounded text-[9px] w-full text-center", cell.cls)}>{cell.label}</span></td>
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
      </div>

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION B: RISK EVALUATION (auto-computed when dates selected)      */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {selected.length > 0 && (
        <div className="space-y-3 pt-4 border-t border-zinc-700/60">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">B. LARM v2.0 風險評估</h3>

          {riskLoading ? (
            <div className="space-y-3">
              <div className="h-52 bg-zinc-800 rounded animate-pulse" />
              <p className="text-xs text-zinc-500">LARM v2.0 評估中…</p>
            </div>
          ) : riskResult && (
            <>
              <Card className={`border ${DECISION_STYLE[riskResult.decision].bg}`}>
                <CardContent className="pt-5 space-y-4">
                  <div className="flex items-center gap-4">
                    <RScoreGauge score={riskResult.risk_score} />
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className={DECISION_STYLE[riskResult.decision].color}>{DECISION_STYLE[riskResult.decision].icon}</span>
                        <span className={`text-2xl font-bold ${DECISION_STYLE[riskResult.decision].color}`}>{riskResult.decision}</span>
                        <span className={cn("ml-auto font-mono font-bold text-lg px-2 py-0.5 rounded", R_COLOR[riskResult.risk_level])}>
                          {riskResult.risk_level} — {R_LABEL[riskResult.risk_level]}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-x-3 text-xs text-zinc-400">
                        <span>天候背景</span>
                        <span className="font-mono font-bold text-zinc-200">{riskResult.w_code} · W 分 {riskResult.base_w}{riskResult.secondary_w && <span className="text-zinc-500 ml-1">(次要 {riskResult.secondary_w})</span>}</span>
                        <span>Regime 置信度</span>
                        <span className={cn("font-mono font-bold", riskResult.regime_confidence >= 0.85 ? "text-emerald-400" : riskResult.regime_confidence >= 0.70 ? "text-amber-400" : "text-red-400")}>{(riskResult.regime_confidence * 100).toFixed(0)}%</span>
                        <span>現況天氣</span>
                        <span className="font-mono text-zinc-200">{riskResult.weather_now.toFixed(1)} / 42</span>
                        <span>Internal Grade</span>
                        <span className={cn("font-bold", GRADE_COLOR[riskResult.internal_grade] ?? "text-red-400")}>{riskResult.internal_grade}</span>
                      </div>
                      {riskResult.conditional_tier && (
                        <div className={cn("inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold border w-fit",
                          riskResult.conditional_tier === "A" ? "bg-amber-500/10 border-amber-500/30 text-amber-300" :
                          riskResult.conditional_tier === "C" ? "bg-orange-500/10 border-orange-500/30 text-orange-300" :
                          "bg-red-500/10 border-red-500/30 text-red-300")}>
                          <AlertTriangle className="h-3 w-3" /> CONDITIONAL — Tier {riskResult.conditional_tier}
                          {riskResult.conditional_tier === "A" && <span className="font-normal text-zinc-400 ml-1">（即時監控）</span>}
                          {riskResult.conditional_tier === "C" && <span className="font-normal text-zinc-400 ml-1">（主管確認）</span>}
                          {riskResult.conditional_tier === "D1" && <span className="font-normal text-zinc-400 ml-1">（主管審核+安全計畫）</span>}
                          {riskResult.conditional_tier === "D2" && <span className="font-normal text-zinc-400 ml-1">（雙方確認+安全簡報）</span>}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Score breakdown */}
                  <div className="pt-1 border-t border-zinc-700/60 space-y-2">
                    <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">分數分解</p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-zinc-400">
                      <div className="space-y-1"><div className="flex justify-between"><span>Base(W) · 天候背景</span><span className="font-mono text-zinc-300">{riskResult.base_w} / 22</span></div><ScoreBar value={riskResult.base_w} max={22} color="bg-sky-500" /></div>
                      <div className="space-y-1"><div className="flex justify-between"><span>WeatherNow · 當日天氣</span><span className="font-mono text-zinc-300">{riskResult.weather_now} / 42</span></div><ScoreBar value={riskResult.weather_now} max={42} color="bg-yellow-500" /></div>
                      <div className="space-y-1"><div className="flex justify-between"><span>G · 地面影響</span><span className="font-mono text-zinc-300">{riskResult.g_score} / 20</span></div><ScoreBar value={riskResult.g_score} max={20} color="bg-orange-500" /></div>
                      <div className="space-y-1"><div className="flex justify-between"><span>O · 作業情境</span><span className="font-mono text-zinc-300">{riskResult.o_score} / 12</span></div><ScoreBar value={riskResult.o_score} max={12} color="bg-purple-500" /></div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 pt-1 border-t border-zinc-700/60 text-xs">
                    <span className="text-zinc-500">時間緩衝比例（buffer_ratio）</span>
                    <span className="font-mono font-bold text-sky-400">{(riskResult.buffer_ratio * 100).toFixed(1)}%</span>
                  </div>
                </CardContent>
              </Card>

              {riskResult.controls.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">必要安全控制措施</p>
                  <div className="space-y-1.5">
                    {riskResult.controls.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm bg-zinc-800/50 rounded px-3 py-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" /><span className="text-zinc-300">{c}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {riskResult.requires_approval && riskResult.decision !== "NO_GO" && (
                <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-300">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>此任務條件需要主管審核（Conditional Go）。繼續後系統將標記為「待審核」狀態。</AlertDescription>
                </Alert>
              )}
              {riskResult.decision === "NO_GO" && (
                <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
                  <XCircle className="h-4 w-4" />
                  <AlertDescription>NO-GO：此天候/場域條件不允許作業。請修改選擇日期或條件。</AlertDescription>
                </Alert>
              )}

              {/* Explanations */}
              <div className="border border-zinc-700 rounded-lg overflow-hidden">
                <button onClick={() => setShowExpl(e => !e)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-800/40 text-xs text-zinc-400 hover:bg-zinc-800/70 transition-colors">
                  <span className="font-semibold uppercase tracking-wider">逐因子分析明細（{riskResult.explanations.length} 項）</span>
                  {showExpl ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {showExpl && (
                  <div className="divide-y divide-zinc-800/60">
                    {riskResult.explanations.map((e, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto_2fr] gap-x-3 px-4 py-2 text-xs items-start">
                        <span className="text-zinc-400 font-medium">{e.factor}</span>
                        <span className={cn("font-mono font-bold text-right tabular-nums", e.score > 0 ? "text-amber-400" : e.score < 0 ? "text-emerald-400" : "text-zinc-500")}>{e.score > 0 ? `+${e.score}` : e.score}</span>
                        <span className="text-zinc-600">{e.note} <span className="text-zinc-500">· 值: {e.value}</span></span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-4 text-xs text-zinc-500 pt-1 flex-wrap">
                <span className="font-mono">larm: <span className="text-emerald-400">{riskResult.versions.larm_version}</span></span>
                <span className="font-mono">params: <span className="text-emerald-400">{riskResult.versions.weather_regime_params_version}</span></span>
                <span>evaluated: {new Date(riskResult.evaluated_at).toLocaleTimeString()}</span>
                <span className="flex items-center gap-1 text-emerald-400 ml-auto"><ShieldCheck className="h-3 w-3" /> Evidence Saved ✓</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════ */}
      {/* SECTION C: TIME ESTIMATION                                          */}
      {/* ════════════════════════════════════════════════════════════════════ */}
      {riskResult && riskResult.decision !== "NO_GO" && timeResult && (
        <div className="space-y-3 pt-4 border-t border-zinc-700/60">
          <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">C. 作業時間預測</h3>

          {/* Controls */}
          <div className="flex gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">污染類型</label>
              <div className="flex gap-1.5">
                {(["dust","scale","mold","bird","exhaust","grease"] as Contamination[]).map(c => (
                  <button key={c} onClick={() => setContamination([c])}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${contamination[0] === c ? "bg-zinc-700 border-zinc-500 text-white" : "border-zinc-700 text-zinc-500 hover:bg-zinc-800"}`}>{c}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-zinc-400">作業時段</label>
              <div className="flex gap-1.5">
                {(["day","weekend","night"] as TimeWindow[]).map(t => (
                  <button key={t} onClick={() => setTimeWindow(t)}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${timeWindow === t ? "bg-zinc-700 border-zinc-500 text-white" : "border-zinc-700 text-zinc-500 hover:bg-zinc-800"}`}>{t}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "總工時", value: fmtDuration(timeResult.total_minutes), sub: `${timeResult.total_minutes} min` },
              { label: "建議作業天數", value: `${timeResult.suggested_days} 天`, sub: `每日 ${timeWindow === "night" ? "6" : "8"}hr${selected.length > 3 ? " (疲勞調整)" : ""}` },
              { label: "中斷預留比例", value: `${(timeResult.disruption_buffer_ratio * 100).toFixed(0)}%`, sub: `${timeResult.buffer_minutes} min` },
            ].map(({ label, value, sub }) => (
              <Card key={label} className="border-zinc-700 bg-zinc-800/40">
                <CardContent className="pt-4 text-center">
                  <p className="text-xs text-zinc-500 mb-1">{label}</p>
                  <p className="text-2xl font-bold text-white">{value}</p>
                  <p className="text-xs text-zinc-500 mt-0.5">{sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Breakdown */}
          <Card className="border-zinc-700 bg-zinc-800/30">
            <CardContent className="pt-4 space-y-2">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">計算明細</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
                <span className="text-zinc-400">標準效率</span><span className="font-mono text-zinc-200">{timeResult.baseline_productivity} ㎡/hr</span>
                <span className="text-zinc-400">實際效率（調整後）</span><span className="font-mono text-zinc-200">{timeResult.adjusted_productivity} ㎡/hr</span>
                <span className="text-zinc-400">純作業時間</span><span className="font-mono text-zinc-200">{fmtDuration(Math.round(timeResult.pure_operation_hours * 60))}</span>
                <span className="text-zinc-400">Setup</span><span className="font-mono text-zinc-200">{fmtDuration(timeResult.setup_minutes)}</span>
                <span className="text-zinc-400">Teardown</span><span className="font-mono text-zinc-200">{fmtDuration(timeResult.teardown_minutes)}</span>
                <span className="text-zinc-400">法定休息</span><span className="font-mono text-zinc-200">{fmtDuration(timeResult.rest_minutes)}</span>
                <span className="text-zinc-400">中斷預留</span><span className="font-mono text-zinc-200">{fmtDuration(timeResult.buffer_minutes)}</span>
              </div>
              <div className="pt-3 border-t border-zinc-700 text-xs text-zinc-500 space-y-1">
                <p>係數：高度 ×{timeResult.coefficient_snapshot.height} · 風速 ×{timeResult.coefficient_snapshot.wind} · 複雜度 ×{timeResult.coefficient_snapshot.complexity} · 污染 ×{timeResult.coefficient_snapshot.contamination} · 時段 ×{timeResult.coefficient_snapshot.time_window}</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono text-emerald-400">time_model: {timeResult.time_model_version}</span>
                  <span className="flex items-center gap-1 text-emerald-400 ml-auto"><ShieldCheck className="h-3 w-3" /> Evidence Saved ✓</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Day sufficiency */}
          {selected.length > 0 && timeResult && (
            <div className={`flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg border text-sm transition-colors ${selected.length >= timeResult.suggested_days ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-500">已選</span>
                <span className="text-xl font-bold text-white">{selected.length}</span>
                <span className="text-xs text-zinc-500">天</span>
              </div>
              <div className="h-4 w-px bg-zinc-700" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-500">引擎需要</span>
                <span className="text-xl font-bold text-white">{timeResult.suggested_days}</span>
                <span className="text-xs text-zinc-500">天</span>
              </div>
              <div className="ml-auto text-xs">
                {selected.length >= timeResult.suggested_days
                  ? <span className="text-emerald-400">✓ 日期充足</span>
                  : <span className="text-amber-400">⚠ 尚缺 {timeResult.suggested_days - selected.length} 天，建議補選</span>}
              </div>
            </div>
          )}
        </div>
      )}
    </StepShell>
  )
}
