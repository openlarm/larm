"use client"

import { useState, useEffect, useRef } from "react"
import type { Complexity, Supply } from "@/lib/types"
import type { QuoteFacadeInput, DirtType, PowerVoltage } from "./quote-defaults"
import { DIRT_TYPE_OPTIONS, COMPLEXITY_OPTIONS } from "./quote-defaults"

const BUILDING_LABELS = ["A", "B", "C", "D", "E", "F"]

interface Props {
  facades: QuoteFacadeInput[]
  facadeWidths_m?: number[]    // per-facade actual widths from MBR (per building)
  numBuildings?: number        // for tab-based grouping
  onChange: (facades: QuoteFacadeInput[]) => void
}

export function QuoteFacadeEditor({ facades, facadeWidths_m, numBuildings = 1, onChange }: Props) {
  const [activeTab, setActiveTab] = useState(0)

  // Reset tab if numBuildings shrinks below active tab
  useEffect(() => {
    if (activeTab >= numBuildings) setActiveTab(0)
  }, [numBuildings, activeTab])

  function update(index: number, patch: Partial<QuoteFacadeInput>) {
    onChange(facades.map((f, i) => i === index ? { ...f, ...patch } : f))
  }

  function toggleDirt(index: number, type: DirtType) {
    const current = facades[index].dirtTypes
    const next = current.includes(type) ? current.filter(d => d !== type) : [...current, type]
    if (next.length === 0) return
    update(index, { dirtTypes: next })
  }

  function handlePhotos(index: number, field: "photos" | "supplyPhotos", files: FileList | null) {
    if (!files) return
    const existing = facades[index][field]
    const added = Array.from(files).map(f => ({ name: f.name, url: URL.createObjectURL(f) }))
    update(index, { [field]: [...existing, ...added] })
  }

  function removePhoto(facadeIndex: number, field: "photos" | "supplyPhotos", photoIndex: number) {
    const photos = facades[facadeIndex][field].filter((_, i) => i !== photoIndex)
    update(facadeIndex, { [field]: photos })
  }

  function handlePowerChange(index: number, supply: Supply, voltages: PowerVoltage[]) {
    update(index, { powerSupply: supply, powerVoltage: voltages })
  }

  // Compute how many facades each building gets
  const numFacadesPerBuilding = numBuildings > 1
    ? Math.ceil(facades.length / numBuildings)
    : facades.length

  // Build building labels list (one per building)
  const buildingTabLabels: string[] = Array.from({ length: numBuildings }, (_, b) => {
    if (numBuildings === 1) return ""
    const startIdx = b * numFacadesPerBuilding
    const labelFromFacade = facades[startIdx]?.buildingLabel
    // Prefer facade's own buildingLabel if non-empty, else fall back to alphabet
    return (labelFromFacade && labelFromFacade.trim() !== "")
      ? labelFromFacade
      : (BUILDING_LABELS[b] ?? String(b + 1))
  })

  // Facades for the currently active building
  const activeBuildingStart = activeTab * numFacadesPerBuilding
  const activeBuildingFacades = facades.slice(
    activeBuildingStart,
    Math.min(activeBuildingStart + numFacadesPerBuilding, facades.length),
  )

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-zinc-800">各立面詳細資訊</h3>

      {/* Building tabs — only show when multiple buildings */}
      {numBuildings > 1 && (
        <div className="flex gap-1 border-b border-zinc-200">
          {buildingTabLabels.map((label, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => setActiveTab(idx)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
                activeTab === idx
                  ? "border-blue-600 text-blue-600 bg-blue-50"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 hover:bg-zinc-50"
              }`}
            >
              棟 {label}
            </button>
          ))}
        </div>
      )}

      {/* Facades for active building */}
      <div className="space-y-4">
        {activeBuildingFacades.map((facade, j) => {
          const globalIndex = activeBuildingStart + j
          return (
            <FacadeCard
              key={facade.id}
              facade={facade}
              width_m={facadeWidths_m?.[j]}
              onToggleDirt={(type) => toggleDirt(globalIndex, type)}
              onComplexity={(c) => update(globalIndex, { complexity: c })}
              onToggleRecesses={() => update(globalIndex, { hasRecesses: !facade.hasRecesses })}
              onToggleHighRisk={() => update(globalIndex, { isHighRisk: !facade.isHighRisk })}
              onWaterSupply={(v) => update(globalIndex, { waterSupply: v })}
              onPowerChange={(supply, voltages) => handlePowerChange(globalIndex, supply, voltages)}
              onPhotoUpload={(f) => handlePhotos(globalIndex, "photos", f)}
              onSupplyPhotoUpload={(f) => handlePhotos(globalIndex, "supplyPhotos", f)}
              onRemovePhoto={(pi) => removePhoto(globalIndex, "photos", pi)}
              onRemoveSupplyPhoto={(pi) => removePhoto(globalIndex, "supplyPhotos", pi)}
            />
          )
        })}
      </div>
    </div>
  )
}

// ─── Single facade card ───────────────────────────────────────────────────────

interface CardProps {
  facade: QuoteFacadeInput
  width_m?: number
  onToggleDirt: (type: DirtType) => void
  onComplexity: (c: Complexity) => void
  onToggleRecesses: () => void
  onToggleHighRisk: () => void
  onWaterSupply: (v: Supply) => void
  onPowerChange: (supply: Supply, voltages: PowerVoltage[]) => void
  onPhotoUpload: (files: FileList | null) => void
  onSupplyPhotoUpload: (files: FileList | null) => void
  onRemovePhoto: (index: number) => void
  onRemoveSupplyPhoto: (index: number) => void
}

function FacadeCard({
  facade, width_m,
  onToggleDirt, onComplexity, onToggleRecesses, onToggleHighRisk,
  onWaterSupply, onPowerChange,
  onPhotoUpload, onSupplyPhotoUpload,
  onRemovePhoto, onRemoveSupplyPhoto,
}: CardProps) {
  const photoRef = useRef<HTMLInputElement>(null)
  const supplyPhotoRef = useRef<HTMLInputElement>(null)

  return (
    <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
          {facade.label}
        </span>
        <span className="text-sm font-semibold text-zinc-700">立面 {facade.label}</span>
        {width_m != null && (
          <span className="ml-auto text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
            實測 {width_m} m
          </span>
        )}
      </div>

      {/* Dirt types */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">髒汙類型（可多選）</p>
        <div className="flex flex-wrap gap-2">
          {DIRT_TYPE_OPTIONS.map(opt => {
            const active = facade.dirtTypes.includes(opt.value)
            return (
              <button key={opt.value} type="button" onClick={() => onToggleDirt(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-zinc-600 border-zinc-300 hover:border-blue-400"
                }`}>
                <span>{opt.emoji}</span><span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Complexity */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">立面複雜程度</p>
        <div className="flex gap-2">
          {COMPLEXITY_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => onComplexity(opt.value)}
              title={opt.desc}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                facade.complexity === opt.value ? "bg-zinc-800 text-white border-zinc-800" : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-500"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          {COMPLEXITY_OPTIONS.find(o => o.value === facade.complexity)?.desc}
        </p>
      </div>

      {/* Special conditions */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">特殊狀況</p>
        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={facade.hasRecesses} onChange={onToggleRecesses}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm text-zinc-700">有內縮 / 露台 / 天井</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={facade.isHighRisk} onChange={onToggleHighRisk}
              className="w-4 h-4 accent-blue-600" />
            <span className="text-sm text-zinc-700">緊鄰特殊風險環境</span>
            <span className="text-xs text-zinc-400">（電線 / 交通要道）</span>
          </label>
        </div>
      </div>

      {/* Water / Power supply per facade */}
      <div className="grid grid-cols-2 gap-3">
        <SupplyField
          icon="💧"
          label="用水"
          value={facade.waterSupply}
          onChange={onWaterSupply}
        />
        <PowerVoltageField
          supply={facade.powerSupply}
          voltages={facade.powerVoltage ?? []}
          onChange={onPowerChange}
        />
      </div>

      {/* Supply access photos */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">水電接口現況照片（選填）</p>
        <PhotoStrip
          photos={facade.supplyPhotos}
          onAdd={() => supplyPhotoRef.current?.click()}
          onRemove={onRemoveSupplyPhoto}
        />
        <input ref={supplyPhotoRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => onSupplyPhotoUpload(e.target.files)} />
      </div>

      {/* General facade photos */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">立面照片（選填）</p>
        <PhotoStrip
          photos={facade.photos}
          onAdd={() => photoRef.current?.click()}
          onRemove={onRemovePhoto}
        />
        <input ref={photoRef} type="file" accept="image/*" multiple className="hidden"
          onChange={e => onPhotoUpload(e.target.files)} />
      </div>
    </div>
  )
}

// ─── Water supply field ───────────────────────────────────────────────────────

function SupplyField({
  icon, label, value, onChange,
}: {
  icon: string; label: string; value: Supply; onChange: (v: Supply) => void
}) {
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1.5">{icon} {label}</p>
      <div className="flex rounded-lg border border-zinc-300 overflow-hidden text-xs">
        {(["Provided", "SelfSupply"] as Supply[]).map(opt => (
          <button key={opt} type="button" onClick={() => onChange(opt)}
            className={`flex-1 py-2 text-center transition-colors ${
              value === opt ? "bg-blue-600 text-white" : "bg-white text-zinc-600 hover:bg-zinc-50"
            }`}>
            {opt === "Provided" ? "業主提供" : "自備"}
          </button>
        ))}
      </div>
    </div>
  )
}

// ─── Power voltage field (110V / 220V checkboxes) ────────────────────────────

function PowerVoltageField({
  supply, voltages, onChange,
}: {
  supply: Supply
  voltages: PowerVoltage[]
  onChange: (supply: Supply, voltages: PowerVoltage[]) => void
}) {
  function toggleVoltage(v: PowerVoltage) {
    if (supply === "SelfSupply") {
      onChange("Provided", [v])
      return
    }
    const next = voltages.includes(v) ? voltages.filter(x => x !== v) : [...voltages, v]
    onChange("Provided", next)
  }

  function toggleSelfSupply() {
    if (supply === "SelfSupply") {
      onChange("Provided", ["110V", "220V"])
    } else {
      onChange("SelfSupply", [])
    }
  }

  return (
    <div>
      <p className="text-xs text-zinc-500 mb-1.5">⚡ 用電</p>
      <div className="space-y-2">
        {/* Voltage checkboxes */}
        <div className="flex gap-2">
          {(["110V", "220V"] as PowerVoltage[]).map(v => {
            const checked = supply !== "SelfSupply" && voltages.includes(v)
            return (
              <button
                key={v}
                type="button"
                onClick={() => toggleVoltage(v)}
                className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
                  checked
                    ? "bg-blue-600 text-white border-blue-600"
                    : supply === "SelfSupply"
                    ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
                    : "bg-white text-zinc-600 border-zinc-300 hover:border-blue-400"
                }`}
              >
                {v}
              </button>
            )
          })}
        </div>
        {/* Self-supply toggle */}
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={supply === "SelfSupply"}
            onChange={toggleSelfSupply}
            className="w-3.5 h-3.5 accent-orange-500"
          />
          <span className="text-xs text-zinc-500">自備電源</span>
        </label>
      </div>
    </div>
  )
}

// ─── Photo strip ─────────────────────────────────────────────────────────────

function PhotoStrip({
  photos, onAdd, onRemove,
}: {
  photos: { name: string; url: string }[]
  onAdd: () => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {photos.map((photo, i) => (
        <div key={i} className="relative group w-16 h-16">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.url} alt={photo.name}
            className="w-full h-full object-cover rounded-lg border border-zinc-200" />
          <button type="button" onClick={() => onRemove(i)}
            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs hidden group-hover:flex items-center justify-center">
            ×
          </button>
        </div>
      ))}
      <button type="button" onClick={onAdd}
        className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-300 hover:border-blue-400 flex flex-col items-center justify-center text-zinc-400 hover:text-blue-500 transition-colors">
        <span className="text-xl leading-none">+</span>
        <span className="text-[10px] mt-0.5">上傳</span>
      </button>
    </div>
  )
}
