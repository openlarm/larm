"use client"
import { useEffect } from "react"
import { StepShell } from "../StepShell"
import { QuoteFacadeEditor } from "@/app/(quote)/quote/components/QuoteFacadeEditor"
import {
  buildDefaultFacadeInputs,
  buildFacadesFromInputs,
  estimateFromPerimeter,
  estimateFromDefaults,
  type QuoteFacadeInput,
} from "@/app/(quote)/quote/components/quote-defaults"
import type { Mission } from "@/lib/types"

interface Props {
  mission: Partial<Mission>
  update: (p: Partial<Mission>) => void
  next: () => void
  back: () => void
  facadeInputs: QuoteFacadeInput[]
  setFacadeInputs: (inputs: QuoteFacadeInput[]) => void
  perimeterM: number | null
}

export function Step4Facade({ mission, update, next, back, facadeInputs, setFacadeInputs, perimeterM }: Props) {
  const building = mission.building
  const numFacades = building?.num_facades ?? 4
  const numBuildings = building?.num_buildings ?? 1
  const buildingType = building?.building_type ?? "commercial"

  // Initialize facade inputs when empty (or when num_facades changes)
  useEffect(() => {
    if (facadeInputs.length !== numFacades * numBuildings) {
      setFacadeInputs(buildDefaultFacadeInputs(numFacades, numBuildings))
    }
  }, [numFacades, numBuildings]) // eslint-disable-line react-hooks/exhaustive-deps

  const canNext = facadeInputs.length > 0

  const handleNext = () => {
    const floors = building?.height_floors ?? 10
    const estimate = perimeterM
      ? estimateFromPerimeter(perimeterM, floors, numFacades, "manual-draw")
      : estimateFromDefaults(buildingType, floors, numFacades)
    const facades = buildFacadesFromInputs(facadeInputs, estimate, buildingType)
    update({ facades })
    next()
  }

  return (
    <StepShell title="Step 4 — Façade Details" subtitle="立面詳細資料" onBack={back} onNext={handleNext} nextDisabled={!canNext} wide>
      <QuoteFacadeEditor
        facades={facadeInputs}
        numBuildings={numBuildings}
        dark={true}
        onChange={setFacadeInputs}
      />
    </StepShell>
  )
}
