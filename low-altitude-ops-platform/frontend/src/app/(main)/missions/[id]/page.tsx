"use client"
import { useEffect, useState } from "react"
import { useParams } from "next/navigation"
import { VersionBar } from "@/components/layout/VersionBar"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, ShieldCheck, AlertTriangle, XCircle } from "lucide-react"
import Link from "next/link"
import { getMission, type SavedMission } from "@/lib/stores/mission-store"

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, string> = {
  MISSION_READY:    "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
  PENDING_APPROVAL: "bg-amber-500/10  border-amber-500/20  text-amber-300",
  APPROVED:         "bg-sky-500/10    border-sky-500/20    text-sky-300",
  COMPLETED:        "bg-zinc-700/50   border-zinc-600      text-zinc-300",
  BLOCKED:          "bg-red-500/10    border-red-500/20    text-red-300",
  DRAFT:            "bg-zinc-700/30   border-zinc-700      text-zinc-400",
}

const DECISION_STYLE: Record<string, { color: string; icon: React.ReactNode }> = {
  GO:          { color: "text-emerald-400", icon: <CheckCircle2 className="h-4 w-4" /> },
  CONDITIONAL: { color: "text-amber-400",   icon: <AlertTriangle className="h-4 w-4" /> },
  NO_GO:       { color: "text-red-400",     icon: <XCircle className="h-4 w-4" /> },
}

