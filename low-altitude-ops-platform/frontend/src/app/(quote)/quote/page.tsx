"use client"

import { useState, useCallback } from "react"
import type { AirspaceResult, PricingResult, TimeResult } from "@/lib/types"
import type { QuoteFormData, AreaEstimate } from "./components/quote-defaults"
import { QuoteStep1 } from "./components/QuoteStep1"
import { QuoteStep2 } from "./components/QuoteStep2"
import { QuoteStep3 } from "./components/QuoteStep3"

const STEPS = ["基本資訊", "建物概況", "報價結果"] as const

export default function QuotePage() {
  const [step, setStep] = useState(0)

  // Shared state across steps
  const [formData, setFormData] = useState<Partial<QuoteFormData>>({
    serviceType: "cleaning",
    buildingType: "commercial",
    floors: 10,
    numFacades: 4,
    dirtLevel: "light",
    timeSlot: "day",
    urgent: false,
  })
  const [airspace, setAirspace] = useState<AirspaceResult | null>(null)
  const [buildingPerimeter, setBuildingPerimeter] = useState<number | null>(null)
  const [buildingPolygon, setBuildingPolygon] = useState<{ lat: number; lon: number }[] | null>(null)
  const [areaEstimate, setAreaEstimate] = useState<AreaEstimate | null>(null)
  const [pricing, setPricing] = useState<PricingResult | null>(null)
  const [timeResult, setTimeResult] = useState<TimeResult | null>(null)

  const updateForm = useCallback((patch: Partial<QuoteFormData>) => {
    setFormData(prev => ({ ...prev, ...patch }))
  }, [])

  const goNext = () => setStep(s => Math.min(s + 1, 2))
  const goBack = () => setStep(s => Math.max(s - 1, 0))
  const reset = () => {
    setStep(0)
    setFormData({
      serviceType: "cleaning",
      buildingType: "commercial",
      floors: 10,
      numFacades: 4,
      dirtLevel: "light",
      timeSlot: "day",
      urgent: false,
    })
    setAirspace(null)
    setBuildingPerimeter(null)
    setBuildingPolygon(null)
    setAreaEstimate(null)
    setPricing(null)
    setTimeResult(null)
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                i < step
                  ? "bg-blue-600 text-white"
                  : i === step
                    ? "bg-blue-600 text-white ring-2 ring-blue-300"
                    : "bg-zinc-200 text-zinc-500"
              }`}
            >
              {i < step ? "✓" : i + 1}
            </div>
            <span className={`text-sm ${i === step ? "text-zinc-900 font-medium" : "text-zinc-400"}`}>
              {label}
            </span>
            {i < STEPS.length - 1 && <div className="w-12 h-px bg-zinc-300" />}
          </div>
        ))}
      </div>

      {/* Step content */}
      {step === 0 && (
        <QuoteStep1
          formData={formData}
          updateForm={updateForm}
          airspace={airspace}
          setAirspace={setAirspace}
          setBuildingPerimeter={setBuildingPerimeter}
          setBuildingPolygon={setBuildingPolygon}
          onNext={goNext}
        />
      )}
      {step === 1 && (
        <QuoteStep2
          formData={formData}
          updateForm={updateForm}
          buildingPerimeter={buildingPerimeter}
          buildingPolygon={buildingPolygon}
          areaEstimate={areaEstimate}
          setAreaEstimate={setAreaEstimate}
          onNext={goNext}
          onBack={goBack}
        />
      )}
      {step === 2 && (
        <QuoteStep3
          formData={formData as QuoteFormData}
          airspace={airspace}
          areaEstimate={areaEstimate!}
          pricing={pricing}
          setPricing={setPricing}
          timeResult={timeResult}
          setTimeResult={setTimeResult}
          onBack={goBack}
          onReset={reset}
        />
      )}
    </div>
  )
}
