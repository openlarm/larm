import { VersionBar } from "@/components/layout/VersionBar"
import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, ShieldCheck, AlertTriangle } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

const DEMO = {
  id: "M-20260220-001",
  status: "MISSION_READY",
  mission_type: "Cleaning",
  created_at: "2026-02-20T09:14:33Z",
  updated_at: "2026-02-20T11:02:17Z",
  address: { city: "台北市", district: "信義區", lat: 25.0336, lng: 121.5636 },
  building: { name: "信義商業大樓", height_floors: 25, height_m: 88 },
  wx_r: "W1–R1",
  decision: "GO",
  risk_controls: ["增加觀察手", "風速監控"],
  time: { total_minutes: 2640, suggested_days: 3 },
  pricing: { total: 123480, currency: "NTD", quote_code: "Q-20260220-042" },
  team: ["林志傑 (RPIC)", "陳雅萍 (Observer)", "黃建宏 (Safety)", "王美玲 (PM)"],
  audit: [
    { time: "09:14", event: "Mission Created", version: "ruleset_v1.0", actor: "林志傑" },
    { time: "09:15", event: "Address Parsed · 台北市信義區", version: "ruleset_v1.0", actor: "System" },
    { time: "09:15", event: "Airspace Check: OK", version: "ruleset_v1.0", actor: "System" },
    { time: "09:22", event: "Building Data Submitted · 25F Commercial", version: "ruleset_v1.0", actor: "林志傑" },
    { time: "09:24", event: "Facade Scope: 4 faces · 2,800㎡ total", version: "ruleset_v1.0", actor: "林志傑" },
    { time: "09:25", event: "Weather Window Selected · 2026-02-25 · W1", version: "ruleset_v1.0", actor: "林志傑" },
    { time: "09:25", event: "Risk Evaluated · W1–R1 · GO", version: "ruleset_v1.0", actor: "System" },
    { time: "09:26", event: "Time Estimated · 44h · 3 days", version: "time_v1.0", actor: "System" },
    { time: "09:27", event: "Quote Generated · Q-20260220-042 · 123,480 NTD", version: "pricing_v1.0", actor: "System" },
    { time: "11:01", event: "Team & Equipment Assigned", version: "ruleset_v1.0", actor: "王美玲" },
    { time: "11:02", event: "Mission Plan Generated", version: "ruleset_v1.0", actor: "王美玲" },
    { time: "11:02", event: "Status → MISSION_READY", version: "ruleset_v1.0", actor: "System" },
  ],
}

export default function MissionDetailPage() {
  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/missions" className="text-sm text-zinc-500 hover:text-zinc-300">← Missions</Link>
            <span className="text-zinc-600">/</span>
            <span className="font-mono text-sm text-zinc-400">{DEMO.id}</span>
          </div>
          <h1 className="text-xl font-semibold text-white mt-1">{DEMO.building.name}</h1>
          <div className="flex items-center gap-3 mt-1">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
              <CheckCircle2 className="h-3 w-3" /> {DEMO.status.replace("_", " ")}
            </span>
            <span className="text-xs text-zinc-500">Updated {DEMO.updated_at.slice(0, 16).replace("T", " ")}</span>
          </div>
        </div>
        <VersionBar />
      </div>

      {/* Overview */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: "Mission Type", value: DEMO.mission_type },
          { label: "W × R", value: DEMO.wx_r, mono: true },
          { label: "Decision", value: DEMO.decision, green: true },
          { label: "Quote Total", value: `${DEMO.pricing.total.toLocaleString()} NTD` },
        ].map(({ label, value, mono, green }) => (
          <Card key={label} className="border-zinc-700 bg-zinc-800/30">
            <CardContent className="pt-4">
              <p className="text-xs text-zinc-500 mb-1">{label}</p>
              <p className={`text-xl font-bold ${mono ? "font-mono text-zinc-100" : green ? "text-emerald-400" : "text-white"}`}>{value}</p>
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
              {DEMO.audit.map((event, i) => (
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
          {/* Risk & Compliance */}
          <Card className="border-zinc-700 bg-zinc-800/20">
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Risk & Compliance</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">天候 × 風險</span>
                  <span className="font-mono font-bold text-zinc-100">{DEMO.wx_r}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-400">決策</span>
                  <span className="font-semibold text-emerald-400">{DEMO.decision}</span>
                </div>
                {DEMO.risk_controls.map((c, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-zinc-400 bg-zinc-800/60 rounded px-2.5 py-1.5">
                    <CheckCircle2 className="h-3 w-3 text-zinc-600" /> {c}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Time */}
          <Card className="border-zinc-700 bg-zinc-800/20">
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Time Estimation</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-zinc-400">總工時</span><span className="text-zinc-200">{Math.floor(DEMO.time.total_minutes/60)}h {DEMO.time.total_minutes%60}m</span>
                <span className="text-zinc-400">建議天數</span><span className="text-zinc-200">{DEMO.time.suggested_days} 天</span>
              </div>
            </CardContent>
          </Card>

          {/* Assignments */}
          <Card className="border-zinc-700 bg-zinc-800/20">
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Assignments</p>
              <div className="flex flex-wrap gap-2">
                {DEMO.team.map(m => (
                  <span key={m} className="px-2 py-0.5 text-xs rounded bg-zinc-700 text-zinc-300">{m}</span>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Documents */}
          <Card className="border-zinc-700 bg-zinc-800/20">
            <CardContent className="pt-4">
              <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">Documents</p>
              <div className="space-y-2">
                {["Mission Plan (PDF)", "Permit Package (ZIP)", "W×R Risk Attachment"].map(d => (
                  <div key={d} className="flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 cursor-not-allowed">
                    <span>{d}</span>
                    <span className="text-emerald-400 text-[10px]">mock ✓</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
