"use client"
import { useState, useMemo, useEffect } from "react"
import { StepShell } from "../StepShell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent } from "@/components/ui/card"
import { AlertTriangle, CalendarX, CheckSquare, Info, ChevronLeft, ChevronRight } from "lucide-react"
import { MOCK_WEATHER_SCENARIOS, MOCK_WEATHER_30D, MOCK_CONFLICTS } from "@/lib/mock-data"
import type { Mission, WeatherDay, RiskLevel, WeatherType, Weather30dInput, WeatherTodayInput } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

// ── Legend data ────────────────────────────────────────────────────────────────

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

// W×R decision matrix
const WR_MATRIX: Record<WeatherType, Record<RiskLevel, "go" | "cond" | "nogo">> = {
  W0: { R0: "go",   R1: "go",   R2: "cond", R3: "nogo", R4: "nogo" },
  W1: { R0: "nogo", R1: "go",   R2: "cond", R3: "cond", R4: "nogo" },
  W2: { R0: "nogo", R1: "cond", R2: "cond", R3: "cond", R4: "nogo" },
  W3: { R0: "nogo", R1: "nogo", R2: "cond", R3: "cond", R4: "nogo" },
  W4: { R0: "nogo", R1: "cond", R2: "cond", R3: "cond", R4: "nogo" },
  W5: { R0: "nogo", R1: "nogo", R2: "cond", R3: "cond", R4: "nogo" },
}

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

// Quick estimate: facade area ÷ daily capacity (before time engine in Step 7)
function quickEstimateDays(facades: { area_m2: number }[], buildingType?: string): number {
  const baseline =
    buildingType === "solar" ? 500 :
    buildingType === "factory" ? 280 :
    buildingType === "luxury" ? 200 : 250
  const total = facades.reduce((s, f) => s + f.area_m2, 0)
  if (total === 0) return 1
  return Math.max(1, Math.ceil(total / (baseline * 8)))
}

// ── Real-weather helpers ───────────────────────────────────────────────────────

/** Infer a W-code from a real daily forecast + 30d background context */
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

/** Simple deterministic risk level from W-code (used for real forecast days) */
function simpleRiskFromW(w: WeatherType): RiskLevel {
  const map: Record<WeatherType, RiskLevel> = {
    W0: "R0", W1: "R1", W2: "R1", W3: "R2", W4: "R2", W5: "R3",
  }
  return map[w]
}

