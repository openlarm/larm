"use client"

import { useRef } from "react"
import type { Complexity } from "@/lib/types"
import type { QuoteFacadeInput, DirtType } from "./quote-defaults"
import { DIRT_TYPE_OPTIONS, COMPLEXITY_OPTIONS } from "./quote-defaults"

interface Props {
  facades: QuoteFacadeInput[]
  onChange: (facades: QuoteFacadeInput[]) => void
}

export function QuoteFacadeEditor({ facades, onChange }: Props) {
  function update(index: number, patch: Partial<QuoteFacadeInput>) {
    const next = facades.map((f, i) => i === index ? { ...f, ...patch } : f)
    onChange(next)
  }

  function toggleDirt(index: number, type: DirtType) {
    const current = facades[index].dirtTypes
    const next = current.includes(type)
      ? current.filter(d => d !== type)
      : [...current, type]
    // Always keep at least one selected
    if (next.length === 0) return
    update(index, { dirtTypes: next })
  }

  function handlePhotoUpload(index: number, files: FileList | null) {
    if (!files) return
    const existing = facades[index].photos
    const newPhotos = Array.from(files).map(f => ({
      name: f.name,
      url: URL.createObjectURL(f),
    }))
    update(index, { photos: [...existing, ...newPhotos] })
  }

  function removePhoto(facadeIndex: number, photoIndex: number) {
    const photos = facades[facadeIndex].photos.filter((_, i) => i !== photoIndex)
    update(facadeIndex, { photos })
  }

  return (
    <div className="space-y-4">
      <h3 className="text-base font-semibold text-zinc-800">各立面詳細資訊</h3>

      {facades.map((facade, i) => (
        <FacadeCard
          key={facade.id}
          facade={facade}
          onToggleDirt={(type) => toggleDirt(i, type)}
          onComplexity={(c) => update(i, { complexity: c })}
          onToggleRecesses={() => update(i, { hasRecesses: !facade.hasRecesses })}
          onToggleHighRisk={() => update(i, { isHighRisk: !facade.isHighRisk })}
          onPhotoUpload={(files) => handlePhotoUpload(i, files)}
          onRemovePhoto={(pi) => removePhoto(i, pi)}
        />
      ))}
    </div>
  )
}

// ─── Single facade card ───────────────────────────────────────────────────────

interface CardProps {
  facade: QuoteFacadeInput
  onToggleDirt: (type: DirtType) => void
  onComplexity: (c: Complexity) => void
  onToggleRecesses: () => void
  onToggleHighRisk: () => void
  onPhotoUpload: (files: FileList | null) => void
  onRemovePhoto: (index: number) => void
}

function FacadeCard({
  facade, onToggleDirt, onComplexity,
  onToggleRecesses, onToggleHighRisk,
  onPhotoUpload, onRemovePhoto,
}: CardProps) {
  const fileRef = useRef<HTMLInputElement>(null)

  return (
    <div className="border border-zinc-200 rounded-xl p-4 bg-zinc-50 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="w-7 h-7 rounded-lg bg-blue-600 text-white text-sm font-bold flex items-center justify-center">
          {facade.label}
        </span>
        <span className="text-sm font-semibold text-zinc-700">立面 {facade.label}</span>
      </div>

      {/* Dirt types (multi-select chips) */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">髒汙類型（可多選）</p>
        <div className="flex flex-wrap gap-2">
          {DIRT_TYPE_OPTIONS.map(opt => {
            const active = facade.dirtTypes.includes(opt.value)
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => onToggleDirt(opt.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm border transition-colors ${
                  active
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-zinc-600 border-zinc-300 hover:border-blue-400"
                }`}
              >
                <span>{opt.emoji}</span>
                <span>{opt.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* Complexity (single select pills) */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">立面複雜程度</p>
        <div className="flex gap-2">
          {COMPLEXITY_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onComplexity(opt.value)}
              title={opt.desc}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                facade.complexity === opt.value
                  ? "bg-zinc-800 text-white border-zinc-800"
                  : "bg-white text-zinc-600 border-zinc-300 hover:border-zinc-500"
              }`}
            >
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
            <input
              type="checkbox"
              checked={facade.hasRecesses}
              onChange={onToggleRecesses}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-zinc-700">有內縮 / 露台 / 天井</span>
            <span className="text-xs text-zinc-400">（增加作業難度）</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={facade.isHighRisk}
              onChange={onToggleHighRisk}
              className="w-4 h-4 accent-blue-600"
            />
            <span className="text-sm text-zinc-700">緊鄰特殊風險環境</span>
            <span className="text-xs text-zinc-400">（電線 / 交通要道 / 人潮密集）</span>
          </label>
        </div>
      </div>

      {/* Photo upload */}
      <div>
        <p className="text-xs font-medium text-zinc-500 mb-2">補充照片（選填）</p>
        <div className="flex items-center gap-2 flex-wrap">
          {facade.photos.map((photo, pi) => (
            <div key={pi} className="relative group w-16 h-16">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.url}
                alt={photo.name}
                className="w-full h-full object-cover rounded-lg border border-zinc-200"
              />
              <button
                type="button"
                onClick={() => onRemovePhoto(pi)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs hidden group-hover:flex items-center justify-center"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-300 hover:border-blue-400 flex flex-col items-center justify-center text-zinc-400 hover:text-blue-500 transition-colors"
          >
            <span className="text-xl leading-none">+</span>
            <span className="text-[10px] mt-0.5">上傳</span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={e => onPhotoUpload(e.target.files)}
          />
        </div>
      </div>
    </div>
  )
}
