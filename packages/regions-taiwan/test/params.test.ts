import { describe, it, expect } from "vitest"
import {
  TAIWAN_PARAMS_V1_0,
  TAIWAN_PARAMS_V2_0,
  TAIWAN_PARAMS_ACTIVE,
} from "../src/index.ts"

describe("@openlarm/regions-taiwan defaults", () => {
  it("v1.0 has version marker", () => {
    expect(TAIWAN_PARAMS_V1_0.version).toBe("v1.0")
  })
  it("v2.0 has version marker", () => {
    expect(TAIWAN_PARAMS_V2_0.version).toBe("v2.0")
  })
  it("v2.0 sets r4_nogo_threshold to 92 (engines-decoupling baseline)", () => {
    expect(TAIWAN_PARAMS_V2_0.r4_nogo_threshold).toBe(92)
  })
  it("v2.0 has the 6 W-regime entries", () => {
    const w = TAIWAN_PARAMS_V2_0.regimes
    expect(Object.keys(w).sort()).toEqual(["W0", "W1", "W2", "W3", "W4", "W5"])
  })
  it("has no pricing field (core is price-agnostic)", () => {
    expect("pricing" in TAIWAN_PARAMS_V2_0).toBe(false)
    expect("quote_max_multiplier" in TAIWAN_PARAMS_V2_0).toBe(false)
  })
  it("TAIWAN_PARAMS_ACTIVE equals TAIWAN_PARAMS_V2_0", () => {
    expect(TAIWAN_PARAMS_ACTIVE).toBe(TAIWAN_PARAMS_V2_0)
  })
})
