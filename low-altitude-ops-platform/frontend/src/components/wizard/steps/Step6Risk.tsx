"use client"
import { useEffect, useState } from "react"
import { StepShell } from "../StepShell"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck, AlertTriangle, XCircle, CheckCircle2 } from "lucide-react"
import { evaluateRisk } from "@/lib/engines/risk-engine"
import type { Mission, RiskResult } from "@/lib/types"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

const DECISION_STYLE = {
  GO:          { icon: <CheckCircle2 className="h-5 w-5" />, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/30" },
  CONDITIONAL: { icon: <AlertTriangle className="h-5 w-5" />, color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/30" },
  NO_GO:       { icon: <XCircle className="h-5 w-5" />,       color: "text-red-400",     bg: "bg-red-500/10 border-red-500/30" },
}

const GRADE_COLOR = { A: "text-emerald-400", B: "text-sky-400", C: "text-amber-400", D: "text-red-400" }

export function Step6Risk({ mission, update, next, back }: Props) {
  const [result, setResult] = useState<RiskResult | null>(mission.risk ?? null)
  const [loading, setLoading] = useState(!mission.risk)

  useEffect(() => {
    if (mission.risk) return
    const t = setTimeout(() => {
      const weather = mission.weather
      if (!weather) return
      const r = evaluateRisk(weather.weather_type, weather.risk_level)
      setResult(r)
      setLoading(false)
    }, 1200)
    return () => clearTimeout(t)
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
        <div className="h-48 bg-zinc-800 rounded animate-pulse" />
        <p className="text-xs text-zinc-500">規則引擎評估中… ruleset_v1.0</p>
      </div>
    )
  }

  if (!result) return null

  const style = DECISION_STYLE[result.decision]

  return (
    <StepShell
      title="Step 6 — Risk Evaluation"
      subtitle="風險評估結果"
      onBack={back}
      onNext={result.decision !== "NO_GO" ? handleNext : undefined}
      nextDisabled={result.decision === "NO_GO"}
    >
      {/* Main result card */}
      <Card className={`border ${style.bg}`}>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            <span className={style.color}>{style.icon}</span>
            <span className={`text-2xl font-bold ${style.color}`}>{result.decision}</span>
            <div className="ml-auto text-right">
              <div className="font-mono font-bold text-2xl text-zinc-100">
                {result.weather_type}–{result.risk_level}
              </div>
              <div className="text-xs text-zinc-500">W × R</div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">天候類型</div>
              <div className="font-mono font-bold text-xl text-zinc-100">{result.weather_type}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">風險等級</div>
              <div className="font-mono font-bold text-xl text-zinc-100">{result.risk_level}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-zinc-500 mb-1">Internal Grade</div>
              <div className={`font-bold text-xl ${GRADE_COLOR[result.internal_grade]}`}>{result.internal_grade}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Required controls */}
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

      {/* Approval banner */}
      {result.requires_approval && result.decision !== "NO_GO" && (
        <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>此任務條件需要主管審核（Conditional Go）。繼續後系統將標記為「待審核」狀態。</AlertDescription>
        </Alert>
      )}

      {/* Meta */}
      <div className="flex items-center gap-4 text-xs text-zinc-500 pt-1">
        <span className="font-mono">ruleset: <span className="text-emerald-400">{result.ruleset_version}</span></span>
        <span>evaluated: {new Date(result.evaluated_at).toLocaleTimeString()}</span>
        <span className="flex items-center gap-1 text-emerald-400 ml-auto">
          <ShieldCheck className="h-3 w-3" /> Evidence Saved ✓
        </span>
      </div>

      {result.decision === "NO_GO" && (
        <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
          <XCircle className="h-4 w-4" />
          <AlertDescription>NO-GO：此天候條件不允許作業。請返回修改日期或條件。</AlertDescription>
        </Alert>
      )}
    </StepShell>
  )
}