function fmtTime(mins: number) {
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MissionDetailPage() {
  const params = useParams()
  const id = typeof params.id === "string" ? params.id : Array.isArray(params.id) ? params.id[0] : ""
  const [mission, setMission] = useState<SavedMission | null>(null)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    const m = getMission(id)
    if (m) setMission(m)
    else setNotFound(true)
  }, [id])

  if (notFound) {
    return (
      <div className="p-8 flex flex-col items-center gap-4 text-zinc-500 pt-20">
        <XCircle className="h-10 w-10 text-zinc-600" />
        <p>Mission <span className="font-mono text-zinc-400">{id}</span> not found.</p>
        <Link href="/missions" className="text-sm text-zinc-400 hover:text-zinc-200">← Back to Missions</Link>
      </div>
    )
  }

  if (!mission) {
    return (
      <div className="p-8 flex items-center justify-center pt-20">
        <div className="h-6 w-6 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
      </div>
    )
  }

  const decision = mission.risk?.decision
  const decisionStyle = decision ? DECISION_STYLE[decision] : null

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/missions" className="text-sm text-zinc-500 hover:text-zinc-300">← Missions</Link>
            <span className="text-zinc-600">/</span>
            <span className="font-mono text-sm text-zinc-400">{mission.id}</span>
          </div>
          <h1 className="text-xl font-semibold text-white mt-1">
            {mission.building?.name ?? (`${mission.address?.city ?? ""}${mission.address?.district ?? ""}` || "Mission Detail")}
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[mission.status] ?? STATUS_STYLE.DRAFT}`}>
              <CheckCircle2 className="h-3 w-3" />
              {mission.status.replace(/_/g, " ")}
            </span>
            <span className="text-xs text-zinc-500">
              Created {mission.created_at?.slice(0, 16).replace("T", " ")}
            </span>
          </div>
        </div>
        <VersionBar />
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Mission Type",  value: mission.mission_type ?? "—" },
          { label: "W × R",        value: `${mission.risk?.w_code ?? mission.weather?.weather_type ?? "—"}–${mission.risk?.risk_level ?? "—"}`, mono: true },
          { label: "Decision",     value: decision ?? "—", color: decisionStyle?.color },
          { label: "Quote Total",  value: mission.pricing ? `${mission.pricing.total.toLocaleString()} NTD` : "—" },
        ].map(({ label, value, mono, color }) => (
          <Card key={label} className="border-zinc-700 bg-zinc-800/30">
            <CardContent className="pt-4">
              <p className="text-xs text-zinc-500 mb-1">{label}</p>
              <p className={`text-xl font-bold ${mono ? "font-mono text-zinc-100" : color ?? "text-white"}`}>{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Audit Timeline */}
        <Card className="border-zinc-700 bg-zinc-800/20">
          <CardContent className="pt-4">
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">Timeline / Audit</p>
            <div className="space-y-3">
              {mission.audit.map((event, i) => (
                <div key={i} className="flex gap-3 text-sm">
                  <span className="font-mono text-xs text-zinc-600 w-10 shrink-0 pt-0.5">{event.time}</span>
                  <div className="flex-1">
                    <p className="text-zinc-300 leading-snug">{event.event}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] font-mono text-emerald-400">{event.version}</span>
                      <span className="text-[10px] text-zinc-600">·</span>
                      <span className="text-[10px] text-zinc-500">{event.actor}</span>
                    </div>
                  </div>
                  <ShieldCheck className="h-3 w-3 text-emerald-500/50 shrink-0 mt-1" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-4">
          {/* LARM Risk breakdown */}
          <Card className="border-zinc-700 bg-zinc-800/20">
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Risk & Compliance</p>
              {mission.risk ? (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">R_score</span>
                    <span className="font-mono font-bold text-zinc-100">{mission.risk.risk_score} / 100</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">W code · Base(W)</span>
                    <span className="font-mono text-zinc-200">{mission.risk.w_code} · {mission.risk.base_w}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Weather Now</span>
                    <span className="font-mono text-zinc-200">{mission.risk.weather_now.toFixed(1)} / 50</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Building (B)</span>
                    <span className="font-mono text-zinc-200">{mission.risk.b_score} / 25</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Operational (O)</span>
                    <span className="font-mono text-zinc-200">{mission.risk.o_score} / 15</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-zinc-400">Buffer Ratio</span>
                    <span className="font-mono text-sky-400">{(mission.risk.buffer_ratio * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex justify-between text-sm pt-1 border-t border-zinc-700">
                    <span className="text-zinc-400">決策</span>
                    <span className={`font-semibold flex items-center gap-1 ${decisionStyle?.color ?? "text-zinc-300"}`}>
                      {decisionStyle?.icon}
                      {mission.risk.decision}
                    </span>
                  </div>
                  {mission.risk.controls.length > 0 && (
                    <div className="pt-2 space-y-1">
                      {mission.risk.controls.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-800/60 rounded px-2.5 py-1.5">
                          <CheckCircle2 className="h-3 w-3 text-zinc-600" /> {c}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-zinc-600">未完成 Risk 評估</p>
              )}
            </CardContent>
          </Card>

          {/* Time Estimation */}
          {mission.time_estimate && (
            <Card className="border-zinc-700 bg-zinc-800/20">
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Time Estimation</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-zinc-400">總工時</span>
                  <span className="text-zinc-200">{fmtTime(mission.time_estimate.total_minutes)}</span>
                  <span className="text-zinc-400">建議天數</span>
                  <span className="text-zinc-200">{mission.time_estimate.suggested_days} 天</span>
                  <span className="text-zinc-400">中斷緩衝</span>
                  <span className="font-mono text-zinc-200">{(mission.time_estimate.disruption_buffer_ratio * 100).toFixed(0)}%</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Assignments */}
          {mission.assignment && (
            <Card className="border-zinc-700 bg-zinc-800/20">
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Assignments</p>
                <div className="flex flex-wrap gap-2 mb-3">
                  {mission.assignment.team.map(m => (
                    <span key={m.id} className="px-2 py-0.5 text-xs rounded bg-zinc-700 text-zinc-300">
                      {m.name} ({m.role})
                    </span>
                  ))}
                </div>
                {mission.assignment.equipment.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {mission.assignment.equipment.map(e => (
                      <span key={e.id} className="px-2 py-0.5 text-xs rounded bg-zinc-800 border border-zinc-700 text-zinc-400">
                        {e.name}
                      </span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Pricing */}
          {mission.pricing && (
            <Card className="border-zinc-700 bg-zinc-800/20">
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Pricing</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <span className="text-zinc-400">報價編號</span>
                  <span className="font-mono text-xs text-zinc-300">{mission.pricing.quote_code}</span>
                  <span className="text-zinc-400">報價總額</span>
                  <span className="font-semibold text-white">{mission.pricing.total.toLocaleString()} NTD</span>
                  <span className="text-zinc-400">有效至</span>
                  <span className="text-zinc-400 text-xs">{mission.pricing.valid_until}</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* LARM versions */}
          {mission.risk?.versions && (
            <Card className="border-zinc-700 bg-zinc-800/20">
              <CardContent className="pt-4">
                <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">System Versions</p>
                <div className="space-y-1 text-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">LARM</span>
                    <span className="text-emerald-400">{mission.risk.versions.larm_version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Weather Params</span>
                    <span className="text-emerald-400">{mission.risk.versions.weather_regime_params_version}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">Thresholds</span>
                    <span className="text-emerald-400">{mission.risk.versions.thresholds_version}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
