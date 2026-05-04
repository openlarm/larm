import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { runCwaRainfall } from "../src/cwa/rainfall"
import type { NormalizedObservation, IngestDb } from "@openlarm/ingest-types"
import fixture from "./fixtures/cwa-rainfall-response.json"

describe("runCwaRainfall", () => {
  let mockDb: IngestDb
  let upsertedRows: NormalizedObservation[] = []

  beforeEach(() => {
    vi.stubEnv("CWA_API_KEY", "test-key")
    upsertedRows = []
    mockDb = {
      upsertObservations: vi.fn(async (r) => { upsertedRows.push(...r); return r.length }),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      getBudget: vi.fn(async () => ({ used: 0, resetAt: new Date() })),
      incrementBudget: vi.fn(async () => {}),
      upsertForecasts: vi.fn(),
      upsertEnsemble: vi.fn(),
      upsertLightning: vi.fn(),
    } satisfies Partial<IngestDb> as IngestDb

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })
    ))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("emits rain_mm_1h and rain_mm_24h fields", async () => {
    await runCwaRainfall({ db: mockDb, now: () => new Date() })
    const stn = upsertedRows.find((r) => r.station_id === "C0A640")
    expect(stn).toBeDefined()
    expect(stn!.rain_mm_1h).toBe(2.3)
    expect(stn!.rain_mm_24h).toBe(18.7)
    expect(stn!.source).toBe("cwa_rainfall")
  })

  it("does not include wind fields", async () => {
    await runCwaRainfall({ db: mockDb, now: () => new Date() })
    const stn = upsertedRows.find((r) => r.station_id === "C0A640")
    expect(stn).toBeDefined()
    expect(stn!.wind_kmh).toBeUndefined()
  })

  it("rejects malformed station without killing batch", async () => {
    const malformed = {
      records: {
        Station: [
          { /* no StationId — schema will reject */ },
          ...fixture.records.Station,
        ],
      },
    }
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify(malformed), { status: 200 })
    ))
    const result = await runCwaRainfall({ db: mockDb, now: () => new Date() })
    expect(result.rows_rejected).toBeGreaterThan(0)
    // Valid stations from fixture must still be processed
    expect(upsertedRows.find((r) => r.station_id === "C0A640")).toBeDefined()
  })
})
