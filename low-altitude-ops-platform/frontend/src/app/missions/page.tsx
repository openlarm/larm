import Link from "next/link"
import { Plus, ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { VersionBar } from "@/components/layout/VersionBar"

const DEMO_MISSIONS = [
  { id: "M-20260220-001", status: "MISSION_READY", type: "Cleaning", building: "信義商業大樓", date: "2026-02-25", wx_r: "W1–R1", decision: "GO" },
  { id: "M-20260219-002", status: "PENDING_APPROVAL", type: "Inspection", building: "南港豪宅", date: "2026-02-28", wx_r: "W2–R2", decision: "CONDITIONAL" },
  { id: "M-20260218-003", status: "COMPLETED", type: "Coating", building: "林口工廠", date: "2026-02-15", wx_r: "W0–R0", decision: "GO" },
]

const STATUS_COLOR: Record<string, string> = {
  MISSION_READY: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  PENDING_APPROVAL: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  COMPLETED: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  BLOCKED: "bg-red-500/10 text-red-400 border-red-500/20",
}

const DECISION_COLOR: Record<string, string> = {
  GO: "text-emerald-400",
  CONDITIONAL: "text-amber-400",
  NO_GO: "text-red-400",
}

export default function MissionsPage() {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Missions</h1>
          <p className="text-sm text-zinc-400 mt-0.5">任務列表</p>
        </div>
        <div className="flex items-center gap-4">
          <VersionBar />
          <Link href="/missions/new">
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              New Mission
            </Button>
          </Link>
        </div>
      </div>

      {/* Table */}
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-zinc-400">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Mission ID</th>
              <th className="px-4 py-3 text-left font-medium">Type</th>
              <th className="px-4 py-3 text-left font-medium">Building</th>
              <th className="px-4 py-3 text-left font-medium">Date</th>
              <th className="px-4 py-3 text-left font-medium">W × R</th>
              <th className="px-4 py-3 text-left font-medium">Decision</th>
              <th className="px-4 py-3 text-left font-medium">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {DEMO_MISSIONS.map((m) => (
              <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-zinc-300">{m.id}</td>
                <td className="px-4 py-3 text-zinc-300">{m.type}</td>
                <td className="px-4 py-3 text-zinc-300">{m.building}</td>
                <td className="px-4 py-3 text-zinc-400">{m.date}</td>
                <td className="px-4 py-3 font-mono font-semibold text-zinc-200">{m.wx_r}</td>
                <td className={`px-4 py-3 font-semibold ${DECISION_COLOR[m.decision]}`}>{m.decision}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${STATUS_COLOR[m.status]}`}>
                    {m.status.replace("_", " ")}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <Link href={`/missions/${m.id}`} className="text-zinc-500 hover:text-zinc-200 transition-colors">
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* CTA */}
      <div className="mt-6 flex justify-center">
        <Link href="/missions/new">
          <Button variant="outline" className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
            <Plus className="h-4 w-4" />
            Start New Mission Wizard
          </Button>
        </Link>
      </div>
    </div>
  )
}
