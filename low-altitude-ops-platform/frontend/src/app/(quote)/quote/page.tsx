"use client"

import { useState, useCallback } from "react"
import type { AirspaceResult, PricingResult, TimeResult } from "@/lib/types"
import type { QuoteFormData, AreaEstimate, BuildingDimensions } from "./components/quote-defaults"
import { buildDefaultFacadeInputs } from "./components/quote-defaults"
import { QuoteStep1 } from "./components/QuoteStep1"
import { QuoteStep2 } from "./components/QuoteStep2"
import { QuoteStep3 } from "./components/QuoteStep3"

const STEPS = ["基本資訊", "建物概況", "報價結果"] as const

const INITIAL_FORM: Partial<QuoteFormData> = {
  serviceType: "cleaning",
  buildingType: "commercial",
  floors: 10,
  numBuildings: 1,
  numFacades: 4,
  timeSlot: "day",
  cleaningAgent: "water",
  rooftopAccess: "Good",
  urgent: false,
  facadeInputs: buildDefaultFacadeInputs(4, 1),
}

export default function QuotePage() {
  const [step, setStep] = useState(0)
  const [formData, setFormData] = useState<Partial<QuoteFormData>>(INITIAL_FORM)
  const [airspace, setAirspace] = useState<AirspaceResult | null>(null)
  const [buildingPerimeter, setBuildingPerimeter] = useState<number | null>(null)
  const [buildingPolygon, setBuildingPolygon] = useState<{ lat: number; lon: number }[] | null>(null)
  const [buildingDimensions, setBuildingDimensions] = useState<BuildingDimensions | null>(null)
  const [buildingName, setBuildingName] = useState<string | null>(null)
  const [areaEstimate, setAreaEstimate] = useState<AreaEstimate | null>(null)
  const [pricing, setPricing] = useState<PricingResult | null>(null)
  const [timeResult, setTimeResult] = useState<TimeResult | null>(null)

  const updateForm = useCallback((patch: Partial<QuoteFormData>) => {
    setFormData(prev => ({ ...prev, ...patch }))
  }, [])

  const goNext = () => { setStep(s => Math.min(s + 1, 2)); window.scrollTo({ top: 0, behavior: "smooth" }) }
  const goBack = () => { setStep(s => Math.max(s - 1, 0)); window.scrollTo({ top: 0, behavior: "smooth" }) }
  const reset = () => {
    setStep(0)
    window.scrollTo({ top: 0, behavior: "smooth" })
    setFormData(INITIAL_FORM)
    setAirspace(null)
    setBuildingPerimeter(null)
    setBuildingPolygon(null)
    setBuildingDimensions(null)
    setBuildingName(null)
    setAreaEstimate(null)
    setPricing(null)
    setTimeResult(null)
  }

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-6 sm:mb-8">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-1.5 sm:gap-2">
            <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              i < step ? "bg-blue-600 text-white" :
              i === step ? "bg-blue-600 text-white ring-2 ring-blue-300" :
              "bg-zinc-200 text-zinc-500"
            }`}>
              {i < step ? "✓" : i + 1}
            </div>
            <span className={`text-xs sm:text-sm hidden sm:inline ${i === step ? "text-zinc-900 font-medium" : "text-zinc-400"}`}>
              {label}
            </span>
            {/* Show active label below on mobile */}
            {i === step && (
              <span className="text-xs text-zinc-900 font-medium sm:hidden">{label}</span>
            )}
            {i < STEPS.length - 1 && <div className="w-6 sm:w-12 h-px bg-zinc-300 shrink-0" />}
          </div>
        ))}
      </div>

      {step === 0 && (
        <QuoteStep1
          formData={formData}
          updateForm={updateForm}
          airspace={airspace}
          setAirspace={setAirspace}
          setBuildingPerimeter={setBuildingPerimeter}
          setBuildingPolygon={setBuildingPolygon}
          setBuildingDimensions={setBuildingDimensions}
          setBuildingName={setBuildingName}
          buildingName={buildingName}
          onNext={goNext}
        />
      )}
      {step === 1 && (
        <QuoteStep2
          formData={formData}
          updateForm={updateForm}
          buildingPerimeter={buildingPerimeter}
          buildingPolygon={buildingPolygon}
          buildingDimensions={buildingDimensions}
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
          buildingName={buildingName}
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
