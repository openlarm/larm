// packages/ingest-sources/test/cwa-aws.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runCwaAws } from "../src/cwa/aws"
import type { IngestDb } from "@openlarm/ingest-types"
import fixture from "./fixtures/cwa-aws-response.json"

describe("runCwaAws", () => {
  let mockDb: IngestDb
  let upsertedRows: any[] = []

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
      upsertForecasts: vi.fn(),
      upsertEnsemble: vi.fn(),
      upsertLightning: vi.fn(),
    } as any

    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })
    ) as any
  })

  it("normalizes wind speed from m/s to km/h", async () => {
    await runCwaAws({ db: mockDb, now: () => new Date("2026-04-27T10:00:00+08:00") })
    const taipei = upsertedRows.find((r) => r.station_id === "466920")
    expect(taipei.wind_kmh).toBeCloseTo(7.2 * 3.6, 1) // 7.2 m/s in fixture
  })

  it("rejects readings with wind > 200 km/h", async () => {
    const result = await runCwaAws({ db: mockDb, now: () => new Date() })
    // fixture includes one bad station with 100 m/s wind → 360 km/h, must reject
    expect(result.rows_rejected).toBeGreaterThan(0)
    expect(upsertedRows.find((r) => r.station_id === "BADSTN")).toBeUndefined()
  })

  it("converts CWA -99 sentinel to null", async () => {
    await runCwaAws({ db: mockDb, now: () => new Date() })
    const stnNoGust = upsertedRows.find((r) => r.station_id === "NOGUST")
    expect(stnNoGust.gust_kmh).toBeNull()
  })

  it("logs fetch start + end", async () => {
    await runCwaAws({ db: mockDb, now: () => new Date() })
    expect(mockDb.recordFetchStart).toHaveBeenCalledWith("cwa_aws")
    expect(mockDb.recordFetchEnd).toHaveBeenCalledWith(1, "ok", expect.objectContaining({ rows_written: expect.any(Number) }))
  })
})
