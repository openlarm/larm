import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { runOpenMeteoForecast } from "../src/open-meteo/forecast"
import type { NormalizedForecast, IngestDb } from "@openlarm/ingest-types"
import fixture from "./fixtures/open-meteo-forecast.json"

describe("runOpenMeteoForecast", () => {
  let upserted: NormalizedForecast[] = []
  let budgetUsed = 0
  let mockDb: IngestDb

  beforeEach(() => {
    upserted = []
    budgetUsed = 0
    mockDb = {
      upsertForecasts: vi.fn(async (rows) => {
        upserted.push(...rows)
        return rows.length
      }),
      upsertObservations: vi.fn(async () => 0),
      upsertEnsemble: vi.fn(async () => 0),
      upsertLightning: vi.fn(async () => 0),
      insertGridded: vi.fn(async () => 0),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      getBudget: vi.fn(async () => ({ used: budgetUsed, resetAt: new Date(Date.now() + 86400000) })),
      incrementBudget: vi.fn(async (_s: string, by: number) => { budgetUsed += by }),
    } satisfies Partial<IngestDb> as IngestDb

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })
    ))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("emits one forecast row per hourly time", async () => {
    await runOpenMeteoForecast({ db: mockDb, now: () => new Date() }, { lat: 25.0, lng: 121.5 })
    expect(upserted.length).toBe(2)
    expect(upserted[0].source).toBe("open_meteo_forecast")
    expect(upserted[0].lat).toBe(25.0)
  })

  it("increments budget by 1 per call", async () => {
    await runOpenMeteoForecast({ db: mockDb, now: () => new Date() }, { lat: 25, lng: 121 })
    expect(mockDb.incrementBudget).toHaveBeenCalledWith("open_meteo_forecast", 1)
  })

  it("refuses to call when budget exhausted", async () => {
    budgetUsed = 5000
    // Re-create mockDb so getBudget returns the updated budgetUsed
    mockDb = {
      upsertForecasts: vi.fn(async () => 0),
      upsertObservations: vi.fn(async () => 0),
      upsertEnsemble: vi.fn(async () => 0),
      upsertLightning: vi.fn(async () => 0),
      insertGridded: vi.fn(async () => 0),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      getBudget: vi.fn(async () => ({ used: 5000, resetAt: new Date(Date.now() + 86400000) })),
      incrementBudget: vi.fn(async () => {}),
    } satisfies Partial<IngestDb> as IngestDb

    await expect(runOpenMeteoForecast(
      { db: mockDb, now: () => new Date() },
      { lat: 25, lng: 121 },
      { dailyBudget: 5000 }
    )).rejects.toThrow(/budget/i)
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
  })
})
