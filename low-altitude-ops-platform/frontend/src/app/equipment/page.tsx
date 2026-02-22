import { VersionBar } from "@/components/layout/VersionBar"
import { MOCK_EQUIPMENT } from "@/lib/mock-data"
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react"

const HEALTH_ICON = {
  ok:    <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
  warn:  <AlertTriangle className="h-4 w-4 text-amber-400" />,
  block: <XCircle className="h-4 w-4 text-red-400" />,
}

export default function EquipmentPage() {
  const all = [...MOCK_EQUIPMENT.healthy, ...MOCK_EQUIPMENT.blocked]
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-semibold">Equipment</h1><p className="text-sm text-zinc-400 mt-0.5">設備履歷</p></div>
        <VersionBar />
      </div>
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-zinc-400">
            <tr>
              <th className="px-4 py-3 text-left font-medium">設備名稱</th>
              <th className="px-4 py-3 text-left font-medium">序號</th>
              <th className="px-4 py-3 text-left font-medium">最近校準</th>
              <th className="px-4 py-3 text-left font-medium">校準到期</th>
              <th className="px-4 py-3 text-left font-medium">最近保養</th>
              <th className="px-4 py-3 text-center font-medium">狀態</th>
              <th className="px-4 py-3 text-left font-medium">備注</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {all.map(eq => (
              <tr key={eq.id} className="hover:bg-zinc-800/20">
                <td className="px-4 py-3 font-medium text-white">{eq.name}</td>
                <td className="px-4 py-3 font-mono text-xs text-zinc-500">{eq.serial}</td>
                <td className="px-4 py-3 text-xs text-zinc-400">{eq.last_calibrated}</td>
                <td className={`px-4 py-3 text-xs font-mono ${new Date(eq.calibration_expires) < new Date() ? "text-red-400" : "text-zinc-300"}`}>{eq.calibration_expires}</td>
                <td className="px-4 py-3 text-xs text-zinc-400">{eq.last_maintenance}</td>
                <td className="px-4 py-3 text-center">{HEALTH_ICON[eq.health_status]}</td>
                <td className="px-4 py-3 text-xs text-zinc-500">{eq.notes ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