/** Estimated completion probability from risk + W-code */
function completionForRiskLocal(rl: RiskLevel, w: WeatherType): number {
  const rIdx = parseInt(rl[1])
  const wIdx = parseInt(w[1])
  const base = [97, 82, 60, 35, 10][rIdx]
  return Math.max(5, Math.min(99, base - wIdx * 3))
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Step5Weather({ mission, update, next, back }: Props) {
  const scenarioKey = mission.airspace?.status === "NeedPermit" ? "W1-R2" : "W0-R0"

  // ── Real weather state ────────────────────────────────────────────────────
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

  // ── allDays: mock baseline overridden by real forecast for near-future ────
  const allDays = useMemo(() => {
    const mockDays = MOCK_WEATHER_SCENARIOS[scenarioKey]
    if (!realWeather?.forecast?.length) return mockDays

    const forecastMap = new Map(
      realWeather.forecast.map(f => [f.date, f.weather_today])
    )
    return mockDays.map((day): WeatherDay => {
      const realToday = forecastMap.get(day.date)
      if (!realToday) return day  // far-future: keep mock generation as-is
      const wt = inferWCode(realToday, realWeather.weather_30d)
      const rl = simpleRiskFromW(wt)
      return {
        ...day,
        weather_type: wt,
        risk_level: rl,
        wind_ms: Math.round(realToday.wind_now_kmh / 3.6 * 10) / 10,
        rain_prob: realToday.rain_prob_today_pct,
        completion_prob: completionForRiskLocal(rl, wt),
        weather_today: realToday,
      }
    })
  }, [scenarioKey, realWeather])

  const initSelected =
    mission.selected_dates ??
    (mission.selected_date ? [mission.selected_date] : [])
  const [selected, setSelected] = useState<string[]>(initSelected)
  const [hideHighRisk, setHideHighRisk] = useState(false)
  const [monthOffset, setMonthOffset] = useState(0) // 0 = current month

  // Group days by month for navigation
  const monthGroups = useMemo(() => {
    const groups: { year: number; month: number; label: string; days: WeatherDay[] }[] = []
    const seen = new Map<string, number>()
    for (const day of allDays) {
      const d = new Date(day.date)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      if (!seen.has(key)) {
        seen.set(key, groups.length)
        groups.push({
          year: d.getFullYear(),
          month: d.getMonth(),
          label: `${d.getFullYear()} ${MONTH_NAMES[d.getMonth()]}`,
          days: [],
        })
      }
      groups[seen.get(key)!].days.push(day)
    }
    return groups
  }, [allDays])

  const currentGroup = monthGroups[Math.min(monthOffset, monthGroups.length - 1)]
  const days = currentGroup?.days ?? []

  const filtered = hideHighRisk
    ? days.filter(d => d.risk_level !== "R3" && d.risk_level !== "R4")
    : days

  // Top 3 across entire dataset for recommendations
  const top3 = useMemo(() =>
    [...allDays]
      .sort((a, b) => b.completion_prob - a.completion_prob)
      .slice(0, 5)
      .map(d => d.date),
    [allDays]
  )

  // Top 3 in current month view for quick selection
  const monthTop3 = useMemo(() =>
    [...days]
      .sort((a, b) => b.completion_prob - a.completion_prob)
      .slice(0, 3)
      .map(d => d.date),
    [days]
  )

  const estimatedDays = quickEstimateDays(
    mission.facades ?? [],
    mission.building?.building_type
  )

  const conflictCount = selected.filter(d => MOCK_CONFLICTS[d]?.length > 0).length
  const hasR4Selected = selected.some(d => allDays.find(day => day.date === d)?.risk_level === "R4")
  const worst = worstWeather(allDays, selected)

  const toggleDate = (date: string) =>
    setSelected(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    )

  const handleNext = () => {
    if (selected.length === 0 || !worst) return
    update({
      selected_dates: selected,
      selected_date: selected[0],
      weather: worst,
      weather_30d: realWeather?.weather_30d ?? MOCK_WEATHER_30D[scenarioKey],
    })
    next()
  }

  const enough = selected.length >= estimatedDays

  // Month summary stats
  const monthStats = useMemo(() => {
    const goCount = days.filter(d => d.risk_level === "R0" || d.risk_level === "R1").length
    const condCount = days.filter(d => d.risk_level === "R2").length
    const nogoCount = days.filter(d => d.risk_level === "R3" || d.risk_level === "R4").length
    const avgCompletion = days.length > 0
      ? Math.round(days.reduce((s, d) => s + d.completion_prob, 0) / days.length)
      : 0
    return { goCount, condCount, nogoCount, avgCompletion }
  }, [days])

  return (
    <StepShell
      title="Step 5 — Weather Window"
      subtitle="可作業日期 / 天候窗口（多選，近一年度）"
      onBack={back}
      onNext={handleNext}
      nextDisabled={selected.length === 0}
      wide
    >
      <div className="flex gap-5">
        {/* ── Left: table ─────────────────────────────────────────── */}
        <div className="flex-1 min-w-0 space-y-3">

          {/* Month navigation */}
          <div className="flex items-center gap-2 bg-zinc-800/50 rounded-lg px-3 py-2">
            <button
              onClick={() => setMonthOffset(m => Math.max(0, m - 1))}
              disabled={monthOffset === 0}
              className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="h-4 w-4 text-zinc-300" />
            </button>
            <div className="flex-1 flex items-center justify-center gap-3">
              <span className="text-sm font-semibold text-white">{currentGroup?.label}</span>
              <span className="text-[10px] text-zinc-500">
                {days.length} 天 · GO {monthStats.goCount} · COND {monthStats.condCount} · NO-GO {monthStats.nogoCount} · 平均完成率 {monthStats.avgCompletion}%
              </span>
            </div>
            <button
              onClick={() => setMonthOffset(m => Math.min(monthGroups.length - 1, m + 1))}
              disabled={monthOffset >= monthGroups.length - 1}
              className="p-1 rounded hover:bg-zinc-700 disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="h-4 w-4 text-zinc-300" />
            </button>
          </div>

          {/* Month quick-jump tabs */}
          <div className="flex flex-wrap gap-1">
            {monthGroups.map((g, i) => {
              const selInMonth = selected.filter(d => g.days.some(gd => gd.date === d)).length
              return (
                <button
                  key={i}
                  onClick={() => setMonthOffset(i)}
                  className={cn(
                    "px-2 py-1 text-[10px] rounded border transition-colors",
                    i === monthOffset
                      ? "bg-zinc-600 border-zinc-500 text-white"
                      : "border-zinc-800 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                  )}
                >
                  {MONTH_NAMES[g.month].slice(0, 2)}
                  {selInMonth > 0 && (
                    <span className="ml-1 text-emerald-400">{selInMonth}</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Controls row */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-zinc-500">本月推薦：</span>
            {monthTop3.map(d => (
              <button
                key={d}
                onClick={() => toggleDate(d)}
                className={cn(
                  "px-2.5 py-1 text-xs rounded border transition-colors",
                  selected.includes(d)
                    ? "bg-emerald-500/20 border-emerald-500/40 text-emerald-200"
                    : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20"
                )}
              >
                {d} ★
              </button>
            ))}
            <button
              onClick={() => setSelected(prev => [...new Set([...prev, ...monthTop3])])}
              className="px-2.5 py-1 text-xs rounded border border-zinc-700 text-zinc-400 hover:bg-zinc-800 transition-colors"
            >
              全選本月 Top 3
            </button>
            <button
              onClick={() => setSelected([])}
              className="px-2.5 py-1 text-xs rounded border border-zinc-800 text-zinc-600 hover:bg-zinc-800 transition-colors"
            >
              清除全部
            </button>
            <button
              onClick={() => setHideHighRisk(h => !h)}
              className={cn(
                "ml-auto px-2.5 py-1 text-xs rounded border transition-colors",
                hideHighRisk
                  ? "bg-zinc-700 border-zinc-600 text-zinc-200"
                  : "border-zinc-700 text-zinc-500 hover:bg-zinc-800"
              )}
            >
              {hideHighRisk ? "顯示全部" : "隱藏 R3/R4"}
            </button>
          </div>

          {/* Weather table */}
          <div className="border border-zinc-700 rounded-lg overflow-hidden max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-800/80 text-zinc-400 sticky top-0 z-10">
                <tr>
                  <th className="px-2 py-2 w-8" />
                  <th className="px-3 py-2 text-left">日期</th>
                  <th className="px-3 py-2 text-left">
                    天候
                    {weatherLoading && (
                      <span className="ml-1 text-[9px] text-zinc-600 animate-pulse">取得中…</span>
                    )}
                    {!weatherLoading && realWeather && (
                      <span className="ml-1 text-[9px] text-emerald-600">● 即時</span>
                    )}
                    {!weatherLoading && !realWeather && (
                      <span className="ml-1 text-[9px] text-zinc-600">● 模擬</span>
                    )}
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
                    <tr
                      key={day.date}
                      onClick={() => toggleDate(day.date)}
                      className={cn(
                        "transition-colors cursor-pointer select-none",
                        isSel
                          ? "bg-zinc-700/50"
                          : hasConflict
                          ? "hover:bg-amber-500/5"
                          : "hover:bg-zinc-800/40"
                      )}
                    >
                      {/* Checkbox */}
                      <td className="px-2 py-2 text-center">
                        <div className={cn(
                          "w-4 h-4 rounded border-2 mx-auto transition-colors",
                          isSel
                            ? "bg-emerald-500 border-emerald-500"
                            : "border-zinc-600 hover:border-zinc-400"
                        )} />
                      </td>

                      {/* Date */}
                      <td className="px-3 py-2 font-mono text-zinc-300 whitespace-nowrap">
                        {day.date}
                        {isTop && <span className="ml-1 text-emerald-400">★</span>}
                      </td>

                      {/* Weather type */}
                      <td className={cn("px-3 py-2 font-mono font-bold", wDef?.color ?? "text-zinc-300")}>
                        {day.weather_type}
                      </td>

                      {/* Wind */}
                      <td className="px-3 py-2 text-center text-zinc-300">{day.wind_ms.toFixed(1)} m/s</td>

                      {/* Rain prob */}
                      <td className="px-3 py-2 text-center text-zinc-300">{day.rain_prob}%</td>

                      {/* Risk level */}
                      <td className="px-3 py-2 text-center">
                        <span className={cn("px-1.5 py-0.5 rounded font-mono font-bold", R_BG[day.risk_level], R_COLOR[day.risk_level])}>
                          {day.risk_level}
                        </span>
                      </td>

                      {/* Completion prob bar */}
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <div className="w-10 h-1.5 bg-zinc-700 rounded-full">
                            <div
                              className="h-full rounded-full bg-emerald-500"
                              style={{ width: `${day.completion_prob}%` }}
                            />
                          </div>
                          <span className="text-zinc-300 w-7 text-right">{day.completion_prob}%</span>
                        </div>
                      </td>

                      {/* Conflict column with hover tooltip */}
                      <td className="px-3 py-2 text-center">
                        {hasConflict ? (
                          <div className="relative group inline-block">
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 border border-amber-500/30 text-amber-300 cursor-help whitespace-nowrap">
                              ⚠ {conflicts.length} 件
                            </span>
                            {/* Tooltip */}
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
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Summary bar */}
          <div className={cn(
            "flex flex-wrap items-center gap-4 px-4 py-2.5 rounded-lg border text-sm transition-colors",
            selected.length === 0
              ? "border-zinc-800 bg-zinc-800/20 text-zinc-600"
              : enough
              ? "border-emerald-500/30 bg-emerald-500/5"
              : "border-amber-500/30 bg-amber-500/5"
          )}>
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
              <span className="text-[10px] text-zinc-600">（精確值見 Step 7）</span>
            </div>
            {conflictCount > 0 && (
              <>
                <div className="h-4 w-px bg-zinc-700" />
                <div className="flex items-center gap-1 text-amber-400 text-xs">
                  <AlertTriangle className="h-3 w-3" />
                  {conflictCount} 天衝突
                </div>
              </>
            )}
            <div className="ml-auto text-xs">
              {selected.length === 0 && <span className="text-zinc-600">請至少選擇一天</span>}
              {selected.length > 0 && enough && <span className="text-emerald-400">✓ 天數充足</span>}
              {selected.length > 0 && !enough && (
                <span className="text-amber-400">
                  ⚠ 可能不足，可繼續或補選 {estimatedDays - selected.length} 天
                </span>
              )}
            </div>
          </div>

          {/* Worst-case note (only when >1 day selected) */}
          {selected.length > 1 && worst && (
            <div className="flex items-center gap-2 text-xs text-zinc-500 px-1">
              <Info className="h-3 w-3 shrink-0 text-zinc-600" />
              <span>風險評估以最高風險日為準：</span>
              <span className={cn("font-mono font-bold", R_COLOR[worst.risk_level])}>
                {worst.date} · {worst.weather_type}–{worst.risk_level}
              </span>
            </div>
          )}

          {/* Alerts */}
          {hasR4Selected && (
            <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                已選日期含 R4（禁飛）。R4 日期無法進行作業，建議取消選取。
              </AlertDescription>
            </Alert>
          )}

          {conflictCount > 0 && (
            <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-300">
              <CalendarX className="h-4 w-4" />
              <AlertDescription>
                {conflictCount} 個已選日期與排定任務衝突（hover 衝突標記可查看詳情）。
                可繼續安排，衝突將在 Mission Plan 中標記待協調。
              </AlertDescription>
            </Alert>
          )}
        </div>

        {/* ── Right: Legend ────────────────────────────────────────── */}
        <div className="w-60 shrink-0 space-y-3">

          {/* W levels */}
          <Card className="border-zinc-700 bg-zinc-800/20">
            <CardContent className="pt-3 pb-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                天候等級 (W)
              </p>
              {W_LEVELS.map(w => (
                <div key={w.type} className={cn("flex gap-2 px-2 py-1.5 rounded", w.bg)}>
                  <span className={cn("font-mono font-bold text-xs w-7 shrink-0 pt-0.5", w.color)}>
                    {w.type}
                  </span>
                  <div>
                    <p className="text-[11px] font-medium text-zinc-200 leading-tight">{w.label}</p>
                    <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{w.cond}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* R levels */}
          <Card className="border-zinc-700 bg-zinc-800/20">
            <CardContent className="pt-3 pb-3 space-y-1.5">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2">
                場域風險 (R)
              </p>
              {R_LEVELS.map(r => (
                <div key={r.level} className={cn("flex gap-2 px-2 py-1.5 rounded", r.bg)}>
                  <span className={cn("font-mono font-bold text-xs w-7 shrink-0 pt-0.5", r.color)}>
                    {r.level}
                  </span>
                  <div>
                    <p className="text-[11px] font-medium text-zinc-200 leading-tight">{r.label}</p>
                    <p className="text-[10px] text-zinc-500 leading-tight mt-0.5">{r.desc}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* W×R decision matrix */}
          <Card className="border-zinc-700 bg-zinc-800/20">
            <CardContent className="pt-3 pb-3">
              <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider mb-2.5">
                W × R 決策矩陣
              </p>
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
                          return (
                            <td key={r} className="py-0.5 px-0.5 text-center">
                              <span className={cn("inline-block px-1 py-px rounded text-[9px] w-full text-center", cell.cls)}>
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
    </StepShell>
  )
}
