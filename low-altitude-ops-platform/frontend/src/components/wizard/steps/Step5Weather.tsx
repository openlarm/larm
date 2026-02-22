"use client"
import { useState } from "react"
import { StepShell } from "../StepShell"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle } from "lucide-react"
import { MOCK_WEATHER_SCENARIOS } from "@/lib/mock-data"
import type { Mission, WeatherDay, RiskLevel } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

const R_COLOR: Record<RiskLevel, string> = {
  R0: "text-emerald-400", R1: "text-sky-400",
  R2: "text-amber-400",   R3: "text-orange-400", R4: "text-red-500",
}
const R_BG: Record<RiskLevel, string> = {
  R0: "bg-emerald-500/10", R1: "bg-sky-500/10",
  R2: "bg-amber-500/10",   R3: "bg-orange-500/10", R4: "bg-red-500/10",
}

export function Step5Weather({ mission, update, next, back }: Props) {
  // Pick scenario based on airspace status for variety
  const scenarioKey = mission.airspace?.status === "NeedPermit" ? "W1-R2" : "W0-R0"
  const days = MOCK_WEATHER_SCENARIOS[scenarioKey]

  const [selected, setSelected] = useState<string | null>(mission.selected_date ?? null)
  const [hideHighRisk, setHideHighRisk] = useState(false)

  const filtered = hideHighRisk ? days.filter(d => d.risk_level !== "R3" && d.risk_level !== "R4") : days
  const top3 = [...days]
    .sort((a, b) => b.completion_prob - a.completion_prob)
    .slice(0, 3)
    .map(d => d.date)

  const selectedDay = days.find(d => d.date === selected)

  const handleNext = () => {
    if (!selected || !selectedDay) return
    update({ selected_date: selected, weather: selectedDay })
    next()
  }

  return (
    <StepShell title="Step 5 — Weather Window" subtitle="可作業日期 / 天候窗口" onBack={back} onNext={handleNext} nextDisabled={!selected}>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-xs text-zinc-400">建議日期 Top 3：</span>
        {top3.map(d => (
          <button key={d} onClick={() => setSelected(d)}
            className="px-2.5 py-1 text-xs rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20 transition-colors">
            {d}
          </button>
        ))}
        <button
          onClick={() => setHideHighRisk(h => !h)}
          className={`ml-auto px-2.5 py-1 text-xs rounded border transition-colors ${hideHighRisk ? "bg-zinc-700 border-zinc-600 text-zinc-200" : "border-zinc-700 text-zinc-500 hover:bg-zinc-800"}`}
        >
          {hideHighRisk ? "顯示全部" : "隱藏 R3/R4"}
        </button>
      </div>

      {/* Weather table */}
      <div className="border border-zinc-700 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-zinc-800/80 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">日期</th>
              <th className="px-3 py-2 text-left">天候</th>
              <th className="px-3 py-2 text-center">風速</th>
              <th className="px-3 py-2 text-center">降雨%</th>
              <th className="px-3 py-2 text-center">風險</th>
              <th className="px-3 py-2 text-center">完成率</th>
              <th className="px-3 py-2 text-center">選擇</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {filtered.map(day => {
              const isTop = top3.includes(day.date)
              const isSel = day.date === selected
              return (
                <tr key={day.date}
                  className={cn("transition-colors", isSel ? "bg-zinc-700/60" : "hover:bg-zinc-800/40")}>
                  <td className="px-3 py-2 font-mono text-zinc-300">
                    {day.date}
                    {isTop && <span className="ml-1 text-emerald-400 text-[10px]">★</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-zinc-300">{day.weather_type}</td>
                  <td className="px-3 py-2 text-center text-zinc-300">{day.wind_ms.toFixed(1)} m/s</td>
                  <td className="px-3 py-2 text-center text-zinc-300">{day.rain_prob}%</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded font-mono font-bold ${R_BG[day.risk_level]} ${R_COLOR[day.risk_level]}`}>
                      {day.risk_level}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <div className="w-12 h-1.5 bg-zinc-700 rounded-full">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${day.completion_prob}%` }} />
                      </div>
                      <span className="text-zinc-300">{day.completion_prob}%</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => setSelected(day.date)}
                      className={cn("w-4 h-4 rounded-full border-2 transition-colors",
                        isSel ? "bg-emerald-500 border-emerald-500" : "border-zinc-600 hover:border-zinc-400"
                      )} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {selected && selectedDay?.risk_level === "R4" && (
        <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>選擇日期風險等級為 R4（禁飛），不建議安排。請選擇其他日期或申請例外。</AlertDescription>
        </Alert>
      )}
    </StepShell>
  )
}
