import { describe, it, expect } from "vitest"
import { generateQuote } from "../pricing-engine"
import { PRICING_PARAMS_DEFAULT } from "../pricing-params"
import { resolveParams } from "../weather-regime-params"

const baseInput = {
  buildingType: "commercial" as const,   // BuildingType: "commercial" | "luxury" | "house" | "factory" | "solar"
  floors: 5,
  facades: [
    {
      id: "f1",
      label: "N",
      area_m2: 100,
      material: "glass" as const,         // FacadeMaterial
      complexity: "light" as const,       // Complexity: "light" | "medium" | "heavy"
      road_closure: false,
      tight_perimeter: false,
      high_risk_env: false,
      adjacent_trees: false,
      tree_area_m2: 0,
      clean_tree_floors: false,
    },
  ],
  contamination: [] as import("../../types").Contamination[],
  cleaningAgent: "standard" as const,     // CleaningAgent: "soft" | "standard" | "deep"
  timeWindow: "day" as const,             // TimeWindow: "day" | "weekend" | "night"
  waterSupply: "Provided" as const,       // Supply: "Provided" | "SelfSupply"
  powerSupply: "Provided" as const,       // Supply: "Provided" | "SelfSupply"
  rooftopAccess: "Good" as const,         // RooftopAccess: "Good" | "Limited" | "NotAvailable"
  urgent: false,
}

describe("generateQuote options", () => {
  it("produces a stable quote_code when idGenerator is supplied", () => {
    const r = generateQuote(baseInput, {
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
      idGenerator: () => "FIXED",
    })
    expect(r.quote_code).toBe("Q-20300101-FIXED")
    expect(r.valid_until).toBe("2030-01-31")
  })

  it("accepts explicit params + pricingParams and still produces a valid total", () => {
    const fixedParams = resolveParams("v2.0")
    const r = generateQuote(baseInput, {
      params: fixedParams,
      pricingParams: PRICING_PARAMS_DEFAULT,
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
      idGenerator: () => "TEST",
    })
    expect(r.total).toBeGreaterThan(0)
    expect(r.currency).toBe("NTD")
  })

  it("back-compat: generateQuote(input) still works without options", () => {
    const r = generateQuote(baseInput)
    expect(r.total).toBeGreaterThan(0)
    expect(r.quote_code.startsWith("Q-")).toBe(true)
  })
})
