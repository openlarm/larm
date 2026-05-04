import { describe, it, expect, vi } from "vitest"
import { queryWeatherToday } from "../src/queries/weather-today.js"
import type { DbWithSql } from "../src/queries/weather30d.js"

interface ObsRow {
  source: string
  wind_kmh: number
  gust_kmh?: number | null
  ts: Date | string
  distance_m?: number
}

interface FcRow {
  source: string
  wind_kmh: number
  gust_kmh?: number | null
  rain_prob_pct?: number | null
  rain_mmph?: number | null
  weather_code?: string | null
  valid_at?: Date | string
}

function isObsRow(v: unknown): v is ObsRow {
  return typeof v === "object" && v !== null && "source" in v && "wind_kmh" in v && "ts" in v
}

function isFcRow(v: unknown): v is FcRow {
  return typeof v === "object" && v !== null && "source" in v && "wind_kmh" in v && "valid_at" in v
}

describe("queryWeatherToday — fusion + freshness", () => {
  it("prefers cwa_aws over open_meteo when both present and fresh", async () => {
    const fresh = new Date()
    const obsData: ObsRow[] = [
      { source: "cwa_aws", wind_kmh: 12, gust_kmh: 16, ts: fresh, distance_m: 1000 },
    ]
    const fcData: FcRow[] = [
      { source: "open_meteo_forecast", wind_kmh: 14, rain_prob_pct: 20, rain_mmph: 0, weather_code: "1", valid_at: fresh },
    ]

    const fakeDb: DbWithSql = {
      sql: vi.fn((_strings: TemplateStringsArray, ..._args: unknown[]) => {
        const q = _strings.join(" ")
        if (q.includes("observations_point")) {
          return Promise.resolve(obsData)
        }
        if (q.includes("forecast_point")) {
          return Promise.resolve(fcData)
        }
        if (q.includes("forecast_ensemble")) {
          return Promise.resolve([])
        }
        return Promise.resolve([])
      }),
    }

    const result = await queryWeatherToday(fakeDb, { lat: 25, lng: 121, when: fresh })
    expect(result.input.wind_now_kmh).toBe(12) // CWA AWS wins over Open-Meteo
    expect(result.freshness).toBe("fresh")
  })

  it("falls back to open_meteo when no station within 5km", async () => {
    const now = new Date()
    const fcData: FcRow[] = [
      { source: "open_meteo_forecast", wind_kmh: 14, rain_prob_pct: 20, rain_mmph: 0, weather_code: "1", valid_at: now },
    ]

    const fakeDb: DbWithSql = {
      sql: vi.fn((_strings: TemplateStringsArray, ..._args: unknown[]) => {
        const q = _strings.join(" ")
        if (q.includes("observations_point")) return Promise.resolve([])
        if (q.includes("forecast_point")) {
          return Promise.resolve(fcData)
        }
        return Promise.resolve([])
      }),
    }

    const result = await queryWeatherToday(fakeDb, { lat: 25, lng: 121, when: now })
    expect(result.input.wind_now_kmh).toBe(14)
  })

  it("throws DataUnavailableError when all observations >6h old", async () => {
    const old = new Date(Date.now() - 7 * 3600_000)
    const obsData: ObsRow[] = [
      { source: "cwa_aws", wind_kmh: 12, ts: old, distance_m: 1000 },
    ]

    const fakeDb: DbWithSql = {
      sql: vi.fn((_strings: TemplateStringsArray, ..._args: unknown[]) => {
        const q = _strings.join(" ")
        if (q.includes("observations_point")) return Promise.resolve(obsData)
        return Promise.resolve([])
      }),
    }

    await expect(queryWeatherToday(fakeDb, { lat: 25, lng: 121, when: new Date() }))
      .rejects.toThrow(/unavailable|6h/i)
  })
})
