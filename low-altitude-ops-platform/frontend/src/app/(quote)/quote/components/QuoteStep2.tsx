"use client"

import { useEffect, useState, useCallback } from "react"
import type { QuoteFormData, AreaEstimate, QuoteFacadeInput, BuildingDimensions } from "./quote-defaults"
import {
  BUILDING_TYPE_OPTIONS, TIME_SLOT_OPTIONS,
  estimateFromPerimeter, estimateFromDefaults, estimateFromRect, estimateFromDimensions,
  buildDefaultFacadeInputs,
} from "./quote-defaults"
import { QuoteMap } from "./QuoteMap"
import { QuoteFacadeEditor } from "./QuoteFacadeEditor"

interface Props {
  formData: Partial<QuoteFormData>
  updateForm: (patch: Partial<QuoteFormData>) => void
  buildingPerimeter: number | null
  buildingPolygon: { lat: number; lon: number }[] | null
  buildingDimensions: BuildingDimensions | null
  areaEstimate: AreaEstimate | null
  setAreaEstimate: (a: AreaEstimate) => void
  onNext: () => void
  onBack: () => void
}

const SOURCE_LABELS: Record<string, string> = {
  overpass: "地圖自動偵測（MBR）",
  "manual-draw": "手動框選",
  default: "智慧預設值",
}

// Facade label map for display chips
const FACE_DISPLAY = ["正面", "左側", "右側", "背面"]

