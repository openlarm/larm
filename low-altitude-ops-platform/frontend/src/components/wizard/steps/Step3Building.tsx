"use client"
import { useState } from "react"
import { StepShell } from "../StepShell"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Building2 } from "lucide-react"
import { MOCK_BUILDINGS } from "@/lib/mock-data"
import type { Mission, BuildingType, RooftopAccess, Supply } from "@/lib/types"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

export function Step3Building({ mission, update, next, back }: Props) {
  const init = mission.building
  const [name, setName] = useState(init?.name ?? "")
  const [floors, setFloors] = useState(String(init?.height_floors ?? ""))
  const [buildingType, setBuildingType] = useState<BuildingType | "">(init?.building_type ?? "")
  const [numFacades, setNumFacades] = useState(String(init?.num_facades ?? "4"))
  const [rooftop, setRooftop] = useState<RooftopAccess>(init?.rooftop_access ?? "Good")
  const [water, setWater] = useState<Supply>(init?.water_supply ?? "Provided")
  const [power, setPower] = useState<Supply>(init?.power_supply ?? "Provided")

  const loadTemplate = (key: string) => {
    const t = MOCK_BUILDINGS[key]
    setName(t.name ?? "")
    setFloors(String(t.height_floors))
    setBuildingType(t.building_type)
    setNumFacades(String(t.num_facades))
    setRooftop(t.rooftop_access)
    setWater(t.water_supply)
    setPower(t.power_supply)
  }

  const canNext = floors && buildingType
  const handleNext = () => {
    const f = parseInt(floors)
    update({ building: {
      name: name || undefined,
      height_floors: f,
      height_m: f * 3.5,
      building_type: buildingType as BuildingType,
      num_facades: parseInt(numFacades) || 4,
      rooftop_access: rooftop,
      water_supply: water,
      power_supply: power,
    }})
    next()
  }

  return (
    <StepShell title="Step 3 — Building Basics" subtitle="建物基本資料" onBack={back} onNext={handleNext} nextDisabled={!canNext}>

      {/* Quick templates */}
      <div className="flex gap-2">
        <span className="text-xs text-zinc-500 self-center">快速載入：</span>
        {Object.keys(MOCK_BUILDINGS).map(k => (
          <button key={k} onClick={() => loadTemplate(k)}
            className="px-3 py-1 text-xs rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors capitalize">{k}</button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-2">
          <Label>Building name <span className="text-zinc-500">(可選)</span></Label>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="建物名稱" className="bg-zinc-800 border-zinc-700 text-white" />
        </div>

        <div className="space-y-2">
          <Label>樓層數 <span className="text-red-400">*</span></Label>
          <Input type="number" min={1} value={floors} onChange={e => setFloors(e.target.value)} placeholder="25" className="bg-zinc-800 border-zinc-700 text-white" />
        </div>

        <div className="space-y-2">
          <Label>建物類型 <span className="text-red-400">*</span></Label>
          <Select value={buildingType} onValueChange={v => setBuildingType(v as BuildingType)}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue placeholder="選擇…" /></SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              {(["commercial","luxury","house","factory","solar"] as BuildingType[]).map(t => (
                <SelectItem key={t} value={t} className="text-white capitalize">{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>立面數量</Label>
          <Input type="number" min={1} max={8} value={numFacades} onChange={e => setNumFacades(e.target.value)} className="bg-zinc-800 border-zinc-700 text-white" />
        </div>

        <div className="space-y-2">
          <Label>屋頂條件</Label>
          <Select value={rooftop} onValueChange={v => setRooftop(v as RooftopAccess)}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              {(["Good","Limited","NotAvailable"] as RooftopAccess[]).map(r => (
                <SelectItem key={r} value={r} className="text-white">{r}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>水源供應</Label>
          <Select value={water} onValueChange={v => setWater(v as Supply)}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="Provided" className="text-white">Provided（現場提供）</SelectItem>
              <SelectItem value="SelfSupply" className="text-white">SelfSupply（需自備）</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>電力供應</Label>
          <Select value={power} onValueChange={v => setPower(v as Supply)}>
            <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-800 border-zinc-700">
              <SelectItem value="Provided" className="text-white">Provided（現場提供）</SelectItem>
              <SelectItem value="SelfSupply" className="text-white">SelfSupply（需自備）</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {canNext && (
        <Card className="border-zinc-700 bg-zinc-800/40">
          <CardContent className="pt-4 flex items-start gap-3">
            <Building2 className="h-5 w-5 text-zinc-400 mt-0.5" />
            <div className="text-sm space-y-1">
              <p className="font-medium text-white">{name || "—"}</p>
              <p className="text-zinc-400">{floors}F · {buildingType} · 立面 {numFacades} 面 · 屋頂 {rooftop}</p>
              <p className="text-zinc-400">水源 {water} · 電力 {power}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </StepShell>
  )
}
