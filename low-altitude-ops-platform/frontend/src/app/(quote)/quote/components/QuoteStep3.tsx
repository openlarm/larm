"use client"

import { useState, useEffect, useCallback } from "react"
import type { AirspaceResult, PricingResult, TimeResult, Contamination } from "@/lib/types"
import { generateQuote } from "@/lib/engines/pricing-engine"
import { estimateTime } from "@/lib/engines/time-engine"
import type { QuoteFormData, AreaEstimate } from "./quote-defaults"
import {
  buildFacadesFromInputs, buildFacades,
  allContaminationTypes, aggregateSupply,
  mapServiceToMissionType, mapTimeSlot,
  getWeatherRisk,
} from "./quote-defaults"
import { saveQuote } from "@/lib/stores/quote-store"

interface Props {
  formData: QuoteFormData
  airspace: AirspaceResult | null
  areaEstimate: AreaEstimate
  buildingName: string | null
  pricing: PricingResult | null
  setPricing: (p: PricingResult) => void
  timeResult: TimeResult | null
  setTimeResult: (t: TimeResult) => void
  onBack: () => void
  onReset: () => void
}

const SOURCE_LABELS: Record<string, string> = {
  overpass: "地圖自動偵測",
  "manual-draw": "手動框選",
  default: "智慧預設值",
}

const FLOOR_MULTIPLIER_LABEL: Record<string, string> = {
  "1":   "無加價",
  "1.3": "11-20F 加價",
  "2":   "21-30F 加價",
  "3":   ">30F 加價",
}

const BUILDING_LABELS: Record<string, string> = {
  commercial: "商辦大樓", luxury: "豪宅大樓",
  house: "透天厝", factory: "廠房", solar: "太陽能板",
}

