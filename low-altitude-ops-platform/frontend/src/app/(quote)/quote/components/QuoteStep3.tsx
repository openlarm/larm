"use client"

import { useEffect } from "react"
import type { AirspaceResult, PricingResult, TimeResult } from "@/lib/types"
import { generateQuote } from "@/lib/engines/pricing-engine"
import { estimateTime } from "@/lib/engines/time-engine"
import type { QuoteFormData, AreaEstimate } from "./quote-defaults"
import {
  buildFacadesFromInputs, buildFacades,
  inferRiskLevel, worstContamination,
  mapServiceToMissionType, mapTimeSlot,
} from "./quote-defaults"

interface Props {
  formData: QuoteFormData
  airspace: AirspaceResult | null
  areaEstimate: AreaEstimate
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
  formData, airspace, areaEstimate,
  pricing, setPricing, timeResult, setTimeResult,
  onBack, onReset,
}: Props) {
  useEffect(() => {
    const hasPerFacade = formData.facadeInputs && formData.facadeInputs.length > 0
    const facades = hasPerFacade
      ? buildFacadesFromInputs(formData.facadeInputs!, areaEstimate, formData.buildingType)
      : buildFacades(areaEstimate, formData.buildingType)

    const contamination = hasPerFacade
      ? worstContamination(formData.facadeInputs!)
      : "dust"

    const riskLevel = inferRiskLevel(formData.floors)
    const timeWindow = mapTimeSlot(formData.timeSlot)
    const waterSupply = formData.waterSupply ?? "Provided"
    const powerSupply = formData.powerSupply ?? "Provided"

    setPricing(generateQuote({
      buildingType: formData.buildingType,
      floors: formData.floors,
      facades,
      contamination,
      timeWindow,
      riskLevel,
      waterSupply,
      powerSupply,
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
      riskLevel,
      waterSupply,
      powerSupply,
      rooftopAccess: "Good",
    }))
  }, [formData, areaEstimate, setPricing, setTimeResult])

  if (!pricing || !timeResult) {
    return <div className="text-center py-12 text-zinc-500">計算中...</div>
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(
      buildPlainText(formData, airspace, areaEstimate, pricing, timeResult)
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-zinc-900">Step 3 — 報價結果</h2>

      <div className="border border-zinc-300 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="bg-zinc-800 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold">GDS 低空作業 快速報價單</h3>
              <p className="text-zinc-400 text-sm">Quick Quote — 估算報價，正式報價以現場勘查為準</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-sm">{pricing.quote_code}</p>
              <p className="text-zinc-400 text-xs">有效至 {pricing.valid_until}</p>
            </div>
          </div>
        </div>

        {/* Info grid */}
        <div className="px-6 py-4 bg-zinc-50 border-b border-zinc-200">
          <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <InfoRow label="客戶" value={formData.clientName} />
            <InfoRow label="地址" value={formData.address} />
            <InfoRow
              label="建物"
              value={`${BUILDING_LABELS[formData.buildingType] ?? formData.buildingType} ${formData.floors}F（${(formData.floors * 3.5).toFixed(1)}m）`}
            />
            <InfoRow
              label="空域"
              value={
                !airspace || airspace.status === "OK" ? "✅ 可直接作業" :
                airspace.status === "NeedPermit" ? "⚠️ 需申請許可" : "🚫 禁飛區"
              }
            />
            <InfoRow label="面積來源" value={SOURCE_LABELS[areaEstimate.source]} />
            <InfoRow label="施作總面積" value={`${areaEstimate.total_area_m2.toLocaleString()} ㎡`} />
            <InfoRow
              label="水電供應"
              value={`${formData.waterSupply === "Provided" ? "業主提供" : "自備"} / ${formData.powerSupply === "Provided" ? "業主提供" : "自備"}`}
            />
          </div>
        </div>

        {/* Per-facade summary */}
        {formData.facadeInputs && formData.facadeInputs.length > 0 && (
          <div className="px-6 py-4 border-b border-zinc-200">
            <h4 className="text-sm font-semibold text-zinc-600 mb-3">各立面概況</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {formData.facadeInputs.map(f => (
                <div key={f.id} className="bg-zinc-50 border border-zinc-200 rounded-lg p-3 text-xs">
                  <div className="font-semibold text-zinc-800 mb-1">立面 {f.label}</div>
                  <div className="text-zinc-500">
                    {f.dirtTypes.map(d =>
                      d === "dust" ? "灰塵" : d === "scale" ? "鏽斑" :
                      d === "mold" ? "青苔" : "油汙"
                    ).join("、")}
                  </div>
                  <div className="text-zinc-500">
                    {f.complexity === "none" ? "無複雜" : f.complexity === "light" ? "輕微" :
                     f.complexity === "medium" ? "中等" : "複雜"}
                  </div>
                  {f.hasRecesses && <div className="text-amber-600">有內縮/露台</div>}
                  {f.isHighRisk && <div className="text-red-600">高風險環境</div>}
                  {f.photos.length > 0 && (
                    <div className="text-blue-600">{f.photos.length} 張照片</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Line items */}
        <div className="px-6 py-4">
          <h4 className="text-sm font-semibold text-zinc-600 mb-3">費用明細</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-zinc-500 border-b">
                <th className="text-left py-2 font-medium">項目</th>
                <th className="text-right py-2 font-medium">單價</th>
                <th className="text-right py-2 font-medium">面積</th>
                <th className="text-right py-2 font-medium">小計</th>
              </tr>
            </thead>
            <tbody>
              {pricing.line_items.map(item => (
                <tr key={item.code} className="border-b border-zinc-100">
                  <td className="py-2">{item.label}</td>
                  <td className="text-right py-2 text-zinc-600">
                    {item.unit_price ? `${item.unit_price} NTD/㎡` : "—"}
                  </td>
                  <td className="text-right py-2 text-zinc-600">
                    {item.area_m2 ? `${item.area_m2.toLocaleString()} ㎡` : "—"}
                  </td>
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

        {/* Multipliers */}
        <div className="px-6 py-4 bg-zinc-50 border-t border-zinc-200">
          <h4 className="text-sm font-semibold text-zinc-600 mb-3">調整係數</h4>
          <div className="space-y-1 text-sm">
            {Object.entries(pricing.multiplier_breakdown).map(([key, val]) => (
              <div key={key} className="flex justify-between">
                <span className="text-zinc-600">
                  {key === "floor"       ? `高樓加價（${FLOOR_MULTIPLIER_LABEL[String(val)] ?? ""}）` :
                   key === "time_window" ? "施工時段" :
                   key === "risk"        ? "風險係數" :
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
        <div className="px-6 py-5 bg-blue-600 text-white">
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

      {/* Actions */}
      <div className="flex gap-3 justify-center pt-2">
        <button
          onClick={onBack}
          className="px-5 py-2.5 border border-zinc-300 text-zinc-700 rounded-lg hover:bg-zinc-50 transition-colors"
        >
          上一步
        </button>
        <button
          onClick={handleCopy}
          className="px-5 py-2.5 bg-zinc-800 text-white rounded-lg hover:bg-zinc-700 transition-colors"
        >
          複製報價
        </button>
        <button
          onClick={onReset}
          className="px-5 py-2.5 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 transition-colors"
        >
          重新填寫
        </button>
      </div>
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
    `建物：${form.floors}F（${(form.floors * 3.5).toFixed(1)}m）`,
    `空域：${!airspace || airspace.status === "OK" ? "可直接作業" : airspace.status === "NeedPermit" ? "需申請許可" : "禁飛區"}`,
    `施作面積：${area.total_area_m2.toLocaleString()} ㎡（${SOURCE_LABELS[area.source]}）`,
    ``,
    `--- 費用明細 ---`,
    ...pricing.line_items.map(li => `${li.label}  ${li.subtotal.toLocaleString()} NTD`),
    `小計：${pricing.subtotal.toLocaleString()} NTD`,
    `調整倍率：× ${pricing.multiplier.toFixed(2)}`,
    ``,
    `報價總額：NTD ${pricing.total.toLocaleString()}`,
    `預估工期：${time.suggested_days} 天`,
    ``,
    `⚠️ 本報價為快速估算，正式報價需現場勘查確認。`,
  ]
  return lines.join("\n")
}
