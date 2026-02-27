"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { VersionBar } from "@/components/layout/VersionBar"
import { WizardStepper } from "@/components/wizard/WizardStepper"
import { Step1Address } from "@/components/wizard/steps/Step1Address"
import { Step2Airspace } from "@/components/wizard/steps/Step2Airspace"
import { Step3Building } from "@/components/wizard/steps/Step3Building"
import { Step4Facade } from "@/components/wizard/steps/Step4Facade"
import { Step5Weather } from "@/components/wizard/steps/Step5Weather"
import { Step6Risk } from "@/components/wizard/steps/Step6Risk"
import { Step7Time } from "@/components/wizard/steps/Step7Time"
import { Step8Pricing } from "@/components/wizard/steps/Step8Pricing"
import { Step9Assign } from "@/components/wizard/steps/Step9Assign"
import { Step10Plan } from "@/components/wizard/steps/Step10Plan"
import type { Mission } from "@/lib/types"
import type { QuoteFacadeInput } from "@/app/(quote)/quote/components/quote-defaults"
import { saveMission } from "@/lib/stores/mission-store"

const STEPS = [
  "Address", "Airspace", "Building", "Façade",
  "Weather", "Risk", "Time", "Pricing", "Assign", "Plan",
]

export default function NewMissionPage() {
  const router = useRouter()
  const [step, setStep] = useState(0)
  const [mission, setMission] = useState<Partial<Mission>>({})
  // Shared state for polygon-based area estimation (Step 3 → Step 4)
  const [facadeInputs, setFacadeInputs] = useState<QuoteFacadeInput[]>([])
  const [buildingPolygon, setBuildingPolygon] = useState<[number, number][] | null>(null)
  const [perimeterM, setPerimeterM] = useState<number | null>(null)

  const update = (patch: Partial<Mission>) =>
    setMission(prev => ({ ...prev, ...patch }))

  const next = () => setStep(s => Math.min(s + 1, STEPS.length - 1))
  const back = () => setStep(s => Math.max(s - 1, 0))

  const stepProps = { mission, update, next, back }

  return (
    <div className="flex flex-col min-h-screen">
      {/* Top bar — offset by mobile header height on small screens */}
      <div className="sticky top-14 lg:top-0 z-30 flex items-center justify-between px-4 sm:px-8 py-2 sm:py-3 bg-zinc-900/90 backdrop-blur border-b border-zinc-800">
        <div>
          <span className="text-sm font-semibold text-white">New Mission Wizard</span>
          <span className="text-xs text-zinc-500 ml-2">新任務精靈</span>
        </div>
        <VersionBar />
      </div>

      {/* Stepper */}
      <div className="px-4 sm:px-8 pt-4 sm:pt-6">
        <WizardStepper steps={STEPS} current={step} />
      </div>

      {/* Step content */}
      <div className="flex-1 px-4 sm:px-8 py-4 sm:py-6">
        {step === 0 && <Step1Address {...stepProps} />}
        {step === 1 && <Step2Airspace {...stepProps} />}
        {step === 2 && (
          <Step3Building
            {...stepProps}
            polygon={buildingPolygon}
            onPolygonDraw={(verts, _area, perim) => {
              setBuildingPolygon(verts)
              setPerimeterM(perim)
            }}
          />
        )}
        {step === 3 && (
          <Step4Facade
            {...stepProps}
            facadeInputs={facadeInputs}
            setFacadeInputs={setFacadeInputs}
            perimeterM={perimeterM}
          />
        )}
        {step === 4 && <Step5Weather {...stepProps} />}
        {step === 5 && <Step6Risk {...stepProps} />}
        {step === 6 && <Step7Time {...stepProps} />}
        {step === 7 && <Step8Pricing {...stepProps} />}
        {step === 8 && <Step9Assign {...stepProps} />}
        {step === 9 && <Step10Plan {...stepProps} onFinish={() => {
          saveMission(mission)
          router.push("/missions")
        }} />}
      </div>
    </div>
  )
}
