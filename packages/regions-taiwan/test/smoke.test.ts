import { describe, it, expect } from "vitest"
import { REGIONS_TAIWAN_VERSION } from "../src/index.ts"

describe("@openlarm/regions-taiwan smoke test", () => {
  it("exports the version marker", () => {
    expect(REGIONS_TAIWAN_VERSION).toBe("0.1.0-alpha.0")
  })
})
