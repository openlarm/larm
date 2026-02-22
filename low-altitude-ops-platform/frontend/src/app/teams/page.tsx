import { VersionBar } from "@/components/layout/VersionBar"
import { MOCK_TEAMS } from "@/lib/mock-data"
import { CheckCircle2, XCircle } from "lucide-react"

export default function TeamsPage() {
  const all = [...MOCK_TEAMS.qualified, ...MOCK_TEAMS.unqualified]
  const today = new Date()
  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div><h1 className="text-2xl font-semibold">Teams</h1><p className="text-sm text-zinc-400 mt-0.5">人員 / 認證管理</p></div>
        <VersionBar />
      </div>
      <div className="border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-zinc-800/50 text-zinc-400">
            <tr>
              <th className="px-4 py-3 text-left font-medium">姓名</th>
              <th className="px-4 py-3 text-left font-medium">角色</th>
              <th className="px-4 py-3 text-left font-medium">證照號碼</th>
              <th className="px-4 py-3 text-left font-medium">到期日</th>
              <th className="px-4 py-3 text-center font-medium">夜間</th>
              <th className="px-4 py-3 text-center font-medium">高樓</th>
              <th className="px-4 py-3 text-left font-medium">狀態</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800">
            {all.map(m => {
              const expired = new Date(m.cert_expires) < today
              return (
                <tr key={m.id} className="hover:bg-zinc-800/20">
                  <td className="px-4 py-3 font-medium text-white">{m.name}</td>
                  <td className="px-4 py-3 text-zinc-400">{m.role}</td>
                  <td className="px-4 py-3 font-mono text-xs text-zinc-500">{m.cert_number}</td>
                  <td className={`px-4 py-3 font-mono text-xs ${expired ? "text-red-400" : "text-zinc-300"}`}>{m.cert_expires}</td>
                  <td className="px-4 py-3 text-center">{m.night_qualified ? <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" /> : <XCircle className="h-4 w-4 text-zinc-600 mx-auto" />}</td>
                  <td className="px-4 py-3 text-center">{m.highrise_qualified ? <CheckCircle2 className="h-4 w-4 text-emerald-400 mx-auto" /> : <XCircle className="h-4 w-4 text-zinc-600 mx-auto" />}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded text-xs border ${expired ? "bg-red-500/10 text-red-400 border-red-500/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>
                      {expired ? "證照過期" : "有效"}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
