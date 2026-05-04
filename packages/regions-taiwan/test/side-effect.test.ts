import { describe, it, expect, beforeEach } from "vitest"
import { PARAM_REGISTRY } from "@openlarm/core"

describe("@openlarm/regions-taiwan side effect", () => {
  beforeEach(() => {
    for (const key of Object.keys(PARAM_REGISTRY)) delete PARAM_REGISTRY[key]
  })

  it("importing @openlarm/regions-taiwan registers v1.0 and v2.0 in core's PARAM_REGISTRY", async () => {
    expect(PARAM_REGISTRY["v1.0"]).toBeUndefined()
    expect(PARAM_REGISTRY["v2.0"]).toBeUndefined()
    await import("../src/index.ts")
    expect(PARAM_REGISTRY["v1.0"]?.version).toBe("v1.0")
    expect(PARAM_REGISTRY["v2.0"]?.version).toBe("v2.0")
  })
})
