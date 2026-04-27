// packages/ingest-types/test/observations.test.ts
import { describe, it, expect } from "vitest"
import { NormalizedObservationSchema } from "../src/observations"

describe("NormalizedObservation schema", () => {
  it("accepts a complete CWA AWS observation", () => {
    const ok = NormalizedObservationSchema.safeParse({
      ts: "2026-04-27T10:00:00+08:00",
      source: "cwa_aws",
      station_id: "466920",
      lat: 25.0381,
      lng: 121.5145,
      wind_kmh: 12.3,
      wind_dir_deg: 180,
      gust_kmh: 18.5,
      temp_c: 22.1,
      rh_pct: 78,
      qc_flags: { bias_corrected: false, outlier: false },
    })
    expect(ok.success).toBe(true)
  })

  it("rejects observation with no station_id", () => {
    const bad = NormalizedObservationSchema.safeParse({
      ts: "2026-04-27T10:00:00+08:00",
      source: "cwa_aws",
      lat: 25.0,
      lng: 121.5,
    })
    expect(bad.success).toBe(false)
  })

  it("accepts a partial reading (wind only, no rain)", () => {
    const ok = NormalizedObservationSchema.safeParse({
      ts: "2026-04-27T10:00:00+08:00",
      source: "epa_aq",
      station_id: "EPA001",
      lat: 25.0,
      lng: 121.5,
      wind_kmh: 8.2,
    })
    expect(ok.success).toBe(true)
  })
})
