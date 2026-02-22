"use client"
import { useEffect, useState } from "react"
import { StepShell } from "../StepShell"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck } from "lucide-react"
import { MOCK_ADDRESSES, DEFAULT_ADDRESS_KEY } from "@/lib/mock-data"
import type { Mission, AirspaceStatus } from "@/lib/types"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

const STATUS_ICON = {
  OK:         <CheckCircle2 className="h-5 w-5 text-emerald-400" />,
  NeedPermit: <AlertTriangle className="h-5 w-5 text-amber-400" />,
  NoFly:      <XCircle className="h-5 w-5 text-red-400" />,
}

const STATUS_LABEL: Record<AirspaceStatus, string> = {
  OK:         "✅ 可作業",
  NeedPermit: "⚠ 需申請",
  NoFly:      "❌ 禁飛",
}

const STATUS_COLOR: Record<AirspaceStatus, string> = {
  OK:         "border-emerald-500/30 bg-emerald-500/5",
  NeedPermit: "border-amber-500/30 bg-amber-500/5",
  NoFly:      "border-red-500/30 bg-red-500/5",
}

export function Step2Airspace({ mission, update, next, back }: Props) {
  const [loading, setLoading] = useState(true)
  const key = Object.keys(MOCK_ADDRESSES).find(k =>
    mission.address?.raw?.includes(k.slice(0, 6))
  ) ?? DEFAULT_ADDRESS_KEY
  const data = MOCK_ADDRESSES[key].airspace

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 1000)
    return () => clearTimeout(t)
  }, [])

  const handleNext = () => {
    update({ airspace: data })
    next()
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-6 w-48 bg-zinc-800 rounded animate-pulse" />
        <div className="h-40 bg-zinc-800 rounded animate-pulse" />
      </div>
    )
  }

  return (
    <StepShell
      title="Step 2 — Airspace Check"
      subtitle="空域可行性確認"
      onBack={back}
      onNext={data.status === "NoFly" ? undefined : handleNext}
      nextDisabled={data.status === "NoFly"}
    >
      <Card className={`border ${STATUS_COLOR[data.status]}`}>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3">
            {STATUS_ICON[data.status]}
            <span className="text-lg font-semibold">{STATUS_LABEL[data.status]}</span>
            <span className="ml-auto font-mono text-xs text-zinc-500">ruleset: {data.ruleset_version}</span>
          </div>

          {data.reason && (
            <p className="text-sm text-zinc-300 bg-zinc-800/50 rounded p-3">{data.reason}</p>
          )}

          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <div className="text-zinc-400">空域狀態</div>
            <div className="font-medium">{STATUS_LABEL[data.status]}</div>
            <div className="text-zinc-400">影響行政天數</div>
            <div className="text-zinc-200">
              {data.admin_days_added > 0 ? `+${data.admin_days_added} 天` : "無影響"}
            </div>
            <div className="text-zinc-400">規則版本</div>
            <div className="font-mono text-emerald-400">{data.ruleset_version}</div>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-zinc-500 pt-1">
            <ShieldCheck className="h-3 w-3 text-emerald-400" />
            <span className="text-emerald-400">Evidence Saved ✓</span>
            <span className="ml-2">Snapshot ID: EVD-{Date.now().toString(36).toUpperCase()}</span>
          </div>
        </CardContent>
      </Card>

      {data.status === "NoFly" && (
        <Alert className="border-red-500/30 bg-red-500/5 text-red-300">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            此地址位於禁飛區，任務無法生成。
            <button className="ml-2 underline opacity-50 cursor-not-allowed text-xs">建立例外申請（不可用）</button>
          </AlertDescription>
        </Alert>
      )}
    </StepShell>
  )
}
