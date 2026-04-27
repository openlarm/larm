import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { runOpenMeteoArchive } from "../src/open-meteo/archive"
import type { NormalizedObservation, IngestDb } from "@openlarm/ingest-types"
import fixture from "./fixtures/open-meteo-archive.json"

describe("runOpenMeteoArchive", () => {
  let inserted: NormalizedObservation[] = []
  let budgetUsed = 0
  let mockDb: IngestDb

  beforeEach(() => {
    inserted = []
    budgetUsed = 0
    mockDb = {
      upsertObservations: vi.fn(async (rows) => {
        inserted.push(...rows)
        return rows.length
      }),
      upsertForecasts: vi.fn(async () => 0),
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

  it("writes per-hour rows tagged source=open_meteo_archive", async () => {
    await runOpenMeteoArchive(
      { db: mockDb, now: () => new Date() },
      { lat: 25.0, lng: 121.5, days: 30 }
    )
    expect(inserted.length).toBe(2)
    expect(inserted[0].source).toBe("open_meteo_archive")
    expect(inserted[0].station_id).toBe("25.0000,121.5000")
  })

  it("refuses to call when budget exhausted", async () => {
    mockDb = {
      upsertObservations: vi.fn(async () => 0),
      upsertForecasts: vi.fn(async () => 0),
      upsertEnsemble: vi.fn(async () => 0),
      upsertLightning: vi.fn(async () => 0),
      insertGridded: vi.fn(async () => 0),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      getBudget: vi.fn(async () => ({ used: 5000, resetAt: new Date(Date.now() + 86400000) })),
      incrementBudget: vi.fn(async () => {}),
    } satisfies Partial<IngestDb> as IngestDb

    await expect(
      runOpenMeteoArchive(
        { db: mockDb, now: () => new Date() },
        { lat: 25.0, lng: 121.5, days: 30 },
        { dailyBudget: 5000 }
      )
    ).rejects.toThrow(/budget/i)
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled()
  })
})
