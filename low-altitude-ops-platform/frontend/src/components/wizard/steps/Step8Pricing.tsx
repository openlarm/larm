"use client"
import { useEffect, useState } from "react"
import { StepShell } from "../StepShell"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import { generateQuote } from "@/lib/engines/pricing-engine"
import type { Mission, PricingResult, Contamination } from "@/lib/types"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

export function Step8Pricing({ mission, update, next, back }: Props) {
  const [result, setResult] = useState<PricingResult | null>(mission.pricing ?? null)
  const [loading, setLoading] = useState(!mission.pricing)

  useEffect(() => {
    if (mission.pricing) return
    setLoading(true)
    setTimeout(() => {
      const r = generateQuote({
        buildingType: mission.building?.building_type ?? "commercial",
        floors: mission.building?.height_floors ?? 10,
        facades: mission.facades ?? [],
        contamination: ["scale"] as Contamination[],
        cleaningAgent: "standard",
        rooftopAccess: mission.building?.rooftop_access ?? "Good",
        timeWindow: "day",
        waterSupply: mission.building?.water_supply ?? "Provided",
        powerSupply: mission.building?.power_supply ?? "Provided",
        urgent: false,
      })
      setResult(r)
      setLoading(false)
    }, 800)
  }, [])

  const handleNext = () => {
    if (!result) return
    update({ pricing: result })
    next()
  }

  const lowMargin = result && result.total < 50000

  return (
    <StepShell title="Step 5 — Pricing" subtitle="報價預覽" onBack={back} onNext={handleNext} nextDisabled={!result || loading}>

      {loading ? (
        <div className="space-y-3">
          <div className="h-40 bg-zinc-800 rounded animate-pulse" />
          <p className="text-xs text-zinc-500">報價引擎計算中…</p>
        </div>
      ) : result && (
        <>
          {/* Quote total */}
          <Card className="border-zinc-600 bg-zinc-800/40">
            <CardContent className="pt-5 space-y-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-zinc-500 mb-1">Quote Code</p>
                  <p className="font-mono text-sm text-zinc-300">{result.quote_code}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500 mb-1">有效期限</p>
                  <p className="text-sm text-zinc-300">{result.valid_until}</p>
                </div>
              </div>

              <div className="border-t border-zinc-700 pt-3 flex items-end justify-between">
                <div className="text-xs text-zinc-500 space-y-1">
                  <p>整案小計：{result.subtotal.toLocaleString()} {result.currency}</p>
                  <p>倍率：×{result.multiplier}（樓層×{result.multiplier_breakdown.floor} · 時段×{result.multiplier_breakdown.time_window}{result.multiplier_breakdown.urgent > 1 ? ` · 急件×${result.multiplier_breakdown.urgent}` : ""}）</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-zinc-500">Total</p>
                  <p className="text-3xl font-bold text-white">{result.total.toLocaleString()}</p>
                  <p className="text-xs text-zinc-400">{result.currency}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line items */}
          <div className="border border-zinc-700 rounded-lg overflow-hidden">
            <div className="px-4 py-2 bg-zinc-800/60 text-xs font-medium text-zinc-400 uppercase tracking-wider">明細</div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-800">
                {result.line_items.map((item) => (
                  <tr key={item.code} className="hover:bg-zinc-800/20">
                    <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">{item.code}</td>
                    <td className="px-4 py-2.5 text-zinc-300">{item.label}</td>
                    {item.unit_price != null && (
                      <td className="px-4 py-2.5 text-right text-zinc-400 text-xs">{item.unit_price} /㎡</td>
                    )}
                    <td className="px-4 py-2.5 text-right font-mono text-zinc-200">{item.subtotal.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Internal margin guardrail */}
          <div className={`flex items-center gap-2 px-3 py-2 rounded text-xs border ${lowMargin ? "border-amber-500/30 bg-amber-500/5 text-amber-400" : "border-emerald-500/30 bg-emerald-500/5 text-emerald-400"}`}>
            {lowMargin ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
            <span>{lowMargin ? "毛利偏低 — 需主管審核（Approval）" : "Margin OK"}</span>
            <span className="ml-auto font-mono text-emerald-400">pricing: {result.pricing_version}</span>
          </div>

          {lowMargin && (
            <Alert className="border-amber-500/30 bg-amber-500/5 text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>報價低於毛利門檻，任務需主管核准後方可繼續。</AlertDescription>
            </Alert>
          )}
        </>
      )}
    </StepShell>
  )
}
