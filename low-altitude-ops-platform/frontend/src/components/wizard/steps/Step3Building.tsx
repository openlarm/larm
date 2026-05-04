"use client"
import { useState } from "react"
import dynamic from "next/dynamic"
import { StepShell } from "../StepShell"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Building2 } from "lucide-react"
import { MOCK_BUILDINGS } from "@/lib/mock-data"
import { cn } from "@/lib/utils"
import type { Mission, BuildingType, RooftopAccess, Supply, RegionExposure, CrowdDensity } from "@/lib/types"
import type { PersistedShape } from "@/app/(quote)/quote/components/QuoteMap"

const QuoteMap = dynamic(
  () => import("@/app/(quote)/quote/components/QuoteMap").then(m => m.QuoteMap),
  { ssr: false }
)

const BUILDING_ALPHA = "ABCDEFGH"

interface Props {
  mission: Partial<Mission>
  update: (p: Partial<Mission>) => void
  next: () => void
  back: () => void
  /** Per-building polygon vertices; sparse (null = not yet drawn) */
  buildingPolygons: ([number, number][] | null)[]
  /** idx = which building (0-based); called when user closes a polygon */
  onPolygonDraw: (idx: number, vertices: [number, number][], area_m2: number, perimeter_m: number) => void
}

export function Step3Building({ mission, update, next, back, buildingPolygons, onPolygonDraw }: Props) {
  const init = mission.building
  const [name, setName] = useState(init?.name ?? "")
  const [floors, setFloors] = useState(String(init?.height_floors ?? ""))
  const [buildingType, setBuildingType] = useState<BuildingType | "">(init?.building_type ?? "")
  const [numBuildings, setNumBuildings] = useState(String(init?.num_buildings ?? "1"))
  const [numFacades, setNumFacades] = useState(String(init?.num_facades ?? "4"))
  const [rooftop, setRooftop] = useState<RooftopAccess>(init?.rooftop_access ?? "Good")
  const [water, setWater] = useState<Supply>(init?.water_supply ?? "Provided")
  const [power, setPower] = useState<Supply>(init?.power_supply ?? "Provided")
  // LARM site inputs
  const [regionExposure, setRegionExposure] = useState<RegionExposure | "">(init?.region_exposure ?? "")
  const [crowdDensity, setCrowdDensity] = useState<CrowdDensity | "">(init?.crowd_density ?? "")
  const [nearBaseStation, setNearBaseStation] = useState<boolean>(init?.near_base_station === 1)
  const [windChannelEffect, setWindChannelEffect] = useState<boolean>(init?.wind_channel_effect === 1)
  const [clearanceM, setClearanceM] = useState(String(init?.clearance_m ?? ""))

  // ── Multi-building polygon drawing state ────────────────────────────────────
  /** Which building tab is currently active for drawing */
  const [activeDrawIdx, setActiveDrawIdx] = useState(0)
  /** Perimeter (m) for each drawn building polygon, keyed by building index */
  const [perimeterByBuilding, setPerimeterByBuilding] = useState<Record<number, number>>({})

  const numBuildingsNum = parseInt(numBuildings) || 1

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
      num_buildings: numBuildingsNum,
      num_facades: parseInt(numFacades) || 4,
      rooftop_access: rooftop,
      water_supply: water,
      power_supply: power,
      // LARM site inputs
      region_exposure:     regionExposure   ? (regionExposure as RegionExposure)   : undefined,
      crowd_density:       crowdDensity     ? (crowdDensity as CrowdDensity)       : undefined,
      near_base_station:   nearBaseStation  ? 1 : 0,
      wind_channel_effect: windChannelEffect ? 1 : 0,
      clearance_m:         clearanceM !== "" ? parseFloat(clearanceM) : undefined,
    }})
    next()
  }

  const lat = mission.address?.lat ?? 25.033
  const lng = mission.address?.lng ?? 121.565
  const floorsNum = parseInt(floors) || 10
  const numFacadesNum = parseInt(numFacades) || 4

  // Area estimate for the active building
  const activePerim = perimeterByBuilding[activeDrawIdx] ?? null
  const facadeEstimate = activePerim
    ? Math.round((activePerim / numFacadesNum) * floorsNum * 3.5)
    : null

  // All drawn polygons as persisted shapes (shown while drawing any building)
  const persistedShapes: PersistedShape[] = buildingPolygons
    .map((poly, i) =>
      poly ? {
        vertices: poly,
        label: numBuildingsNum > 1 ? `棟 ${BUILDING_ALPHA[i]}` : (name || "建物範圍"),
      } : null
    )
    .filter(Boolean) as PersistedShape[]

  const drawnCount = buildingPolygons.filter(Boolean).length

  return (
    <StepShell title="Step 3 — Building Basics" subtitle="建物基本資料與地圖範圍" onBack={back} onNext={handleNext} nextDisabled={!canNext} wide>

      {/* Quick templates */}
      <div className="flex gap-2 flex-wrap">
        <span className="text-xs text-zinc-500 self-center">快速載入：</span>
        {Object.keys(MOCK_BUILDINGS).map(k => (
          <button key={k} onClick={() => loadTemplate(k)}
            className="px-3 py-1 text-xs rounded border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors capitalize">{k}</button>
        ))}
      </div>

      {/* 2-column layout: form left, map right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ── Left: form fields ───────────────────────────────────────────── */}
        <div className="space-y-4">
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
              <Label>棟數</Label>
              <Select value={numBuildings} onValueChange={v => { setNumBuildings(v); setActiveDrawIdx(0) }}>
                <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-800 border-zinc-700">
                  {[1,2,3,4,5,6,7,8].map(n => (
                    <SelectItem key={n} value={String(n)} className="text-white">{n} 棟</SelectItem>
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
                  <SelectItem value="Good" className="text-white">良好（女兒牆佳）</SelectItem>
                  <SelectItem value="Limited" className="text-white">受限（女兒牆深/寬）</SelectItem>
                  <SelectItem value="NotAvailable" className="text-white">不可使用</SelectItem>
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

          {/* LARM Site Inputs */}
          <div>
            <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">LARM 場址輸入</p>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>建物迎風方位 <span className="text-zinc-500">(可選)</span></Label>
                <Select value={regionExposure} onValueChange={v => setRegionExposure(v as RegionExposure)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue placeholder="未知" /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="windward"     className="text-white">迎風面 (windward)</SelectItem>
                    <SelectItem value="leeward"      className="text-white">背風面 (leeward)</SelectItem>
                    <SelectItem value="coastal"      className="text-white">沿海 (coastal)</SelectItem>
                    <SelectItem value="rooftop_open" className="text-white">屋頂開闊 (rooftop_open)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>周圍人流密度 <span className="text-zinc-500">(可選)</span></Label>
                <Select value={crowdDensity} onValueChange={v => setCrowdDensity(v as CrowdDensity)}>
                  <SelectTrigger className="bg-zinc-800 border-zinc-700 text-white"><SelectValue placeholder="未知" /></SelectTrigger>
                  <SelectContent className="bg-zinc-800 border-zinc-700">
                    <SelectItem value="low"    className="text-white">低 (low)</SelectItem>
                    <SelectItem value="medium" className="text-white">中 (medium)</SelectItem>
                    <SelectItem value="high"   className="text-white">高 (high)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>工作間距 clearance_m <span className="text-zinc-500">(公尺，可選)</span></Label>
                <Input
                  type="number" min={0} step={0.5} value={clearanceM}
                  onChange={e => setClearanceM(e.target.value)}
                  placeholder="例如 5"
                  className="bg-zinc-800 border-zinc-700 text-white"
                />
              </div>

              <div className="flex flex-col gap-3 pt-1">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox" checked={nearBaseStation}
                    onChange={e => setNearBaseStation(e.target.checked)}
                    className="w-4 h-4 accent-sky-400"
                  />
                  <span className="text-sm text-zinc-300">附近有基地台 <span className="text-xs text-zinc-500">(near_base_station)</span></span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox" checked={windChannelEffect}
                    onChange={e => setWindChannelEffect(e.target.checked)}
                    className="w-4 h-4 accent-sky-400"
                  />
                  <span className="text-sm text-zinc-300">風道效應 <span className="text-xs text-zinc-500">(wind_channel_effect)</span></span>
                </label>
              </div>
            </div>
          </div>

          {/* Summary card */}
          {canNext && (
            <Card className="border-zinc-700 bg-zinc-800/40">
              <CardContent className="pt-4 flex items-start gap-3">
                <Building2 className="h-5 w-5 text-zinc-400 mt-0.5" />
                <div className="text-sm space-y-1">
                  <p className="font-medium text-white">{name || "—"}</p>
                  <p className="text-zinc-400">{floors}F · {buildingType} · {numBuildings} 棟 · 立面 {numFacades} 面 · 屋頂 {rooftop}</p>
                  <p className="text-zinc-400">水源 {water} · 電力 {power}</p>
                  {(regionExposure || crowdDensity || nearBaseStation || windChannelEffect || clearanceM) && (
                    <p className="text-zinc-500 text-xs">
                      LARM: {regionExposure || "—"} · 人流 {crowdDensity || "—"} · 基地台 {nearBaseStation ? "✓" : "—"} · 風道 {windChannelEffect ? "✓" : "—"}{clearanceM ? ` · 間距 ${clearanceM}m` : ""}
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right: map + area estimate ───────────────────────────────────── */}
        <div className="space-y-3">

          {/* Building tabs (shown when numBuildings > 1) */}
          {numBuildingsNum > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {Array.from({ length: numBuildingsNum }, (_, i) => {
                const label = BUILDING_ALPHA[i] ?? String(i + 1)
                const hasPoly = !!buildingPolygons[i]
                return (
                  <button
                    key={i}
                    onClick={() => setActiveDrawIdx(i)}
                    className={cn(
                      "px-3 py-1.5 text-xs rounded-md border transition-colors flex items-center gap-1.5",
                      i === activeDrawIdx
                        ? "bg-sky-600/20 border-sky-500/50 text-sky-300"
                        : "border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-300"
                    )}
                  >
                    棟 {label}
                    {hasPoly
                      ? <span className="text-emerald-400 text-[10px]">✓</span>
                      : <span className="text-zinc-600 text-[10px]">○</span>
                    }
                  </button>
                )
              })}
              <span className="text-[10px] text-zinc-600 ml-1">
                {drawnCount}/{numBuildingsNum} 棟已圈選
              </span>
            </div>
          )}

          {/* Map label */}
          <p className="text-sm font-medium text-zinc-300">
            {numBuildingsNum > 1
              ? `棟 ${BUILDING_ALPHA[activeDrawIdx] ?? activeDrawIdx + 1} 範圍圈選`
              : "地圖圈選範圍"
            }
          </p>
          {numBuildingsNum > 1 && (
            <p className="text-xs text-zinc-500 -mt-2">
              切換上方棟別按鈕可分別圈選各棟輪廓。
            </p>
          )}
          {numBuildingsNum === 1 && (
            <p className="text-xs text-zinc-500 -mt-2">在地圖上點擊各頂點圈選建物輪廓，閉合後自動計算周長與立面估算面積。</p>
          )}

          {/* Map — key forces remount when switching building tabs so draw state resets */}
          <div className="rounded-md overflow-hidden border border-zinc-700">
            <QuoteMap
              key={`building-${activeDrawIdx}`}
              lat={lat}
              lng={lng}
              airspace={mission.airspace ?? null}
              drawMode={true}
              drawLabel={numBuildingsNum > 1
                ? `棟 ${BUILDING_ALPHA[activeDrawIdx] ?? activeDrawIdx + 1}`
                : (name || "建物範圍")
              }
              persistedShapes={persistedShapes}
              onPolygonDraw={(verts, area, perim) => {
                setPerimeterByBuilding(prev => ({ ...prev, [activeDrawIdx]: perim }))
                onPolygonDraw(activeDrawIdx, verts, area, perim)
              }}
            />
          </div>

          {/* Area estimate for active building */}
          {activePerim ? (
            <div className="text-xs text-zinc-400 bg-zinc-800/60 rounded-lg p-3 space-y-1 border border-zinc-700">
              {numBuildingsNum > 1 && (
                <p className="text-[10px] text-zinc-500 font-medium mb-1.5">
                  棟 {BUILDING_ALPHA[activeDrawIdx] ?? activeDrawIdx + 1} 估算
                </p>
              )}
              <div className="flex justify-between">
                <span>周長</span>
                <span className="text-white font-mono">{activePerim.toFixed(0)} m</span>
              </div>
              {facadeEstimate && (
                <div className="flex justify-between">
                  <span>單立面估算面積（{floorsNum}F × {(activePerim / numFacadesNum).toFixed(0)}m）</span>
                  <span className="text-white font-mono">{facadeEstimate} m²</span>
                </div>
              )}
              {facadeEstimate && (
                <div className="flex justify-between border-t border-zinc-700 pt-1 mt-1">
                  <span>總立面估算（{numFacadesNum} 面）</span>
                  <span className="text-emerald-400 font-mono font-semibold">{(facadeEstimate * numFacadesNum).toLocaleString()} m²</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-zinc-600 italic">
              {numBuildingsNum > 1
                ? `尚未圈選棟 ${BUILDING_ALPHA[activeDrawIdx] ?? activeDrawIdx + 1}。圈選後自動計算立面面積估算。`
                : "尚未圈選範圍。圈選後可在下一步自動帶入立面面積估算。"
              }
            </p>
          )}
        </div>
      </div>
    </StepShell>
  )
}
