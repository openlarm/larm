"use client"

import { useState, useCallback } from "react"
import type { AirspaceResult } from "@/lib/types"
import type { QuoteFormData, BuildingDimensions } from "./quote-defaults"
import { SERVICE_OPTIONS, getWeatherRisk } from "./quote-defaults"
import { calcPolygonPerimeter } from "./quote-defaults"
import { QuoteMap } from "./QuoteMap"

interface Props {
  formData: Partial<QuoteFormData>
  updateForm: (patch: Partial<QuoteFormData>) => void
  airspace: AirspaceResult | null
  setAirspace: (a: AirspaceResult | null) => void
  setBuildingPerimeter: (p: number | null) => void
  setBuildingPolygon: (p: { lat: number; lon: number }[] | null) => void
  setBuildingDimensions: (d: BuildingDimensions | null) => void
  setBuildingName: (n: string | null) => void
  buildingName: string | null
  onNext: () => void
}

export function QuoteStep1({
  formData, updateForm, airspace, setAirspace,
  setBuildingPerimeter, setBuildingPolygon, setBuildingDimensions,
  setBuildingName, buildingName, onNext,
}: Props) {
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState("")
  const [searchInput, setSearchInput] = useState(formData.address ?? "")
  const [searchMode, setSearchMode] = useState<"address" | "name">("address")

  const handleGeocode = useCallback(async () => {
    if (!searchInput.trim() || searchInput.trim().length < 2) return
    setGeocoding(true)
    setGeocodeError("")
    setAirspace(null)
    setBuildingPerimeter(null)
    setBuildingPolygon(null)
    setBuildingDimensions(null)
    setBuildingName(null)

    try {
      // 1. Geocode (address or name mode)
      const geoRes = await fetch(
        `/api/geocode?q=${encodeURIComponent(searchInput)}&mode=${searchMode}`
      )
      const geo = await geoRes.json()
      if (geo.status !== "success") {
        setGeocodeError(geo.reason ?? "找不到此地址，請確認格式為「縣市＋區＋路名＋門牌號」")
        setGeocoding(false)
        return
      }

      updateForm({ address: searchInput, lat: geo.lat, lng: geo.lng })
      if (geo.displayName) setBuildingName(geo.displayName)

      // 2. Airspace check
      const airRes = await fetch(`/api/airspace/query?lat=${geo.lat}&lng=${geo.lng}`)
      setAirspace(await airRes.json())

      // 3. Overpass building footprint + dimensions + name
      try {
        const ovRes = await fetch(`/api/overpass?lat=${geo.lat}&lng=${geo.lng}`)
        const ovData = await ovRes.json()
        if (ovData.status === "found" && ovData.geometry) {
          setBuildingPerimeter(calcPolygonPerimeter(ovData.geometry))
          setBuildingPolygon(ovData.geometry)
          if (ovData.dimensions) setBuildingDimensions(ovData.dimensions)
          // OSM name overrides geocoder display name when available
          if (ovData.name) setBuildingName(ovData.name)
        }
      } catch {
        // Non-critical — falls back to perimeter estimate
      }
    } catch {
      setGeocodeError("網路錯誤，請稍後再試")
    } finally {
      setGeocoding(false)
    }
  }, [searchInput, searchMode, updateForm, setAirspace, setBuildingPerimeter, setBuildingPolygon, setBuildingDimensions, setBuildingName])

  const isNoFly = airspace?.status === "NoFly"
  const canProceed = formData.lat && formData.lng && formData.clientName && !isNoFly

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-zinc-900">Step 1 — 基本資訊</h2>

      {/* Client name */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">客戶名稱</label>
        <input
          type="text"
          value={formData.clientName ?? ""}
          onChange={e => updateForm({ clientName: e.target.value })}
          placeholder="例：遠雄建設"
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>

      {/* Search mode toggle + input */}
      <div>
        {/* Mode tabs */}
        <div className="flex gap-1 mb-2">
          {(["address", "name"] as const).map(mode => (
            <button
              key={mode}
              type="button"
              onClick={() => { setSearchMode(mode); setSearchInput("") }}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                searchMode === mode
                  ? "bg-blue-600 text-white"
                  : "text-zinc-500 hover:text-zinc-800"
              }`}
            >
              {mode === "address" ? "地址搜尋" : "建案名稱"}
            </button>
          ))}
        </div>

        <label className="block text-sm font-medium text-zinc-700 mb-1">
          {searchMode === "address" ? "建物地址" : "建案 / 建物名稱"}
        </label>
        <div className="flex gap-2">
          <input
            type="text"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleGeocode()}
            placeholder={
              searchMode === "address"
                ? "例：台北市信義區松仁路100號"
                : "例：台北101、信義之星、遠雄二代宅"
            }
            className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={handleGeocode}
            disabled={geocoding || searchInput.trim().length < 2}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 transition-colors whitespace-nowrap"
          >
            {geocoding ? "定位中..." : "定位"}
          </button>
        </div>

        {geocodeError && <p className="text-red-500 text-sm mt-1">{geocodeError}</p>}

        {formData.lat && formData.lng && (
          <div className="mt-1 space-y-0.5">
            <p className="text-green-600 text-sm">
              已定位：{formData.lat.toFixed(5)}, {formData.lng.toFixed(5)}
            </p>
            {buildingName && (
              <p className="text-blue-700 text-sm font-medium">
                識別建物：{buildingName}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Map */}
      {formData.lat && formData.lng && (
        <QuoteMap lat={formData.lat} lng={formData.lng} airspace={airspace} />
      )}

      {/* Airspace status */}
      {airspace && (
        <div className={`p-4 rounded-lg border ${
          isNoFly ? "bg-red-50 border-red-200" :
          airspace.status === "NeedPermit" ? "bg-yellow-50 border-yellow-200" :
          "bg-green-50 border-green-200"
        }`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {isNoFly ? "🚫" : airspace.status === "NeedPermit" ? "⚠️" : "✅"}
            </span>
            <span className="font-medium">
              {isNoFly ? "禁飛區 — 無法作業" :
               airspace.status === "NeedPermit"
                 ? "需申請空域許可（額外 " + airspace.admin_days_added + " 天行政流程）"
                 : "空域狀態正常，可直接作業"}
            </span>
          </div>
          {airspace.reason && <p className="text-sm text-zinc-600 mt-1">{airspace.reason}</p>}
        </div>
      )}

      {/* Service type */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">服務項目</label>
        <select
          value={formData.serviceType ?? "cleaning"}
          onChange={e => updateForm({ serviceType: e.target.value as QuoteFormData["serviceType"] })}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
        >
          {SERVICE_OPTIONS.map(o => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Expected date + weather risk */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">預計施工日期</label>
        <input
          type="date"
          value={formData.expectedDate ?? ""}
          min={new Date().toISOString().split("T")[0]}
          onChange={e => updateForm({ expectedDate: e.target.value })}
          className="px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm"
        />
        <WeatherRiskBadge date={formData.expectedDate} />
      </div>

      {/* Urgent */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="urgent"
          checked={formData.urgent ?? false}
          onChange={e => updateForm({ urgent: e.target.checked })}
          className="w-4 h-4 accent-blue-600"
        />
        <label htmlFor="urgent" className="text-sm text-zinc-700">
          急件（需 7 日內施作，加價 33%）
        </label>
      </div>

      {/* Next button */}
      <div className="flex justify-end pt-4">
        <button
          onClick={onNext}
          disabled={!canProceed}
          className="px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 transition-colors font-medium"
        >
          下一步
        </button>
      </div>
    </div>
  )
}

// ─── Weather risk badge ───────────────────────────────────────────────────────

const RISK_STYLES: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  low:    { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-800",  badge: "bg-green-100 text-green-700" },
  medium: { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-800",  badge: "bg-amber-100 text-amber-700" },
  high:   { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-800",    badge: "bg-red-100   text-red-700"   },
}

const RISK_LABELS: Record<string, string> = {
  low: "低風險", medium: "中度風險", high: "高風險",
}

function WeatherRiskBadge({ date }: { date?: string }) {
  const risk = getWeatherRisk(date)
  const s = RISK_STYLES[risk.level]
  return (
    <div className={`mt-2 p-3 rounded-lg border ${s.bg} ${s.border}`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base">{risk.icon}</span>
        <span className={`text-sm font-semibold ${s.text}`}>{risk.season}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.badge}`}>
          {RISK_LABELS[risk.level]}
        </span>
        {risk.bufferDays > 0 && (
          <span className="text-xs text-zinc-500 ml-auto">建議預留 +{risk.bufferDays} 天緩衝</span>
        )}
      </div>
      <ul className={`text-xs space-y-0.5 ${s.text} opacity-90`}>
        {risk.concerns.map(c => <li key={c}>• {c}</li>)}
      </ul>
      <p className={`text-xs mt-1.5 font-medium ${s.text}`}>{risk.advice}</p>
    </div>
  )
}
