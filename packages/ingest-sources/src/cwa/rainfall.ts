import { z } from "zod"
import type { NormalizedObservation, SourceDeps, SourceResult } from "@openlarm/ingest-types"
import { cleanCwaValue } from "../util/qc"

const CWA_RAINFALL_URL =
  "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001"

const EnvelopeSchema = z.object({
  records: z.object({ Station: z.array(z.unknown()) }),
})

const StationSchema = z.object({
  StationId: z.string(),
  ObsTime: z.object({ DateTime: z.string() }),
  GeoInfo: z.object({
    Coordinates: z.array(z.object({
      StationLatitude: z.number(),
      StationLongitude: z.number(),
    })).min(1),
  }),
  RainfallElement: z.object({
    Now: z.object({ Precipitation: z.number() }).optional(),
    Past1hr: z.object({ Precipitation: z.number() }).optional(),
    Past24hr: z.object({ Precipitation: z.number() }).optional(),
  }),
})

export async function runCwaRainfall(deps: SourceDeps): Promise<SourceResult> {
  const apiKey = process.env.CWA_API_KEY
  if (!apiKey) throw new Error("CWA_API_KEY required")

  const fetchLog = await deps.db.recordFetchStart("cwa_rainfall")
  const start = Date.now()

  try {
    const url = new URL(CWA_RAINFALL_URL)
    url.searchParams.set("Authorization", apiKey)
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`CWA rainfall HTTP ${res.status}`)
    const json = await res.json()
    const parsed = EnvelopeSchema.parse(json)

    const accepted: NormalizedObservation[] = []
    let rejected = 0

    for (const raw of parsed.records.Station) {
      const result = StationSchema.safeParse(raw)
      if (!result.success) {
        rejected++
        continue
      }
      const stn = result.data
      const coord = stn.GeoInfo.Coordinates[0]
      const rf = stn.RainfallElement

      accepted.push({
        ts: stn.ObsTime.DateTime,
        source: "cwa_rainfall",
        station_id: stn.StationId,
        lat: coord.StationLatitude,
        lng: coord.StationLongitude,
        rain_mm_10min: cleanCwaValue(rf.Now?.Precipitation ?? null),
        rain_mm_1h: cleanCwaValue(rf.Past1hr?.Precipitation ?? null),
        rain_mm_24h: cleanCwaValue(rf.Past24hr?.Precipitation ?? null),
      })
    }

    const written = await deps.db.upsertObservations(accepted)
    await deps.db.recordFetchEnd(fetchLog.id, "ok", {
      rows_written: written,
      rows_rejected: rejected,
      duration_ms: Date.now() - start,
    })
    return { rows_written: written, rows_rejected: rejected, duration_ms: Date.now() - start }
  } catch (err) {
    await deps.db.recordFetchEnd(fetchLog.id, "failed", {
      error_message: err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err),
      duration_ms: Date.now() - start,
    })
    throw err
  }
}
