import { VersionBar } from "@/components/layout/VersionBar"
import { CheckCircle2 } from "lucide-react"

const VERSIONS = [
  { id: "ruleset_v1.0", type: "Ruleset", status: "active", date: "2026-02-20", notes: "初版，涵蓋 W0–W5 / R0–R4 完整矩陣" },
  { id: "pricing_v1.0", type: "Pricing", status: "active", date: "2026-02-20", notes: "初版，涵蓋 A–D 計算區塊，6 種建築類型" },
  { id: "time_v1.0",    type: "Time Model", status: "active", date: "2026-02-20", notes: "初版，6 係數乘積模型" },
]

export default function RulesPage() {
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-semibold">Rules & Versions</h1><p className="text-sm text-zinc-400 mt-0.5">規則 / 參數版本管理</p></div>
        <VersionBar />
      </div>

      <div className="space-y-3">
        {VERSIONS.map(v => (
          <div key={v.id} className="border border-zinc-700 rounded-lg p-4 bg-zinc-800/20 flex items-center gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-sm font-semibold text-white">{v.id}</span>
                <span className={`px-1.5 py-0.5 text-[10px] rounded border ${v.status === "active" ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" : "bg-zinc-700 border-zinc-600 text-zinc-400"}`}>
                  {v.status}
                </span>
              </div>
              <p className="text-xs text-zinc-500">{v.type} · 生效日期：{v.date}</p>
              <p className="text-xs text-zinc-400 mt-0.5">{v.notes}</p>
            </div>
            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
          </div>
        ))}
      </div>

      <div className="mt-6 p-4 rounded-lg border border-zinc-700 bg-zinc-800/10 text-xs text-zinc-500">
        所有版本均為唯讀（append-only）。版本更新需建立新版本檔案，舊版本永久保留。
      </div>
    </div>
  )
}
