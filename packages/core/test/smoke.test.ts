import { describe, it, expect } from "vitest"
import { LARM_CORE_VERSION } from "../src/index.ts"

describe("@openlarm/core smoke test", () => {
  it("exports the version marker", () => {
    expect(LARM_CORE_VERSION).toBe("0.0.0")
  })
})
