"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import type { RooftopAccess } from "@/lib/types"
import type { QuoteFormData, AreaEstimate, QuoteFacadeInput, BuildingDimensions, CleaningAgent, DrawnRectBounds } from "./quote-defaults"
import {
  BUILDING_TYPE_OPTIONS, TIME_SLOT_OPTIONS, CLEANING_AGENT_OPTIONS,
  estimateFromPerimeter, estimateFromDefaults, estimateFromRect, estimateFromDimensions,
  estimateFromMultiRects,
  buildDefaultFacadeInputs,
} from "./quote-defaults"
import { QuoteMap } from "./QuoteMap"
import type { PersistedRect } from "./QuoteMap"
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

const FACE_DISPLAY = ["正面", "左側", "右側", "背面"]
const BUILDING_LABELS = ["A", "B", "C", "D", "E", "F"]

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

  // Per-building drawn rectangles (one slot per building index)
  const [drawnRects, setDrawnRects] = useState<(DrawnRectBounds | null)[]>([])
  const [drawTarget, setDrawTarget] = useState(0)
  const drawTargetRef = useRef(drawTarget)
  useEffect(() => { drawTargetRef.current = drawTarget }, [drawTarget])

  // Keep facade inputs in sync with numFacades × numBuildings
  useEffect(() => {
    const totalFacades = numFacades * numBuildings
    const existing = formData.facadeInputs ?? []
    if (existing.length !== totalFacades) {
      const defaults = buildDefaultFacadeInputs(numFacades, numBuildings)
      updateForm({ facadeInputs: defaults.map((d, i) => existing[i] ?? d) })
    }
  }, [numFacades, numBuildings]) // eslint-disable-line react-hooks/exhaustive-deps

  // Recalculate area estimate
  useEffect(() => {
    if (numBuildings > 1 && drawnRects.some(r => r !== null)) {
      setAreaEstimate(estimateFromMultiRects(drawnRects, numBuildings, floors, numFacades))
    } else if (drawnRects[0]) {
      setAreaEstimate(estimateFromRect(drawnRects[0].w, drawnRects[0].d, floors, numFacades))
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
  }, [floors, numFacades, numBuildings, buildingType, buildingPerimeter, buildingDimensions, overrideWidth, drawnRects, setAreaEstimate]) // eslint-disable-line react-hooks/exhaustive-deps

  // Stable callback — uses ref to avoid map re-init when drawTarget changes
  const handleRectDraw = useCallback((
    w: number, d: number,
    sw: [number, number], ne: [number, number],
  ) => {
    const idx = drawTargetRef.current
    setDrawnRects(prev => {
      const next = Array.from(
        { length: Math.max(prev.length, idx + 1) },
        (_, i) => prev[i] ?? null,
      )
      next[idx] = { w, d, sw, ne }
      return next
    })
    setOverrideWidth("")
  }, [])

  const handleDrawModeEnd = useCallback(() => setDrawMode(false), [])

  const clearRect = useCallback((idx: number) => {
    setDrawnRects(prev => { const next = [...prev]; next[idx] = null; return next })
  }, [])

  const handleFacadesChange = useCallback((facades: QuoteFacadeInput[]) => {
    updateForm({ facadeInputs: facades })
  }, [updateForm])

  const persistedRects: PersistedRect[] = drawnRects
    .map((r, i) => r
      ? { sw: r.sw, ne: r.ne, label: numBuildings > 1 ? `棟${BUILDING_LABELS[i] ?? i + 1}` : "框選範圍" }
      : null)
    .filter((r): r is PersistedRect => r !== null)

  const drawLabel = numBuildings > 1 && drawMode
    ? `棟${BUILDING_LABELS[drawTarget] ?? drawTarget + 1}`
    : undefined

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
              min={1} max={20}
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

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              清潔劑種類
              <span className="text-xs font-normal text-zinc-400 ml-1">（整案）</span>
            </label>
            <select
              value={formData.cleaningAgent ?? "water"}
              onChange={e => updateForm({ cleaningAgent: e.target.value as CleaningAgent })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              {CLEANING_AGENT_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>
                  {o.label}{o.surcharge > 0 ? `（+${o.surcharge} NTD/㎡）` : "（無加價）"}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              屋頂吊掛條件
              <span className="text-xs font-normal text-zinc-400 ml-1">（影響所有立面）</span>
            </label>
            <select
              value={formData.rooftopAccess ?? "Good"}
              onChange={e => updateForm({ rooftopAccess: e.target.value as RooftopAccess })}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="Good">良好（女兒牆佳，無加價）</option>
              <option value="Limited">受限（女兒牆深/寬，+12 NTD/㎡）</option>
              <option value="NotAvailable">不可使用（+12 NTD/㎡）</option>
            </select>
          </div>
        </div>

        {/* Right: map + area estimation */}
        <div className="space-y-3">
          {formData.lat && formData.lng && (
            <>
              {/* Draw mode controls */}
              {numBuildings <= 1 ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setDrawTarget(0); setDrawMode(m => !m) }}
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
                  {drawnRects[0] && !drawMode && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-lg font-medium">
                        框選：{drawnRects[0].w} × {drawnRects[0].d} m
                      </span>
                      <button
                        type="button"
                        onClick={() => clearRect(0)}
                        className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
                      >×</button>
                    </div>
                  )}
                </div>
              ) : (
                /* Multi-building — per-building draw buttons */
                <div className="space-y-2">
                  <p className="text-xs font-medium text-zinc-500">分別框選各棟範圍：</p>
                  <div className="flex flex-wrap gap-2">
                    {Array.from({ length: numBuildings }, (_, i) => {
                      const bLabel = BUILDING_LABELS[i] ?? String(i + 1)
                      const rect = drawnRects[i]
                      const isActive = drawMode && drawTarget === i
                      return (
                        <div key={i} className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              if (isActive) { setDrawMode(false) }
                              else { setDrawTarget(i); setDrawMode(true) }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs border font-medium transition-colors ${
                              isActive
                                ? "bg-blue-600 text-white border-blue-600"
                                : rect
                                  ? "bg-green-50 text-green-700 border-green-400 hover:border-green-600"
                                  : "bg-white text-zinc-600 border-zinc-300 hover:border-blue-400"
                            }`}
                          >
                            📐 棟{bLabel}
                            {isActive ? " — 按此取消" : rect ? ` ${rect.w}×${rect.d}m` : "（未設定）"}
                          </button>
                          {rect && !isActive && (
                            <button
                              type="button"
                              onClick={() => clearRect(i)}
                              className="text-xs text-zinc-400 hover:text-red-500 transition-colors"
                            >×</button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {drawMode && (
                    <span className="text-xs text-zinc-400">
                      在地圖上拖拉以框定棟{BUILDING_LABELS[drawTarget] ?? drawTarget + 1}邊界
                    </span>
                  )}
                </div>
              )}

              <QuoteMap
                lat={formData.lat} lng={formData.lng}
                airspace={null} polygon={buildingPolygon}
                drawMode={drawMode}
                drawLabel={drawLabel}
                persistedRects={persistedRects}
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
                {buildingDimensions && buildingDimensions.width_m > 0 && !drawnRects.some(r => r !== null) && (
                  <p className="font-medium">
                    建物尺寸：{buildingDimensions.width_m} × {buildingDimensions.depth_m} m
                    <span className="text-xs font-normal ml-1 opacity-70">
                      （方位 {buildingDimensions.angle_deg}°）
                    </span>
                  </p>
                )}
                {!areaEstimate.perBuildingFacadeWidths && areaEstimate.facadeWidths_m && areaEstimate.facadeWidths_m.length > 1 ? (
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
                  {areaEstimate.project_total_m2 != null ? (
                    <>各棟合計 ≈ {areaEstimate.project_total_m2.toLocaleString()} ㎡</>
                  ) : (
                    <>
                      單棟施作面積 ≈ {areaEstimate.total_area_m2.toLocaleString()} ㎡
                      {numBuildings > 1 && (
                        <span className="text-sm font-normal ml-1 opacity-80">
                          × {numBuildings} 棟 = {(areaEstimate.total_area_m2 * numBuildings).toLocaleString()} ㎡
                        </span>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* Manual width override (single building only) */}
          {numBuildings <= 1 && (
            <div>
              <label className="block text-sm text-zinc-500 mb-1">手動調整每面寬度（可選）</label>
              <div className="flex items-center gap-2">
                <input type="number" value={overrideWidth}
                  onChange={e => { setOverrideWidth(e.target.value); setDrawnRects([]) }}
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
          )}
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
