"use client"

import { useEffect, useState, useCallback } from "react"
import type { QuoteFormData, AreaEstimate } from "./quote-defaults"
import {
  BUILDING_TYPE_OPTIONS, DIRT_OPTIONS, TIME_SLOT_OPTIONS,
  estimateFromPerimeter, estimateFromDefaults, estimateFromRect,
} from "./quote-defaults"
import { QuoteMap } from "./QuoteMap"

interface Props {
  formData: Partial<QuoteFormData>
  updateForm: (patch: Partial<QuoteFormData>) => void
  buildingPerimeter: number | null
  buildingPolygon: { lat: number; lon: number }[] | null
  areaEstimate: AreaEstimate | null
  setAreaEstimate: (a: AreaEstimate) => void
  onNext: () => void
  onBack: () => void
}

const SOURCE_LABELS: Record<string, string> = {
  overpass: "地圖自動偵測",
  "manual-draw": "手動框選",
  default: "智慧預設值",
}

export function QuoteStep2({
  formData, updateForm, buildingPerimeter, buildingPolygon,
  areaEstimate, setAreaEstimate, onNext, onBack,
}: Props) {
  const floors = formData.floors ?? 10
  const numFacades = formData.numFacades ?? 4
  const buildingType = formData.buildingType ?? "commercial"
  const [overrideWidth, setOverrideWidth] = useState<string>("")

  // Recalculate area when inputs change
  useEffect(() => {
    if (overrideWidth && Number(overrideWidth) > 0) {
      // Manual override: treat as if all facades have this width
      const w = Number(overrideWidth)
      const fakePerimeter = w * numFacades
      setAreaEstimate(estimateFromPerimeter(fakePerimeter, floors, numFacades, "manual-draw"))
    } else if (buildingPerimeter && buildingPerimeter > 0) {
      setAreaEstimate(estimateFromPerimeter(buildingPerimeter, floors, numFacades, "overpass"))
    } else {
      setAreaEstimate(estimateFromDefaults(buildingType, floors, numFacades))
    }
  }, [floors, numFacades, buildingType, buildingPerimeter, overrideWidth, setAreaEstimate])

  // Handle rectangle draw from map
  const handleRectDraw = useCallback((width_m: number, depth_m: number) => {
    const est = estimateFromRect(width_m, depth_m, floors, numFacades)
    setAreaEstimate(est)
    setOverrideWidth("")
  }, [floors, numFacades, setAreaEstimate])

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-zinc-900">Step 2 — 建物概況</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left column: form fields */}
        <div className="space-y-4">
          {/* Building type */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">建物類型</label>
            <select
              value={buildingType}
              onChange={e => updateForm({ buildingType: e.target.value as QuoteFormData["buildingType"] })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {BUILDING_TYPE_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Floors */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">樓層數</label>
            <input
              type="number"
              value={floors}
              onChange={e => updateForm({ floors: Math.max(1, parseInt(e.target.value) || 1) })}
              min={1}
              max={100}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Number of facades */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">施作面數</label>
            <select
              value={numFacades}
              onChange={e => updateForm({ numFacades: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {[1, 2, 3, 4].map(n => (
                <option key={n} value={n}>{n} 面</option>
              ))}
            </select>
          </div>

          {/* Dirt level */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">髒汙程度</label>
            <select
              value={formData.dirtLevel ?? "light"}
              onChange={e => updateForm({ dirtLevel: e.target.value as QuoteFormData["dirtLevel"] })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {DIRT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}（{o.desc}）</option>
              ))}
            </select>
          </div>

          {/* Time slot */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">施工時段</label>
            <select
              value={formData.timeSlot ?? "day"}
              onChange={e => updateForm({ timeSlot: e.target.value as QuoteFormData["timeSlot"] })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {TIME_SLOT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Right column: area estimation + map */}
        <div className="space-y-4">
          {/* Map with draw support */}
          {formData.lat && formData.lng && (
            <QuoteMap
              lat={formData.lat}
              lng={formData.lng}
              airspace={null}
              polygon={buildingPolygon}
              onRectDraw={handleRectDraw}
            />
          )}

          {/* Area estimation card */}
          {areaEstimate && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-lg">📐</span>
                <span className="font-medium text-blue-900">面積估算</span>
                <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                  {SOURCE_LABELS[areaEstimate.source]}
                </span>
              </div>

              <div className="space-y-1 text-sm text-blue-800">
                {areaEstimate.source === "overpass" && (
                  <p>偵測到建物輪廓，周長 ≈ {areaEstimate.perimeter_m}m</p>
                )}
                <p>每面均寬 ≈ {areaEstimate.facade_width_m}m</p>
                <p>建物高度 = {floors}F × 3.5m = {areaEstimate.building_height_m}m</p>
                <p>每面面積 ≈ {areaEstimate.facade_area_m2.toLocaleString()} ㎡</p>
                <p className="font-semibold text-base pt-1">
                  施作總面積 ≈ {areaEstimate.total_area_m2.toLocaleString()} ㎡
                </p>
              </div>
            </div>
          )}

          {/* Manual override */}
          <div>
            <label className="block text-sm text-zinc-500 mb-1">
              手動調整每面寬度（可選）
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={overrideWidth}
                onChange={e => setOverrideWidth(e.target.value)}
                placeholder={areaEstimate ? String(areaEstimate.facade_width_m) : ""}
                min={1}
                className="w-32 px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <span className="text-sm text-zinc-500">公尺</span>
              {overrideWidth && (
                <button
                  onClick={() => setOverrideWidth("")}
                  className="text-xs text-blue-600 hover:underline"
                >
                  恢復自動估算
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-6 py-2.5 border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          上一步
        </button>
        <button
          onClick={onNext}
          disabled={!areaEstimate}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 transition-colors font-medium"
        >
          產生報價
        </button>
      </div>
    </div>
  )
}
