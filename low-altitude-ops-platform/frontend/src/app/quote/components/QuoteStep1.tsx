"use client"

import { useState, useCallback } from "react"
import type { AirspaceResult } from "@/lib/types"
import type { QuoteFormData } from "./quote-defaults"
import { SERVICE_OPTIONS } from "./quote-defaults"
import { calcPolygonPerimeter } from "./quote-defaults"
import { QuoteMap } from "./QuoteMap"

interface Props {
  formData: Partial<QuoteFormData>
  updateForm: (patch: Partial<QuoteFormData>) => void
  airspace: AirspaceResult | null
  setAirspace: (a: AirspaceResult | null) => void
  setBuildingPerimeter: (p: number | null) => void
  setBuildingPolygon: (p: { lat: number; lon: number }[] | null) => void
  onNext: () => void
}

export function QuoteStep1({
  formData, updateForm, airspace, setAirspace,
  setBuildingPerimeter, setBuildingPolygon, onNext,
}: Props) {
  const [geocoding, setGeocoding] = useState(false)
  const [geocodeError, setGeocodeError] = useState("")
  const [addressInput, setAddressInput] = useState(formData.address ?? "")

  const handleGeocode = useCallback(async () => {
    if (!addressInput.trim() || addressInput.trim().length < 4) return
    setGeocoding(true)
    setGeocodeError("")
    setAirspace(null)
    setBuildingPerimeter(null)
    setBuildingPolygon(null)

    try {
      // 1. Geocode
      const geoRes = await fetch(`/api/geocode?q=${encodeURIComponent(addressInput)}`)
      const geo = await geoRes.json()
      if (geo.status !== "success") {
        setGeocodeError("找不到此地址，請嘗試更完整的地址")
        setGeocoding(false)
        return
      }

      updateForm({ address: addressInput, lat: geo.lat, lng: geo.lng })

      // 2. Airspace check
      const airRes = await fetch(`/api/airspace/query?lat=${geo.lat}&lng=${geo.lng}`)
      const airData = await airRes.json()
      setAirspace(airData)

      // 3. Overpass building footprint
      try {
        const ovRes = await fetch(`/api/overpass?lat=${geo.lat}&lng=${geo.lng}`)
        const ovData = await ovRes.json()
        if (ovData.status === "found" && ovData.geometry) {
          const perimeter = calcPolygonPerimeter(ovData.geometry)
          setBuildingPerimeter(perimeter)
          setBuildingPolygon(ovData.geometry)
        }
      } catch {
        // Overpass failure is non-critical — fallback to defaults
      }
    } catch {
      setGeocodeError("網路錯誤，請稍後再試")
    } finally {
      setGeocoding(false)
    }
  }, [addressInput, updateForm, setAirspace, setBuildingPerimeter, setBuildingPolygon])

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
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
      </div>

      {/* Address + geocode */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">建物地址</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={addressInput}
            onChange={e => setAddressInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleGeocode()}
            placeholder="例：台北市信義區松仁路100號"
            className="flex-1 px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
          />
          <button
            onClick={handleGeocode}
            disabled={geocoding || addressInput.trim().length < 4}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-zinc-300 disabled:text-zinc-500 transition-colors whitespace-nowrap"
          >
            {geocoding ? "定位中..." : "定位"}
          </button>
        </div>
        {geocodeError && <p className="text-red-500 text-sm mt-1">{geocodeError}</p>}
        {formData.lat && formData.lng && (
          <p className="text-green-600 text-sm mt-1">
            已定位：{formData.lat.toFixed(4)}, {formData.lng.toFixed(4)}
          </p>
        )}
      </div>

      {/* Map */}
      {formData.lat && formData.lng && (
        <QuoteMap lat={formData.lat} lng={formData.lng} airspace={airspace} />
      )}

      {/* Airspace status */}
      {airspace && (
        <div
          className={`p-4 rounded-lg border ${
            isNoFly
              ? "bg-red-50 border-red-200"
              : airspace.status === "NeedPermit"
                ? "bg-yellow-50 border-yellow-200"
                : "bg-green-50 border-green-200"
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">
              {isNoFly ? "🚫" : airspace.status === "NeedPermit" ? "⚠️" : "✅"}
            </span>
            <span className="font-medium">
              {isNoFly
                ? "禁飛區 — 無法作業"
                : airspace.status === "NeedPermit"
                  ? "需申請空域許可（額外 " + airspace.admin_days_added + " 天行政流程）"
                  : "空域狀態正常，可直接作業"}
            </span>
          </div>
          {airspace.reason && (
            <p className="text-sm text-zinc-600 mt-1">{airspace.reason}</p>
          )}
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
