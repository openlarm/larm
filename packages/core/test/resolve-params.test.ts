import "./setup-taiwan.ts"

import { describe, it, expect, vi } from "vitest"
import {
  resolveParams,
  type WeatherRegimeParams,
} from "../src/index.ts"
import { TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"

describe("resolveParams (pure)", () => {
  it("returns v2.0 defaults when no override is given", () => {
    expect(resolveParams()).toEqual(TAIWAN_PARAMS_V2_0)
  })

  it("returns v1.0 defaults when explicitly requested", () => {
    const p = resolveParams("v1.0")
    expect(p?.version).toBe("v1.0")
  })

  it("shallow-merges a top-level override over defaults", () => {
    const override: Partial<WeatherRegimeParams> = { r4_nogo_threshold: 88 }
    const p = resolveParams("v2.0", override)
    expect(p?.r4_nogo_threshold).toBe(88)
    // Unrelated fields preserved
    expect(p?.regimes.W0.base_score).toBe(TAIWAN_PARAMS_V2_0.regimes.W0.base_score)
  })

  it("returns undefined for an unknown version key (core has no fallback)", () => {
    const p = resolveParams("v99.0" as string)
    expect(p).toBeUndefined()
  })

  it("does not touch localStorage or window", () => {
    // In the node test environment Storage/localStorage may not exist.
    // Inject a spy on globalThis.localStorage so we can assert it is
    // never called, regardless of the test runner environment.
    const getItemMock = vi.fn()
    const fakeStorage = { getItem: getItemMock } as unknown as Storage
    const originalLocalStorage = Object.getOwnPropertyDescriptor(globalThis, "localStorage")
    Object.defineProperty(globalThis, "localStorage", {
      value: fakeStorage,
      configurable: true,
      writable: true,
    })
    try {
      resolveParams("v2.0")
      resolveParams("v1.0", { r4_nogo_threshold: 90 })
      expect(getItemMock).not.toHaveBeenCalled()
    } finally {
      if (originalLocalStorage) {
        Object.defineProperty(globalThis, "localStorage", originalLocalStorage)
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (globalThis as any).localStorage
      }
    }
  })
})
