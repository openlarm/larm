"use client"
import { useEffect, useState } from "react"
import { StepShell } from "../StepShell"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react"
import { evaluateRisk, buildingSiteFromMission, operationalContextFromMission } from "@/lib/engines/risk-engine"
import { MOCK_WEATHER_30D } from "@/lib/mock-data"
import type { Mission, RiskResult } from "@/lib/types"
import { cn } from "@/lib/utils"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

const DECISION_STYLE = {
  GO:          { icon: <CheckCircle2 className="h-5 w-5" />, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  CONDITIONAL: { icon: <AlertTriangle className="h-5 w-5" />, color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
  NO_GO:       { icon: <XCircle className="h-5 w-5" />,       color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
}

const GRADE_COLOR = { A: "text-emerald-400", B: "text-sky-400", C: "text-amber-400", D: "text-red-400" }

const R_COLOR: Record<string, string> = {
  R0: "text-emerald-400", R1: "text-sky-400", R2: "text-amber-400", R3: "text-orange-400", R4: "text-red-500",
}

const R_LABEL: Record<string, string> = {
  R0: "無風險",  R1: "輕微",  R2: "中度",  R3: "重度",  R4: "禁止",
}

// Score bar with color tiers
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

// Ring gauge for R_score
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
        <circle
          cx="50" cy="50" r={radius} fill="none"
          stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-white leading-none">{score}</span>
        <span className="text-[10px] text-zinc-500 mt-0.5">/ 100</span>
      </div>
    </div>
  )
}

export function Step6Risk({ mission, update, next, back }: Props) {
  const [result, setResult] = useState<RiskResult | null>(mission.risk ?? null)
  const [loading, setLoading] = useState(!mission.risk)
  const [showExpl, setShowExpl] = useState(false)

  useEffect(() => {
    if (mission.risk) return
    const t = setTimeout(() => {
      const weather = mission.weather
      if (!weather) return

      // Derive 30d context: use scenario key stored in mission, or fall back to "W0-R0"
      const w30 = mission.weather_30d ?? MOCK_WEATHER_30D["W0-R0"]

      const building = buildingSiteFromMission(mission)
      const operational = operationalContextFromMission(mission, "day")

      const r = evaluateRisk({ weather_30d: w30, weather_today: weather.weather_today, building, operational })
      setResult(r)
      setLoading(false)
    }, 1200)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNext = () => {
    if (!result) return
    update({ risk: result })
    next()
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-6 w-64 bg-zinc-800 rounded animate-pulse" />
        <div className="h-52 bg-zinc-800 rounded animate-pulse" />
        <p className="text-xs text-zinc-500">LARM v1.0 評估中…</p>
      </div>
    )
  }

  if (!result) return null

  const style = DECISION_STYLE[result.decision]

  return (
    <StepShell
      title="Step 6 — Risk Evaluation"
      subtitle="LARM v1.0 風險評估"
      onBack={back}
      onNext={result.decision !== "NO_GO" ? handleNext : undefined}
      nextDisabled={result.decision === "NO_GO"}
    >
      {/* ── Main result card ───────────────────────────────────────────────── */}
      <Card className={`border ${style.bg}`}>
        <CardContent className="pt-5 space-y-4">

          {/* Decision + score gauge */}
          <div className="flex items-center gap-4">
            <RScoreGauge score={result.risk_score} />
            <div className="flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className={style.color}>{style.icon}</span>
                <span className={`text-2xl font-bold ${style.color}`}>{result.decision}</span>
                <span className={cn("ml-auto font-mono font-bold text-lg px-2 py-0.5 rounded", R_COLOR[result.risk_level])}>
                  {result.risk_level} — {R_LABEL[result.risk_level]}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 text-xs text-zinc-400">
                <span>天候背景</span>
                <span className="font-mono font-bold text-zinc-200">{result.w_code} · W 分 {result.base_w}</span>
                <span>現況天氣</span>
                <span className="font-mono text-zinc-200">{result.weather_now.toFixed(1)} / 50</span>
                <span>Internal Grade</span>
                <span className={cn("font-bold", GRADE_COLOR[result.internal_grade])}>{result.internal_grade}</span>
              </div>
            </div>
          </div>

          {/* Score breakdown bars */}
          <div className="pt-1 border-t border-zinc-700/60 space-y-2">
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider">分數分解</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-xs text-zinc-400">
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>Base(W) · 天候背景</span>
                  <span className="font-mono text-zinc-300">{result.base_w} / 25</span>
                </div>
                <ScoreBar value={result.base_w} max={25} color="bg-sky-500" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>WeatherNow · 當日天氣</span>
                  <span className="font-mono text-zinc-300">{result.weather_now} / 50</span>
                </div>
                <ScoreBar value={result.weather_now} max={50} color="bg-yellow-500" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>B · 建物 / 場域</span>
                  <span className="font-mono text-zinc-300">{result.b_score} / 25</span>
                </div>
                <ScoreBar value={result.b_score} max={25} color="bg-orange-500" />
              </div>
              <div className="space-y-1">
                <div className="flex justify-between">
                  <span>O · 作業情境</span>
                  <span className="font-mono text-zinc-300">{result.o_score} / 15</span>
                </div>
                <ScoreBar value={result.o_score} max={15} color="bg-purple-500" />
              </div>
            </div>
          </div>

          {/* Buffer ratio */}
          <div className="flex items-center gap-3 pt-1 border-t border-zinc-700/60 text-xs">
            <span className="text-zinc-500">時間緩衝比例（buffer_ratio）</span>
            <span className="font-mono font-bold text-sky-400">{(result.buffer_ratio * 100).toFixed(1)}%</span>
            <span className="text-zinc-600 text-[10px]">= 0.05 + R_score/250 + W_volatility</span>
          </div>
        </CardContent>
      </Card>

      {/* ── Controls / approval ────────────────────────────────────────────── */}
      {result.controls.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">必要安全控制措施</p>
          <div className="space-y-1.5">
            {result.controls.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-zinc-800/50 rounded px-3 py-2">
                <CheckCircle2 className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                <span className="text-zinc-300">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {result.requires_approval && result.decision !== "NO_GO" && (
        <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>此任務條件需要主管審核（Conditional Go）。繼續後系統將標記為「待審核」狀態。</AlertDescription>
        </Alert>
      )}

      {result.decision === "NO_GO" && (
        <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
          <XCircle className="h-4 w-4" />
          <AlertDescription>NO-GO：此天候/場域條件不允許作業。請返回修改選擇日期或條件。</AlertDescription>
        </Alert>
      )}

      {/* ── Factor explanations (expandable) ──────────────────────────────── */}
      <div className="border border-zinc-700 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowExpl(e => !e)}
          className="w-full flex items-center justify-between px-4 py-2.5 bg-zinc-800/40 text-xs text-zinc-400 hover:bg-zinc-800/70 transition-colors"
        >
          <span className="font-semibold uppercase tracking-wider">逐因子分析明細（{result.explanations.length} 項）</span>
          {showExpl ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {showExpl && (
          <div className="divide-y divide-zinc-800/60">
            {result.explanations.map((e, i) => (
              <div key={i} className="grid grid-cols-[1fr_auto_2fr] gap-x-3 px-4 py-2 text-xs items-start">
                <span className="text-zinc-400 font-medium">{e.factor}</span>
                <span className={cn("font-mono font-bold text-right tabular-nums",
                  e.score > 0 ? "text-amber-400" : e.score < 0 ? "text-emerald-400" : "text-zinc-500"
                )}>
                  {e.score > 0 ? `+${e.score}` : e.score}
                </span>
                <span className="text-zinc-600">{e.note} <span className="text-zinc-500">· 值: {e.value}</span></span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Meta ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 pt-1 flex-wrap">
        <span className="font-mono">larm: <span className="text-emerald-400">{result.versions.larm_version}</span></span>
        <span className="font-mono">params: <span className="text-emerald-400">{result.versions.weather_regime_params_version}</span></span>
        <span>evaluated: {new Date(result.evaluated_at).toLocaleTimeString()}</span>
        <span className="flex items-center gap-1 text-emerald-400 ml-auto">
          <ShieldCheck className="h-3 w-3" /> Evidence Saved ✓
        </span>
      </div>
    </StepShell>
  )
}
