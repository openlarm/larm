import { VersionBar } from "@/components/layout/VersionBar"
import { MOCK_BUILDINGS } from "@/lib/mock-data"

export default function BuildingsPage() {
  return (
    <div className="p-4 sm:p-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div><h1 className="text-2xl font-semibold">Buildings</h1><p className="text-sm text-zinc-400 mt-0.5">建物庫</p></div>
        <VersionBar />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Object.entries(MOCK_BUILDINGS).map(([key, b]) => (
          <div key={key} className="border border-zinc-700 rounded-lg p-4 bg-zinc-800/30 space-y-2">
            <p className="font-medium text-white">{b.name}</p>
            <div className="text-xs text-zinc-400 space-y-1">
              <p>類型：{b.building_type} · {b.height_floors}F · {b.height_m}m</p>
              <p>立面：{b.num_facades} 面 · 屋頂：{b.rooftop_access}</p>
              <p>水源：{b.water_supply} · 電力：{b.power_supply}</p>
            </div>
            <div className="text-xs text-zinc-600 pt-1">歷史任務：1 筆（mock）</div>
          </div>
        ))}
      </div>
    </div>
  )
}
