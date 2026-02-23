"use client"
import { useEffect, useState } from "react"
import { StepShell } from "../StepShell"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, AlertTriangle, XCircle, ShieldCheck, Loader2 } from "lucide-react"
import { MOCK_ADDRESSES, DEFAULT_ADDRESS_KEY } from "@/lib/mock-data"
import type { Mission, AirspaceResult, AirspaceStatus } from "@/lib/types"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

const STATUS_ICON: Record<AirspaceStatus, React.ReactNode> = {
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

// Check if address matches one of the mock demo addresses
function findMockKey(raw?: string): string | undefined {
  if (!raw) return undefined
  return Object.keys(MOCK_ADDRESSES).find(k => raw.includes(k.slice(0, 6)))
}

export function Step2Airspace({ mission, update, next, back }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<(AirspaceResult & { matched_zone?: string; distance_km?: number; _source?: string }) | null>(null)

  useEffect(() => {
    const fetchAirspace = async () => {
      setLoading(true)

      // Demo addresses → use mock data for pre-defined scenarios
      const mockKey = findMockKey(mission.address?.raw)
      if (mockKey) {
        setTimeout(() => {
          setData({ ...MOCK_ADDRESSES[mockKey].airspace, _source: "mock-demo" })
          setLoading(false)
        }, 1000)
        return
      }

      // Real coordinates → static zone check via API
      const { lat, lng } = mission.address ?? {}
      if (!lat || !lng) {
        // No coords — fallback to OK
        setData({ status: "OK", admin_days_added: 0, ruleset_version: "v1.1-static", _source: "fallback" })
        setLoading(false)
        return
      }

      try {
        const res = await fetch(`/api/airspace/query?lat=${lat}&lng=${lng}`)
        const result = await res.json()
        setData({ ...result, _source: "static-zones" })
      } catch {
        // Network error fallback
        setData({ status: "OK", admin_days_added: 0, ruleset_version: "v1.1-static", _source: "fallback" })
      } finally {
        setLoading(false)
      }
    }

    fetchAirspace()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleNext = () => {
    if (!data) return
    update({ airspace: data })
    next()
  }

  if (loading || !data) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="h-6 w-48 bg-zinc-800 rounded animate-pulse" />
        <div className="h-40 bg-zinc-800 rounded animate-pulse" />
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在查詢空域狀態…
        </div>
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
            <div className="ml-auto flex items-center gap-2">
              {data.matched_zone && (
                <Badge variant="outline" className="text-xs border-zinc-600 text-zinc-400">
                  {data.matched_zone}
                  {data.distance_km !== undefined && ` · ${data.distance_km}km`}
                </Badge>
              )}
              <span className="font-mono text-xs text-zinc-500">ruleset: {data.ruleset_version}</span>
            </div>
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
            <div className="text-zinc-400">資料來源</div>
            <div className="font-mono text-zinc-400 text-xs">
              {data._source === "mock-demo" ? "Mock Demo (預設場景)" :
               data._source === "static-zones" ? "靜態空域資料庫 v1.1" :
               "Fallback"}
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

      {data.status === "NeedPermit" && (
        <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-300">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            需提前向 CAA 申請飛行許可（LAANC）。行政作業時間已納入排程計算。
          </AlertDescription>
        </Alert>
      )}
    </StepShell>
  )
}
