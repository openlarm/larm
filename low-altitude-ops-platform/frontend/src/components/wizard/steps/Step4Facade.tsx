"use client"
import { useState } from "react"
import { StepShell } from "../StepShell"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { MOCK_FACADES } from "@/lib/mock-data"
import type { Mission, FacadeData, FacadeMaterial, Complexity } from "@/lib/types"

interface Props { mission: Partial<Mission>; update: (p: Partial<Mission>) => void; next: () => void; back: () => void }

export function Step4Facade({ mission, update, next, back }: Props) {
  const numFacades = mission.building?.num_facades ?? 4
  const initFacades = mission.facades ?? MOCK_FACADES.slice(0, numFacades)
  const [facades, setFacades] = useState<FacadeData[]>(initFacades)

  const updateFacade = (idx: number, patch: Partial<FacadeData>) =>
    setFacades(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f))

  const totalArea = facades.reduce((s, f) => s + (f.area_m2 || 0), 0)
  const canNext = facades.every(f => f.area_m2 > 0)

  const handleNext = () => {
    update({ facades })
    next()
  }

  return (
    <StepShell title="Step 4 — Façade Scope" subtitle="立面範圍與面積" onBack={back} onNext={handleNext} nextDisabled={!canNext}>
      <div className="space-y-4">
        {facades.map((facade, idx) => (
          <Card key={facade.id} className="border-zinc-700 bg-zinc-800/30">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-white">立面 {facade.label}</span>
                <span className="text-xs text-zinc-500">面積必填</span>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">面積 (㎡) <span className="text-red-400">*</span></Label>
                  <Input
                    type="number" min={0}
                    value={facade.area_m2 || ""}
                    onChange={e => updateFacade(idx, { area_m2: parseFloat(e.target.value) || 0 })}
                    className="bg-zinc-900 border-zinc-600 text-white h-8 text-sm"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">材質</Label>
                  <Select value={facade.material} onValueChange={v => updateFacade(idx, { material: v as FacadeMaterial })}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-600 text-white h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {(["tile","stone","glass","metal","paint","solar"] as FacadeMaterial[]).map(m => (
                        <SelectItem key={m} value={m} className="text-white text-sm">{m}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">結構複雜度</Label>
                  <Select value={facade.complexity} onValueChange={v => updateFacade(idx, { complexity: v as Complexity })}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-600 text-white h-8 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-800 border-zinc-700">
                      {(["none","light","medium","heavy"] as Complexity[]).map(c => (
                        <SelectItem key={c} value={c} className="text-white text-sm">{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Constraint toggles */}
              <div className="flex flex-wrap gap-2">
                {([
                  ["road_closure", "封路"],
                  ["tight_perimeter", "空間 < 5m"],
                  ["high_risk_env", "高壓電/基地台"],
                ] as [keyof FacadeData, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => updateFacade(idx, { [key]: !facade[key] })}
                    className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                      facade[key]
                        ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        : "bg-zinc-800 border-zinc-700 text-zinc-500 hover:border-zinc-500"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 text-sm">
        <span className="text-zinc-400">合計面積</span>
        <span className="font-semibold text-white text-lg">{totalArea.toLocaleString()} ㎡</span>
      </div>
    </StepShell>
  )
}