export function QuoteStep3({
  formData, airspace, areaEstimate, buildingName,
  pricing, setPricing, timeResult, setTimeResult,
  onBack, onReset,
}: Props) {
  // ── ALL hooks must be declared before any early returns ───────────────────
  const handlePrint = useCallback(() => {
    // Save quote record to store
    if (pricing && timeResult) {
      const numBuildings = formData.numBuildings ?? 1
      const totalArea = areaEstimate.project_total_m2 ?? (areaEstimate.total_area_m2 * numBuildings)
      saveQuote({
        quote_code:      pricing.quote_code,
        client_name:     localInfo.clientName  || formData.clientName,
        address:         localInfo.address     || formData.address,
        building_name:   localInfo.buildingName || buildingName || undefined,
        floors:          formData.floors,
        total_area_m2:   totalArea,
        total_ntd:       pricing.total,
        suggested_days:  timeResult.suggested_days,
      })
    }

    const styleEl = document.createElement("style")
    styleEl.id = "__quote-print-style__"
    // Use visibility (not display:none) so that descendants can override
    styleEl.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #quote-print-area,
        #quote-print-area * { visibility: visible !important; }
        #quote-print-area {
          position: fixed !important;
          inset: 0 !important;
          overflow: auto !important;
          padding: 16px !important;
          background: white !important;
          z-index: 9999 !important;
        }
      }
    `
    document.head.appendChild(styleEl)
    window.print()
    window.addEventListener("afterprint", () => { styleEl.remove() }, { once: true })
  }, [pricing, timeResult, formData, areaEstimate, buildingName])

  // ── Customer info state ────────────────────────────────────────────────────
  const [localInfo, setLocalInfo] = useState({
    clientName:    formData.clientName    ?? "",
    buildingName:  buildingName           ?? "",
    address:       formData.address       ?? "",
    contactPerson: formData.contactPerson ?? "",
    phone:         formData.phone         ?? "",
    email:         formData.email         ?? "",
  })
  const [infoConfirmed, setInfoConfirmed] = useState(false)
  const [infoErrors, setInfoErrors] = useState<Record<string, string>>({})

  const handleConfirmInfo = useCallback(() => {
    const errors: Record<string, string> = {}
    if (!localInfo.clientName.trim())    errors.clientName    = "必填"
    if (!localInfo.address.trim())       errors.address       = "必填"
    if (!localInfo.contactPerson.trim()) errors.contactPerson = "必填"
    if (!localInfo.phone.trim())         errors.phone         = "必填"
    if (!localInfo.email.trim())         errors.email         = "必填"
    if (Object.keys(errors).length > 0) { setInfoErrors(errors); return }
    setInfoConfirmed(true)
  }, [localInfo])

  useEffect(() => {
    const hasPerFacade = formData.facadeInputs && formData.facadeInputs.length > 0
    const facades = hasPerFacade
      ? buildFacadesFromInputs(formData.facadeInputs!, areaEstimate, formData.buildingType)
      : buildFacades(areaEstimate, formData.buildingType)

    const contamination = hasPerFacade
      ? allContaminationTypes(formData.facadeInputs!)
      : (["dust"] as Contamination[])

    const timeWindow = mapTimeSlot(formData.timeSlot)
    const waterSupply = hasPerFacade ? aggregateSupply(formData.facadeInputs!, "water") : "Provided"
    const powerSupply = hasPerFacade ? aggregateSupply(formData.facadeInputs!, "power") : "Provided"
    const rooftopAccess = formData.rooftopAccess ?? "Good"
    const cleaningAgent = formData.cleaningAgent ?? "water"

    setPricing(generateQuote({
      buildingType: formData.buildingType,
      floors: formData.floors,
      facades,
      contamination,
      cleaningAgent,
      timeWindow,
      waterSupply,
      powerSupply,
      rooftopAccess,
      urgent: formData.urgent,
    }))

    setTimeResult(estimateTime({
      missionType: mapServiceToMissionType(formData.serviceType),
      buildingType: formData.buildingType,
      floors: formData.floors,
      wind_ms: 4,
      facades,
      contamination,
      timeWindow,
      riskLevel: "R0",
      waterSupply,
      powerSupply,
      rooftopAccess,
    }))
  }, [formData, areaEstimate, setPricing, setTimeResult])

  if (!pricing || !timeResult) {
    return <div className="text-center py-12 text-zinc-500">計算中...</div>
  }

  const numBuildings = formData.numBuildings ?? 1
  // project_total_m2 is set when buildings have different sizes; otherwise multiply
  const totalArea = areaEstimate.project_total_m2 ?? (areaEstimate.total_area_m2 * numBuildings)

  // Group line items by building for display
  type BldgGroup = { name: string; area: number; subtotal: number; facades: number }
  const bldgGroups: BldgGroup[] = []
  const extraItems: typeof pricing.line_items = []
  for (const item of pricing.line_items) {
    if (item.code.startsWith("FACE-")) {
      // code format: "FACE-{buildingIdx}-{facadeIdx}"
      const bIdx = parseInt(item.code.slice(5).split("-")[0])
      while (bldgGroups.length <= bIdx) bldgGroups.push({ name: "", area: 0, subtotal: 0, facades: 0 })
      const grp = bldgGroups[bIdx]
      grp.name = numBuildings > 1
        ? `棟 ${["A","B","C","D","E","F"][bIdx] ?? bIdx + 1}`
        : "施作費用"
      grp.area += item.area_m2 ?? 0
      grp.subtotal += item.subtotal
      grp.facades++
    } else {
      extraItems.push(item)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-zinc-900 no-print">Step 3 — 報價結果</h2>

      <div id="quote-print-area" className="border border-zinc-300 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-800 text-white px-4 sm:px-6 py-4">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-base sm:text-lg font-bold">GDS 低空作業 快速報價單</h3>
              <p className="text-zinc-400 text-xs sm:text-sm">Quick Quote — 估算報價，正式報價以現場勘查為準</p>
            </div>
            <div className="text-right shrink-0">
              <p className="font-mono text-sm">{pricing.quote_code}</p>
              <p className="text-zinc-400 text-xs">有效至 {pricing.valid_until}</p>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="px-4 sm:px-6 py-4 bg-zinc-50 border-b border-zinc-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <InfoRow label="客戶" value={infoConfirmed ? localInfo.clientName : formData.clientName} />
            <InfoRow label="地址" value={infoConfirmed ? localInfo.address : formData.address} />
            {(infoConfirmed ? localInfo.buildingName : buildingName) && (
              <InfoRow label="建物名稱" value={(infoConfirmed ? localInfo.buildingName : buildingName)!} />
            )}
            {infoConfirmed && localInfo.contactPerson && <InfoRow label="聯絡人"  value={localInfo.contactPerson} />}
            {infoConfirmed && localInfo.phone         && <InfoRow label="電話"    value={localInfo.phone} />}
            {infoConfirmed && localInfo.email         && <InfoRow label="信箱"    value={localInfo.email} />}
            <InfoRow
              label="建物"
              value={`${BUILDING_LABELS[formData.buildingType] ?? formData.buildingType} ${formData.floors}F（${(formData.floors * 3.5).toFixed(1)}m）`}
            />
            {(formData.numBuildings ?? 1) > 1 && (
              <InfoRow label="棟數" value={`${formData.numBuildings} 棟`} />
            )}
            <InfoRow
              label="空域"
              value={
                !airspace || airspace.status === "OK" ? "✅ 可直接作業" :
                airspace.status === "NeedPermit" ? "⚠️ 需申請許可" : "🚫 禁飛區"
              }
            />
            {formData.regionExposure && <InfoRow label="環境曝露" value={formData.regionExposure === "windward" ? "迎風面" : formData.regionExposure === "leeward" ? "背風面" : formData.regionExposure === "coastal" ? "沿海" : "開闊屋頂"} />}
            {formData.crowdDensity && <InfoRow label="人流密度" value={formData.crowdDensity === "low" ? "低" : formData.crowdDensity === "medium" ? "中" : "高"} />}
            <InfoRow label="面積來源" value={SOURCE_LABELS[areaEstimate.source]} />
            <InfoRow
              label="施作總面積"
              value={
                areaEstimate.project_total_m2 != null
                  ? `${totalArea.toLocaleString()} ㎡（各棟實測合計）`
                  : numBuildings > 1
                    ? `${totalArea.toLocaleString()} ㎡（${areaEstimate.total_area_m2.toLocaleString()} ㎡ × ${numBuildings} 棟）`
                    : `${totalArea.toLocaleString()} ㎡`
              }
            />
            {formData.expectedDate && (
              <InfoRow label="預計施工日期" value={formData.expectedDate} />
            )}
          </div>
        </div>

        {/* Per-facade summary */}
        {formData.facadeInputs && formData.facadeInputs.length > 0 && (
          <div className="px-4 sm:px-6 py-4 border-b border-zinc-200">
            <h4 className="text-sm font-semibold text-zinc-600 mb-3">各立面概況</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {formData.facadeInputs.map(f => (
                <div key={f.id} className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-zinc-800 mb-1">{f.buildingLabel ? `棟${f.buildingLabel} ${f.label}` : f.label}</div>
                  <div className="text-zinc-500">
                    {f.dirtTypes.map(d =>
                      d === "dust" ? "灰塵" : d === "scale" ? "水垢" :
                      d === "mold" ? "黑黴" : d === "bird" ? "鳥屎" :
                      d === "exhaust" ? "排煙汙垢" : "機械油汙"
                    ).join("、")}
                  </div>
                  <div className="text-zinc-500">
                    {f.complexity === "none" ? "無複雜" : f.complexity === "light" ? "輕微" :
                     f.complexity === "medium" ? "中等" : "複雜"}
                  </div>
                  {f.hasRecesses && <div className="text-amber-600">有內縮/露台</div>}
                  {f.isHighRisk && <div className="text-red-600">高風險環境</div>}
                  {f.hasAdjacentTrees && (
                    <div className="text-green-700">
                      鄰樹 {f.treeFloors > 0 ? `${f.treeFloors}F` : ""}
                      {f.treeFloors > 0 ? (f.cleanTreeFloors ? "（含清洗+10）" : "（不計入清洗）") : ""}
                    </div>
                  )}
                  {f.waterSupply === "SelfSupply" && <div className="text-orange-600">自備用水</div>}
                  {f.powerSupply === "SelfSupply"
                    ? <div className="text-orange-600">自備用電</div>
                    : f.powerVoltage?.length
                      ? <div className="text-green-700">⚡ {f.powerVoltage.join(" / ")}</div>
                      : null
                  }
                  {f.supplyPhotos.length > 0 && (
                    <div className="text-blue-600">{f.supplyPhotos.length} 張水電照</div>
                  )}
                  {f.photos.length > 0 && (
                    <div className="text-blue-600">{f.photos.length} 張立面照</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weather risk advisory */}
        <WeatherAdvisory date={formData.expectedDate} suggestedDays={timeResult.suggested_days} />

        {/* Line items — grouped by building */}
        <div className="px-4 sm:px-6 py-4">
          <h4 className="text-sm font-semibold text-zinc-600 mb-3">費用明細</h4>
          <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm min-w-[360px]">
            <thead>
              <tr className="text-zinc-500 border-b">
                <th className="text-left py-2 font-medium">項目</th>
                <th className="text-right py-2 font-medium">施作面積</th>
                <th className="text-right py-2 font-medium">單價</th>
                <th className="text-right py-2 font-medium">小計</th>
              </tr>
            </thead>
            <tbody>
              {bldgGroups.filter(Boolean).map((grp, idx) => (
                <tr key={`bldg-${idx}`} className="border-b border-zinc-100">
                  <td className="py-2">
                    {grp.name}
                    <span className="text-xs text-zinc-400 ml-1">（{grp.facades} 面）</span>
                  </td>
                  <td className="text-right py-2 text-zinc-600">
                    {grp.area.toLocaleString()} ㎡
                  </td>
                  <td className="text-right py-2 text-zinc-500 text-xs">
                    {grp.area > 0 ? `${Math.round(grp.subtotal / grp.area)} NTD/㎡` : "—"}
                  </td>
                  <td className="text-right py-2 font-medium">
                    {grp.subtotal.toLocaleString()} NTD
                  </td>
                </tr>
              ))}
              {extraItems.map(item => (
                <tr key={item.code} className="border-b border-zinc-100">
                  <td className="py-2">{item.label}</td>
                  <td className="text-right py-2 text-zinc-600">—</td>
                  <td className="text-right py-2 text-zinc-500">—</td>
                  <td className="text-right py-2 font-medium">
                    {item.subtotal.toLocaleString()} NTD
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-zinc-200">
                <td colSpan={3} className="py-2 text-right text-zinc-500">小計</td>
                <td className="text-right py-2 font-medium">{pricing.subtotal.toLocaleString()} NTD</td>
              </tr>
            </tfoot>
          </table>
          </div>
        </div>

        {/* Multipliers */}
        <div className="px-4 sm:px-6 py-4 bg-zinc-50 border-t border-zinc-200">
          <h4 className="text-sm font-semibold text-zinc-600 mb-3">調整係數</h4>
          <div className="space-y-1 text-sm">
            {Object.entries(pricing.multiplier_breakdown).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-zinc-600">
                  {key === "floor"       ? `高樓加價（${FLOOR_MULTIPLIER_LABEL[String(val)] ?? ""}）` :
                   key === "time_window" ? "施工時段" :
                   key === "urgent"      ? "急件加價" : key}
                </span>
                <span className={val > 1 ? "text-orange-600 font-medium" : "text-zinc-500"}>
                  × {val.toFixed(2)}
                </span>
              </div>
            ))}
            <div className="flex justify-between pt-1 border-t border-zinc-300 font-medium">
              <span>合計倍率</span>
              <span>× {pricing.multiplier.toFixed(2)}</span>
            </div>
          </div>
        </div>

        {/* Total */}
        <div className="px-4 sm:px-6 py-5 bg-blue-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-200 text-sm">報價總額</p>
              <p className="text-3xl font-bold">NTD {pricing.total.toLocaleString()}</p>
            </div>
            <div className="text-right">
              <p className="text-blue-200 text-sm">預估工期</p>
              <p className="text-2xl font-bold">{timeResult.suggested_days} 天</p>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 text-sm text-amber-800">
          ⚠️ 本報價為快速估算，正式報價需現場勘查確認。
          面積估算基於{SOURCE_LABELS[areaEstimate.source]}，誤差範圍約 ±15%。
        </div>
      </div>

      {/* Customer info confirmation — required before PDF download */}
      <div className={`no-print border rounded-xl overflow-hidden transition-colors ${infoConfirmed ? "border-emerald-300 bg-emerald-50" : "border-amber-300 bg-amber-50"}`}>
        {infoConfirmed ? (
          <div className="px-6 py-4 flex items-center gap-3">
            <span className="text-emerald-600 text-lg">✅</span>
            <div className="flex-1 text-sm text-emerald-800">
              <p className="font-semibold">客戶資料已確認</p>
              <p className="text-xs text-emerald-700 mt-0.5">
                {localInfo.contactPerson}・{localInfo.phone}・{localInfo.email}
              </p>
            </div>
            <button
              onClick={() => setInfoConfirmed(false)}
              className="text-xs text-emerald-600 hover:text-emerald-800 underline"
            >
              修改
            </button>
          </div>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-amber-600">📋</span>
              <p className="text-sm font-semibold text-amber-800">請填寫客戶資料後方可下載 PDF</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
              {[
                { key: "clientName",    label: "客戶名稱", placeholder: "例：遠雄建設",         type: "text"  },
                { key: "buildingName",  label: "建物名稱", placeholder: "例：信義之星",          type: "text"  },
                { key: "address",       label: "建物地址", placeholder: "台北市信義區…",         type: "text"  },
                { key: "contactPerson", label: "聯絡人",   placeholder: "例：王大明",             type: "text"  },
                { key: "phone",         label: "電話號碼", placeholder: "例：0912-345-678",       type: "tel"   },
                { key: "email",         label: "信箱",     placeholder: "example@company.com.tw", type: "email" },
              ].map(({ key, label, placeholder, type }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-amber-800 mb-1">
                    {label}
                    {key !== "buildingName" && <span className="text-red-500 ml-0.5">*</span>}
                  </label>
                  <input
                    type={type}
                    value={localInfo[key as keyof typeof localInfo]}
                    onChange={e => {
                      setLocalInfo(prev => ({ ...prev, [key]: e.target.value }))
                      if (infoErrors[key]) setInfoErrors(prev => { const n = { ...prev }; delete n[key]; return n })
                    }}
                    placeholder={placeholder}
                    className={`w-full px-3 py-2 text-sm border rounded-lg outline-none focus:ring-2 focus:ring-amber-400 bg-white ${
                      infoErrors[key] ? "border-red-400" : "border-amber-200"
                    }`}
                  />
                  {infoErrors[key] && <p className="text-red-500 text-xs mt-0.5">{infoErrors[key]}</p>}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={handleConfirmInfo}
                className="px-5 py-2 bg-amber-500 text-white text-sm rounded-lg hover:bg-amber-600 font-medium transition-colors"
              >
                確認客戶資料
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2 no-print">
        <button
          onClick={onBack}
          className="px-5 py-3 sm:py-2.5 border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          上一步
        </button>
        <button
          onClick={handlePrint}
          disabled={!infoConfirmed}
          title={!infoConfirmed ? "請先填寫並確認客戶資料" : ""}
          className={`px-5 py-3 sm:py-2.5 rounded-lg font-medium transition-colors ${
            infoConfirmed
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-zinc-200 text-zinc-400 cursor-not-allowed"
          }`}
        >
          下載 PDF
        </button>
        <button
          onClick={onReset}
          className="px-5 py-3 sm:py-2.5 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
        >
          重新填寫
        </button>
      </div>
    </div>
  )
}

// ─── Weather advisory ─────────────────────────────────────────────────────────

const RISK_STYLES = {
  low:    { bg: "bg-green-50",  border: "border-green-200",  text: "text-green-800",  badge: "bg-green-100 text-green-700"  },
  medium: { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-800",  badge: "bg-amber-100 text-amber-700"  },
  high:   { bg: "bg-red-50",    border: "border-red-200",    text: "text-red-800",    badge: "bg-red-100   text-red-700"    },
}
const RISK_LABELS = { low: "低風險", medium: "中度風險", high: "高風險" }

function WeatherAdvisory({ date, suggestedDays }: { date?: string; suggestedDays: number }) {
  const risk = getWeatherRisk(date)
  const s = RISK_STYLES[risk.level]
  const totalDays = suggestedDays + risk.bufferDays

  return (
    <div className={`mx-6 mb-4 p-4 rounded-lg border ${s.bg} ${s.border}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base">{risk.icon}</span>
        <span className={`text-sm font-semibold ${s.text}`}>天氣風險評估</span>
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.badge}`}>
          {RISK_LABELS[risk.level]}
        </span>
        <span className={`text-xs ml-auto ${s.text} opacity-80`}>{risk.season}</span>
      </div>

      <div className={`text-xs space-y-0.5 ${s.text} opacity-90 mb-2`}>
        {risk.concerns.map(c => <p key={c}>• {c}</p>)}
      </div>

      <p className={`text-xs font-medium ${s.text}`}>{risk.advice}</p>

      {risk.bufferDays > 0 && (
        <div className={`mt-2 pt-2 border-t ${s.border} flex items-center justify-between text-xs ${s.text}`}>
          <span>含天氣緩衝估算工期</span>
          <span className="font-semibold">
            {suggestedDays} 天（施作）+ {risk.bufferDays} 天（緩衝）= {totalDays} 天
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-zinc-500">{label}：</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}

function buildPlainText(
  form: QuoteFormData,
  airspace: AirspaceResult | null,
  area: AreaEstimate,
  pricing: PricingResult,
  time: TimeResult,
): string {
  const lines = [
    `=== GDS 低空作業 快速報價單 ===`,
    `報價編號：${pricing.quote_code}`,
    `報價日期：${new Date().toISOString().split("T")[0]}`,
    `有效至：${pricing.valid_until}`,
    ``,
    `客戶：${form.clientName}`,
    `地址：${form.address}`,
    `建物：${form.floors}F（${(form.floors * 3.5).toFixed(1)}m）${(form.numBuildings ?? 1) > 1 ? `，共 ${form.numBuildings} 棟` : ""}`,
    `空域：${!airspace || airspace.status === "OK" ? "可直接作業" : airspace.status === "NeedPermit" ? "需申請許可" : "禁飛區"}`,
    `施作面積：${(area.total_area_m2 * (form.numBuildings ?? 1)).toLocaleString()} ㎡（${SOURCE_LABELS[area.source]}${(form.numBuildings ?? 1) > 1 ? `，${form.numBuildings} 棟合計` : ""}）`,
    ``,
    `--- 費用明細 ---`,
    ...pricing.line_items.map(li => `${li.label}  ${li.subtotal.toLocaleString()} NTD`),
    `小計：${pricing.subtotal.toLocaleString()} NTD`,
    `調整倍率：× ${pricing.multiplier.toFixed(2)}`,
    ``,
    `報價總額：NTD ${pricing.total.toLocaleString()}`,
    `預估工期：${time.suggested_days} 天`,
    ...(form.expectedDate ? (() => {
      const w = getWeatherRisk(form.expectedDate)
      const total = time.suggested_days + w.bufferDays
      return [
        ``,
        `--- 天氣風險評估（${w.season}，${["低風險","中度風險","高風險"][["low","medium","high"].indexOf(w.level)]}）---`,
        ...w.concerns.map(c => `• ${c}`),
        w.bufferDays > 0 ? `建議含緩衝工期：${time.suggested_days} + ${w.bufferDays} = ${total} 天` : "",
        w.advice,
      ].filter(Boolean)
    })() : []),
    ``,
    `⚠️ 本報價為快速估算，正式報價需現場勘查確認。`,
  ]
  return lines.join("\n")
}
