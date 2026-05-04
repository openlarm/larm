import { describe, it, expect, vi } from "vitest"
import { queryWeather30d } from "../src/queries/weather30d.js"
import type { DbWithSql } from "../src/queries/weather30d.js"

/** Helper to build a typed DbWithSql mock whose sql tag returns the given rows */
function makeDb(rows: unknown[]): DbWithSql {
  return {
    sql: vi.fn((_strings: TemplateStringsArray, ..._args: unknown[]) =>
      Promise.resolve(rows),
    ),
  }
}

describe("queryWeather30d", () => {
  it("computes mean + p90 wind, rain day counts from observation rows", async () => {
    // 20 days × 24 h of calm wind (10 km/h, no rain) + 10 days × 24 h of strong
    // wind (30 km/h, 5 mm/h rain) — ts values placed on different calendar days.
    // With this split (480 calm / 240 strong, sorted), p90 index = floor(720*0.9) = 648
    // which lands in the strong-wind bucket (>480), so p90=30 > mean≈16.7. ✓
    const calmRows = Array.from({ length: 24 * 20 }, (_, i) => ({
      wind_kmh: 10,
      gust_kmh: 15,
      rain_mm_1h: 0,
      ts: new Date(Date.UTC(2026, 2, 1) + i * 3_600_000).toISOString(),
    }))
    const strongRows = Array.from({ length: 24 * 10 }, (_, i) => ({
      wind_kmh: 30,
      gust_kmh: 50,
      rain_mm_1h: 5,
      ts: new Date(Date.UTC(2026, 3, 1) + i * 3_600_000).toISOString(),
    }))

    const db = makeDb([...calmRows, ...strongRows])
    const result = await queryWeather30d(db, {
      lat: 25,
      lng: 121,
      when: new Date("2026-04-27"),
    })

    expect(result.wind_mean_kmh).toBeGreaterThan(10)
    expect(result.wind_p90_kmh).toBeGreaterThan(result.wind_mean_kmh)
    expect(result.rain_days_30).toBeGreaterThan(0)
  })

  it("returns zero stats when no rows", async () => {
    const db = makeDb([])
    const result = await queryWeather30d(db, {
      lat: 25,
      lng: 121,
      when: new Date(),
    })
    expect(result.wind_mean_kmh).toBe(0)
    expect(result.rain_days_30).toBe(0)
    expect(result.predictability_score).toBe(0.7) // bootstrap default
  })
})
