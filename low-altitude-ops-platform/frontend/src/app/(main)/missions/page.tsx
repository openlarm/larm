"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
import { Plus, ArrowRight, Inbox } from "lucide-react"
import { Button } from "@/components/ui/button"
import { VersionBar } from "@/components/layout/VersionBar"
import { getMissions, type SavedMission } from "@/lib/stores/mission-store"

const STATUS_COLOR: Record<string, string> = {
  MISSION_READY:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  PENDING_APPROVAL: "bg-amber-500/10  text-amber-400  border-amber-500/20",
  APPROVED:         "bg-sky-500/10    text-sky-400    border-sky-500/20",
  COMPLETED:        "bg-zinc-500/10   text-zinc-400   border-zinc-500/20",
  BLOCKED:          "bg-red-500/10    text-red-400    border-red-500/20",
  DRAFT:            "bg-zinc-700/50   text-zinc-400   border-zinc-600",
}

const DECISION_COLOR: Record<string, string> = {
  GO:          "text-emerald-400",
  CONDITIONAL: "text-amber-400",
  NO_GO:       "text-red-400",
}

function wxr(m: SavedMission) {
  const w = m.risk?.w_code ?? m.weather?.weather_type ?? "—"
  const r = m.risk?.risk_level ?? "—"
  return `${w}–${r}`
}

function buildingLabel(m: SavedMission) {
  return m.building?.name ?? (`${m.address?.city ?? ""}${m.address?.district ?? ""}` || "—")
}

function dateLabel(m: SavedMission) {
  return m.selected_dates?.[0] ?? m.selected_date ?? m.created_at?.slice(0, 10) ?? "—"
}

export default function MissionsPage() {
  const [missions, setMissions] = useState<SavedMission[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setMissions(getMissions())
    setLoaded(true)
  }, [])

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
      {loaded && missions.length > 0 ? (
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
              {missions.map(m => (
                <tr key={m.id} className="hover:bg-zinc-800/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-300">{m.id}</td>
                  <td className="px-4 py-3 text-zinc-300">{m.mission_type ?? "—"}</td>
                  <td className="px-4 py-3 text-zinc-300">{buildingLabel(m)}</td>
                  <td className="px-4 py-3 text-zinc-400">{dateLabel(m)}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-zinc-200">{wxr(m)}</td>
                  <td className={`px-4 py-3 font-semibold ${DECISION_COLOR[m.risk?.decision ?? ""] ?? "text-zinc-400"}`}>
                    {m.risk?.decision ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs border ${STATUS_COLOR[m.status] ?? STATUS_COLOR.DRAFT}`}>
                      {m.status.replace(/_/g, " ")}
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
      ) : loaded ? (
        <div className="border border-zinc-800 rounded-lg py-20 flex flex-col items-center gap-4 text-zinc-500">
          <Inbox className="h-10 w-10 text-zinc-700" />
          <p className="text-sm">尚無任務記錄</p>
          <p className="text-xs text-zinc-600">完成任務精靈後，任務將自動保存於此</p>
          <Link href="/missions/new">
            <Button variant="outline" size="sm" className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800 mt-2">
              <Plus className="h-4 w-4" />
              Start New Mission Wizard
            </Button>
          </Link>
        </div>
      ) : (
        <div className="border border-zinc-800 rounded-lg py-10 flex items-center justify-center">
          <div className="h-5 w-5 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
        </div>
      )}

      {loaded && missions.length > 0 && (
        <div className="mt-6 flex justify-center">
          <Link href="/missions/new">
            <Button variant="outline" className="gap-2 border-zinc-700 text-zinc-300 hover:bg-zinc-800">
              <Plus className="h-4 w-4" />
              Start New Mission Wizard
            </Button>
          </Link>
        </div>
      )}
    </div>
  )
}
