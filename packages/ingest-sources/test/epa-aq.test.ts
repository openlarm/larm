import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { runEpaAq } from "../src/epa/aq"
import type { NormalizedObservation, IngestDb } from "@openlarm/ingest-types"
import fixture from "./fixtures/epa-aq-response.json"

describe("runEpaAq", () => {
  let mockDb: IngestDb
  let upsertedRows: NormalizedObservation[] = []

  beforeEach(() => {
    upsertedRows = []
    mockDb = {
      upsertObservations: vi.fn(async (rows) => {
        upsertedRows.push(...rows)
        return rows.length
      }),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      getBudget: vi.fn(async () => ({ used: 0, resetAt: new Date() })),
      incrementBudget: vi.fn(async () => {}),
      upsertForecasts: vi.fn(async () => 0),
      upsertEnsemble: vi.fn(async () => 0),
      upsertLightning: vi.fn(async () => 0),
      insertGridded: vi.fn(async () => 0),
    } satisfies Partial<IngestDb> as IngestDb

    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })
    ))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("converts wind_speed string to number km/h", async () => {
    await runEpaAq({ db: mockDb, now: () => new Date() })
    const ok = upsertedRows.find((r) => r.station_id === "57")
    expect(ok).toBeDefined()
    expect(ok!.wind_kmh).toBeCloseTo(1.2 * 3.6, 2)
    expect(ok!.source).toBe("epa_aq")
  })

  it("skips records with empty wind", async () => {
    await runEpaAq({ db: mockDb, now: () => new Date() })
    expect(upsertedRows.find((r) => r.station_id === "BAD")).toBeUndefined()
  })

  it("rejects malformed record without killing batch", async () => {
    const withMalformed = {
      records: [
        { /* missing siteid — schema will reject */ },
        ...fixture.records,
      ],
    }
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify(withMalformed), { status: 200 })
    ))
    const result = await runEpaAq({ db: mockDb, now: () => new Date() })
    // malformed record must be counted as rejected
    expect(result.rows_rejected).toBeGreaterThan(0)
    // valid siteid "57" must still be processed
    expect(upsertedRows.find((r) => r.station_id === "57")).toBeDefined()
  })
})
