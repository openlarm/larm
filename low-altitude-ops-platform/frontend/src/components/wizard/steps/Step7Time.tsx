"use client"
import { useEffect, useState } from "react"
import { StepShell } from "../StepShell"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Clock, AlertTriangle, ShieldCheck } from "lucide-react"
import { estimateTime } from "@/lib/engines/time-engine"
import type { Mission, TimeResult, Contamination, TimeWindow } from "@/lib/types"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

function fmtDuration(mins: number) {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function Step7Time({ mission, update, next, back }: Props) {
  const [result, setResult] = useState<TimeResult | null>(mission.time_estimate ?? null)
  const [loading, setLoading] = useState(!mission.time_estimate)
  const [contamination, setContamination] = useState<Contamination[]>(["scale"])
  const [timeWindow, setTimeWindow] = useState<TimeWindow>("day")

  const run = () => {
    setLoading(true)
    setTimeout(() => {
      const r = estimateTime({
        missionType: mission.mission_type ?? "Cleaning",
        buildingType: mission.building?.building_type ?? "commercial",
        floors: mission.building?.height_floors ?? 10,
        wind_ms: mission.weather?.wind_ms ?? 3,
        facades: mission.facades ?? [],
        contamination,
        timeWindow,
        riskLevel: mission.risk?.risk_level ?? "R1",
        waterSupply: mission.building?.water_supply ?? "Provided",
        powerSupply: mission.building?.power_supply ?? "Provided",
        rooftopAccess: mission.building?.rooftop_access ?? "Good",
      })
      setResult(r)
      setLoading(false)
    }, 900)
  }

  useEffect(() => { run() }, [contamination, timeWindow])

  const handleNext = () => {
    if (!result) return
    update({ time_estimate: result })
    next()
  }

  const selectedDays = mission.selected_dates?.length ?? 0
  const needMoreDays = result ? selectedDays < result.suggested_days : false
  const dayGap = result ? result.suggested_days - selectedDays : 0

  return (
    <StepShell title="Step 7 — Time Estimation" subtitle="作業時間預測" onBack={back} onNext={handleNext} nextDisabled={!result || loading}>

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

      {loading ? (
        <div className="space-y-3">
          <div className="h-32 bg-zinc-800 rounded animate-pulse" />
          <p className="text-xs text-zinc-500">時間模型計算中… time_model_v1.0</p>
        </div>
      ) : result && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "總工時", value: fmtDuration(result.total_minutes), sub: `${result.total_minutes} min` },
              { label: "建議作業天數", value: `${result.suggested_days} 天`, sub: "每日 8hr" },
              { label: "中斷預留比例", value: `${(result.disruption_buffer_ratio * 100).toFixed(0)}%`, sub: `${result.buffer_minutes} min` },
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
                <span className="text-zinc-400">標準效率</span><span className="font-mono text-zinc-200">{result.baseline_productivity} ㎡/hr</span>
                <span className="text-zinc-400">實際效率（調整後）</span><span className="font-mono text-zinc-200">{result.adjusted_productivity} ㎡/hr</span>
                <span className="text-zinc-400">純作業時間</span><span className="font-mono text-zinc-200">{fmtDuration(Math.round(result.pure_operation_hours * 60))}</span>
                <span className="text-zinc-400">Setup</span><span className="font-mono text-zinc-200">{fmtDuration(result.setup_minutes)}</span>
                <span className="text-zinc-400">Teardown</span><span className="font-mono text-zinc-200">{fmtDuration(result.teardown_minutes)}</span>
                <span className="text-zinc-400">法定休息</span><span className="font-mono text-zinc-200">{fmtDuration(result.rest_minutes)}</span>
                <span className="text-zinc-400">中斷預留</span><span className="font-mono text-zinc-200">{fmtDuration(result.buffer_minutes)}</span>
              </div>

              <div className="pt-3 border-t border-zinc-700 text-xs text-zinc-500 space-y-1">
                <p>係數：高度 ×{result.coefficient_snapshot.height} · 風速 ×{result.coefficient_snapshot.wind} · 複雜度 ×{result.coefficient_snapshot.complexity} · 污染 ×{result.coefficient_snapshot.contamination} · 時段 ×{result.coefficient_snapshot.time_window}</p>
                <div className="flex items-center gap-2">
                  <Clock className="h-3 w-3" />
                  <span className="font-mono text-emerald-400">time_model: {result.time_model_version}</span>
                  <span className="flex items-center gap-1 text-emerald-400 ml-auto"><ShieldCheck className="h-3 w-3" /> Evidence Saved ✓</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Date sufficiency check */}
          {selectedDays > 0 && (
            <div className={`flex flex-wrap items-center gap-4 px-4 py-3 rounded-lg border text-sm transition-colors ${ !needMoreDays ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5" }`}>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-500">Step 5 已選</span>
                <span className="text-xl font-bold text-white">{selectedDays}</span>
                <span className="text-xs text-zinc-500">天</span>
              </div>
              <div className="h-4 w-px bg-zinc-700" />
              <div className="flex items-baseline gap-1.5">
                <span className="text-xs text-zinc-500">引擎需要</span>
                <span className="text-xl font-bold text-white">{result.suggested_days}</span>
                <span className="text-xs text-zinc-500">天</span>
              </div>
              <div className="ml-auto text-xs">
                {!needMoreDays
                  ? <span className="text-emerald-400">✓ 日期充足</span>
                  : <span className="text-amber-400">⚠ 尚缺 {dayGap} 天，建議返回 Step 5 補選</span>
                }
              </div>
            </div>
          )}

          {needMoreDays && (
            <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                精確工時估算需 {result.suggested_days} 天，但 Step 5 僅選擇 {selectedDays} 天（差 {dayGap} 天）。
                可返回 Step 5 補選日期，或繼續並於 Mission Plan 中標記分批施工。
              </AlertDescription>
            </Alert>
          )}
        </>
      )}
    </StepShell>
  )
}
