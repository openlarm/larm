import { describe, it, expect } from "vitest"
import { LARM_CORE_VERSION, type WeatherType, type RiskResult } from "../src/index.ts"

describe("@openlarm/core smoke test", () => {
  it("exports the version marker", () => {
    expect(LARM_CORE_VERSION).toBe("0.1.0-alpha.0")
  })

  it("exports core types (compile-time only)", () => {
    // Minimal type-exercise: creating a value of a core union type shouldn't fail compilation.
    const w: WeatherType = "W0"
    expect(w).toBe("W0")
    // RiskResult is a complex interface; just confirm it's a type by assigning a cast.
    const _r: RiskResult | null = null
    expect(_r).toBeNull()
  })
})