export function QuoteStep2({
  formData, updateForm, buildingPerimeter, buildingPolygon,
  buildingDimensions, areaEstimate, setAreaEstimate, onNext, onBack,
}: Props) {
  const floors = formData.floors ?? 10
  const numFacades = formData.numFacades ?? 4
  const numBuildings = formData.numBuildings ?? 1
  const buildingType = formData.buildingType ?? "commercial"
  const [overrideWidth, setOverrideWidth] = useState<string>("")
  const [drawMode, setDrawMode] = useState(false)
  const [drawnRect, setDrawnRect] = useState<{ w: number; d: number } | null>(null)

  // Keep facade inputs in sync with numFacades × numBuildings
  useEffect(() => {
    const totalFacades = numFacades * numBuildings
    const existing = formData.facadeInputs ?? []
    if (existing.length !== totalFacades) {
      const defaults = buildDefaultFacadeInputs(numFacades, numBuildings)
      updateForm({ facadeInputs: defaults.map((d, i) => existing[i] ?? d) })
    }
  }, [numFacades, numBuildings]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculate area — MBR dimensions > manual draw > raw perimeter > defaults
  useEffect(() => {
    if (drawnRect) {
      setAreaEstimate(estimateFromRect(drawnRect.w, drawnRect.d, floors, numFacades))
    } else if (overrideWidth && Number(overrideWidth) > 0) {
      const w = Number(overrideWidth)
      setAreaEstimate(estimateFromPerimeter(w * numFacades, floors, numFacades, "manual-draw"))
    } else if (buildingDimensions && buildingDimensions.width_m > 0) {
      setAreaEstimate(estimateFromDimensions(buildingDimensions, floors, numFacades))
    } else if (buildingPerimeter && buildingPerimeter > 0) {
      setAreaEstimate(estimateFromPerimeter(buildingPerimeter, floors, numFacades, "overpass"))
    } else {
      setAreaEstimate(estimateFromDefaults(buildingType, floors, numFacades))
    }
  }, [floors, numFacades, buildingType, buildingPerimeter, buildingDimensions, overrideWidth, drawnRect, setAreaEstimate])

  const handleRectDraw = useCallback((width_m: number, depth_m: number) => {
    setDrawnRect({ w: width_m, d: depth_m })
    setOverrideWidth("")
  }, [])

  const handleDrawModeEnd = useCallback(() => {
    setDrawMode(false)
  }, [])

  const handleClearDraw = useCallback(() => {
    setDrawnRect(null)
    setOverrideWidth("")
  }, [])

  const handleFacadesChange = useCallback((facades: QuoteFacadeInput[]) => {
    updateForm({ facadeInputs: facades })
  }, [updateForm])

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-zinc-900">Step 2 — 建物概況</h2>

      {/* ── Section 1: Building basics + map ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: building fields */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">棟數</label>
            <input
              type="number"
              value={numBuildings}
              onChange={e => updateForm({ numBuildings: Math.max(1, Math.min(20, parseInt(e.target.value) || 1)) })}
              min={1}
              max={20}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

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

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">樓層數</label>
            <input type="number" value={floors}
              onChange={e => updateForm({ floors: Math.max(1, parseInt(e.target.value) || 1) })}
              min={1} max={100}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">施作面數</label>
            <select value={numFacades}
              onChange={e => updateForm({ numFacades: parseInt(e.target.value) })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} 面</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">施工時段</label>
            <select value={formData.timeSlot ?? "day"}
              onChange={e => updateForm({ timeSlot: e.target.value as QuoteFormData["timeSlot"] })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {TIME_SLOT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {/* Right: map + area estimation */}
        <div className="space-y-3">
          {formData.lat && formData.lng && (
            <>
              {/* Draw mode toggle button */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDrawMode(m => !m)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border font-medium transition-colors ${
                    drawMode
                      ? "bg-blue-600 text-white border-blue-600 shadow-sm"
                      : "bg-white text-zinc-600 border-zinc-300 hover:border-blue-400 hover:text-blue-600"
                  }`}
                >
                  📐 {drawMode ? "框選中 — 按此取消" : "手動框選建物範圍"}
                </button>
                {drawMode && (
                  <span className="text-xs text-zinc-500">在地圖上拖拉以框定建物邊界</span>
                )}
                {drawnRect && !drawMode && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-medium">
                      框選：{drawnRect.w} × {drawnRect.d} m
                    </span>
                    <button
                      type="button"
                      onClick={handleClearDraw}
                      className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
                      title="清除框選"
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>

              <QuoteMap
                lat={formData.lat} lng={formData.lng}
                airspace={null} polygon={buildingPolygon}
                drawMode={drawMode}
                onRectDraw={handleRectDraw}
                onDrawModeEnd={handleDrawModeEnd}
              />
            </>
          )}

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
                {buildingDimensions && buildingDimensions.width_m > 0 && !drawnRect && (
                  <p className="font-medium">
                    建物尺寸：{buildingDimensions.width_m} × {buildingDimensions.depth_m} m
                    <span className="text-xs font-normal ml-1 opacity-70">
                      （方位 {buildingDimensions.angle_deg}°）
                    </span>
                  </p>
                )}
                {/* Per-facade widths */}
                {areaEstimate.facadeWidths_m && areaEstimate.facadeWidths_m.length > 1 ? (
                  <div className="flex gap-2 flex-wrap">
                    {areaEstimate.facadeWidths_m.map((w, i) => (
                      <span key={i} className="text-xs bg-blue-100 px-2 py-0.5 rounded">
                        {FACE_DISPLAY[i] ?? `立面${i + 1}`}：{w} m
                      </span>
                    ))}
                  </div>
                ) : (
                  <p>每面均寬 ≈ {areaEstimate.facade_width_m} m</p>
                )}
                <p>建物高度 = {floors}F × 3.5m = {areaEstimate.building_height_m}m</p>
                <p className="font-semibold text-base pt-1">
                  單棟施作面積 ≈ {areaEstimate.total_area_m2.toLocaleString()} ㎡
                  {numBuildings > 1 && (
                    <span className="text-sm font-normal ml-1 opacity-80">
                      × {numBuildings} 棟 = {(areaEstimate.total_area_m2 * numBuildings).toLocaleString()} ㎡
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Manual width override */}
          <div>
            <label className="block text-sm text-zinc-500 mb-1">手動調整每面寬度（可選）</label>
            <div className="flex items-center gap-2">
              <input type="number" value={overrideWidth}
                onChange={e => { setOverrideWidth(e.target.value); setDrawnRect(null) }}
                placeholder={areaEstimate ? String(areaEstimate.facade_width_m) : ""}
                min={1}
                className="w-28 px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
              />
              <span className="text-sm text-zinc-500">公尺</span>
              {overrideWidth && (
                <button onClick={() => setOverrideWidth("")} className="text-xs text-blue-600 hover:underline">
                  恢復自動
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Section 2: Per-facade editor ── */}
      <div className="border-t border-zinc-200 pt-6">
        {formData.facadeInputs && formData.facadeInputs.length > 0 && (
          <QuoteFacadeEditor
            facades={formData.facadeInputs}
            facadeWidths_m={areaEstimate?.facadeWidths_m}
            numBuildings={numBuildings}
            onChange={handleFacadesChange}
          />
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-2">
        <button onClick={onBack}
          className="px-6 py-2.5 border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors">
          上一步
        </button>
        <button onClick={onNext} disabled={!areaEstimate}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 transition-colors font-medium">
          產生報價
        </button>
      </div>
    </div>
  )
}
