"use client"

import { useRef } from "react"
import type { Complexity, Supply } from "@/lib/types"
import type { QuoteFacadeInput, DirtType } from "./quote-defaults"
import { DIRT_TYPE_OPTIONS, COMPLEXITY_OPTIONS } from "./quote-defaults"

interface Props {
  facades: QuoteFacadeInput[]
  facadeWidths_m?: number[]    // per-facade actual widths from MBR
  onChange: (facades: QuoteFacadeInput[]) => void
}

export function QuoteFacadeEditor({ facades, facadeWidths_m, onChange }: Props) {
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

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-zinc-800">各立面詳細資訊</h3>
      {facades.map((facade, i) => (
        <FacadeCard
          key={facade.id}
          facade={facade}
          width_m={facadeWidths_m?.[i]}
          onToggleDirt={(type) => toggleDirt(i, type)}
          onComplexity={(c) => update(i, { complexity: c })}
          onToggleRecesses={() => update(i, { hasRecesses: !facade.hasRecesses })}
          onToggleHighRisk={() => update(i, { isHighRisk: !facade.isHighRisk })}
          onWaterSupply={(v) => update(i, { waterSupply: v })}
          onPowerSupply={(v) => update(i, { powerSupply: v })}
          onPhotoUpload={(f) => handlePhotos(i, "photos", f)}
          onSupplyPhotoUpload={(f) => handlePhotos(i, "supplyPhotos", f)}
          onRemovePhoto={(pi) => removePhoto(i, "photos", pi)}
          onRemoveSupplyPhoto={(pi) => removePhoto(i, "supplyPhotos", pi)}
        />
      ))}
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
  onPowerSupply: (v: Supply) => void
  onPhotoUpload: (files: FileList | null) => void
  onSupplyPhotoUpload: (files: FileList | null) => void
  onRemovePhoto: (index: number) => void
  onRemoveSupplyPhoto: (index: number) => void
}

function FacadeCard({
  facade, width_m,
  onToggleDirt, onComplexity, onToggleRecesses, onToggleHighRisk,
  onWaterSupply, onPowerSupply,
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
        <SupplyField
          icon="⚡"
          label="用電"
          value={facade.powerSupply}
          onChange={onPowerSupply}
        />
      </div>

      {/* Supply access photos */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">
          水電接口現況照片（選填）
        </p>
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

// ─── Supply field ─────────────────────────────────────────────────────────────

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
