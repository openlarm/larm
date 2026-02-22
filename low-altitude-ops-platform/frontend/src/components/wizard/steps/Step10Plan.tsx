"use client"
import { useState } from "react"
import { StepShell } from "../StepShell"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { FileText, Download, CheckCircle2, ShieldCheck } from "lucide-react"
import type { Mission } from "@/lib/types"
import { SYSTEM_VERSIONS } from "@/lib/mock-data"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void; onFinish: () => void }

function fmtMins(m: number) {
  const h = Math.floor(m / 60); const min = m % 60
  return `${h}h ${min}m`
}

export function Step10Plan({ mission, back, onFinish }: Props) {
  const [planGenerated, setPlanGenerated] = useState(false)
  const [permitGenerated, setPermitGenerated] = useState(false)

  const isReady = planGenerated
  const missionId = `M-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`

  return (
    <StepShell
      title="Step 10 — Mission Plan & Permit Package"
      subtitle="任務規劃書 + 申請包"
      onBack={back}
      onNext={isReady ? onFinish : undefined}
      nextLabel="完成 ✓"
      nextDisabled={!isReady}
    >
      {/* Status badge */}
      <div className="flex items-center gap-3">
        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium border ${
          isReady
            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
            : "bg-zinc-800 border-zinc-700 text-zinc-400"
        }`}>
          {isReady ? <CheckCircle2 className="h-4 w-4" /> : <div className="w-4 h-4 rounded-full border border-zinc-500" />}
          {isReady ? "Mission Ready" : "Pending Generation"}
        </span>
        <span className="font-mono text-xs text-zinc-500">{missionId}</span>
      </div>

      {/* Generate buttons */}
      <div className="flex gap-3">
        <Button
          variant="outline"
          onClick={() => { setTimeout(() => setPlanGenerated(true), 600) }}
          className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          disabled={planGenerated}
        >
          <FileText className="h-4 w-4" />
          {planGenerated ? "任務規劃書 ✓" : "Generate Mission Plan"}
        </Button>
        <Button
          variant="outline"
          onClick={() => { setTimeout(() => setPermitGenerated(true), 800) }}
          className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          disabled={!planGenerated || permitGenerated}
        >
          <Download className="h-4 w-4" />
          {permitGenerated ? "申請包 ✓" : "Generate Permit Package"}
        </Button>
      </div>

      {/* Mission Plan preview */}
      {planGenerated && (
        <Card className="border-zinc-600 bg-zinc-800/30">
          <CardContent className="pt-4 space-y-4 text-sm">
            <div className="flex items-center justify-between pb-2 border-b border-zinc-700">
              <span className="font-semibold text-white">任務規劃書</span>
              <div className="flex gap-1.5">
                {[["Ruleset", SYSTEM_VERSIONS.ruleset], ["Pricing", SYSTEM_VERSIONS.pricing], ["Time", SYSTEM_VERSIONS.time_model]].map(([k, v]) => (
                  <span key={k} className="px-1.5 py-0.5 text-[10px] font-mono rounded bg-zinc-700 text-emerald-400">{k}: {v}</span>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <div className="text-zinc-500">任務類型</div>
              <div className="text-zinc-200">{mission.mission_type}</div>

              <div className="text-zinc-500">作業地點</div>
              <div className="text-zinc-200">{mission.address?.city} {mission.address?.district}</div>

              <div className="text-zinc-500">建物</div>
              <div className="text-zinc-200">{mission.building?.name ?? "—"} · {mission.building?.height_floors}F</div>

              <div className="text-zinc-500">空域狀態</div>
              <div className={mission.airspace?.status === "OK" ? "text-emerald-400" : "text-amber-400"}>
                {mission.airspace?.status ?? "—"}
              </div>

              <div className="text-zinc-500">風險等級</div>
              <div className="font-mono font-bold text-zinc-100">
                {mission.weather?.weather_type}–{mission.risk?.risk_level}
              </div>

              <div className="text-zinc-500">作業決策</div>
              <div className={mission.risk?.decision === "GO" ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                {mission.risk?.decision}
              </div>

              <div className="text-zinc-500">作業時間</div>
              <div className="text-zinc-200">
                {mission.time_estimate ? fmtMins(mission.time_estimate.total_minutes) : "—"}
                {" · "}
                {mission.time_estimate?.suggested_days} 天
              </div>

              <div className="text-zinc-500">報價總額</div>
              <div className="text-zinc-200 font-semibold">
                {mission.pricing?.total.toLocaleString()} {mission.pricing?.currency}
              </div>
            </div>

            {/* Controls */}
            {mission.risk?.controls && mission.risk.controls.length > 0 && (
              <div className="pt-2 border-t border-zinc-700">
                <p className="text-xs text-zinc-500 mb-2">安全控制措施</p>
                {mission.risk.controls.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-zinc-400 mb-1">
                    <CheckCircle2 className="h-3 w-3 text-zinc-500" /> {c}
                  </div>
                ))}
              </div>
            )}

            {/* Team */}
            <div className="pt-2 border-t border-zinc-700">
              <p className="text-xs text-zinc-500 mb-2">人員配置</p>
              <div className="flex flex-wrap gap-2">
                {mission.assignment?.team.map(m => (
                  <span key={m.id} className="px-2 py-0.5 text-xs rounded bg-zinc-700 text-zinc-300">{m.name} ({m.role})</span>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1.5 text-xs text-emerald-400 pt-1">
              <ShieldCheck className="h-3.5 w-3.5" />
              Evidence Saved ✓ · Snapshot ID: EVD-{Date.now().toString(36).toUpperCase()}
            </div>
          </CardContent>
        </Card>
      )}

      {permitGenerated && (
        <Card className="border-zinc-600 bg-zinc-800/30">
          <CardContent className="pt-4 text-sm space-y-2">
            <p className="font-medium text-white mb-2">申請包已產出</p>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
              <span className="text-zinc-500">作業範圍</span>
              <span className="text-zinc-300">{mission.facades?.reduce((s, f) => s + f.area_m2, 0).toLocaleString()} ㎡</span>
              <span className="text-zinc-500">最大高度</span>
              <span className="text-zinc-300">{mission.building?.height_m} m AGL</span>
              <span className="text-zinc-500">責任人</span>
              <span className="text-zinc-300">{mission.assignment?.team.find(m => m.role === "RPIC")?.name ?? "—"}</span>
              <span className="text-zinc-500">格式</span>
              <span className="text-zinc-300">PDF + JSON (mock)</span>
            </div>
          </CardContent>
        </Card>
      )}
    </StepShell>
  )
}
