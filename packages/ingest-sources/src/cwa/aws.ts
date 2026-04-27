import { z } from "zod"
import type { NormalizedObservation, SourceDeps, SourceResult } from "@openlarm/ingest-types"
import { cleanCwaValue, isPlausibleWind, isPlausibleTemp } from "../util/qc"

const CWA_AWS_URL =
  "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001"

const CwaStationSchema = z.object({
  StationId: z.string(),
  StationName: z.string(),
  ObsTime: z.object({ DateTime: z.string() }),
  GeoInfo: z.object({
    Coordinates: z.array(z.object({
      StationLatitude: z.number(),
      StationLongitude: z.number(),
    })).min(1),
  }),
  WeatherElement: z.object({
    WindSpeed: z.number().optional(),       // m/s
    WindDirection: z.number().optional(),
    GustInfo: z.object({ PeakGustSpeed: z.number() }).optional(),
    AirTemperature: z.number().optional(),
    RelativeHumidity: z.number().optional(),
    AirPressure: z.number().optional(),
    Now: z.object({ Precipitation: z.number() }).optional(),
  }),
})

const CwaResponseSchema = z.object({
  records: z.object({ Station: z.array(CwaStationSchema) }),
})

const MS_TO_KMH = 3.6

export async function runCwaAws(deps: SourceDeps): Promise<SourceResult> {
  const apiKey = process.env.CWA_API_KEY
  if (!apiKey) throw new Error("CWA_API_KEY required")

  const fetchLog = await deps.db.recordFetchStart("cwa_aws")
  const start = Date.now()

  try {
    const url = new URL(CWA_AWS_URL)
    url.searchParams.set("Authorization", apiKey)
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`CWA AWS HTTP ${res.status}`)
    const json = await res.json()
    const parsed = CwaResponseSchema.parse(json)

    const accepted: NormalizedObservation[] = []
    let rejected = 0

    for (const stn of parsed.records.Station) {
      const we = stn.WeatherElement
      const coord = stn.GeoInfo.Coordinates[0]
      const wind_kmh = cleanCwaValue(we.WindSpeed ?? null) !== null
        ? (we.WindSpeed as number) * MS_TO_KMH
        : null
      const gust_kmh = we.GustInfo?.PeakGustSpeed != null && cleanCwaValue(we.GustInfo.PeakGustSpeed) !== null
        ? we.GustInfo.PeakGustSpeed * MS_TO_KMH
        : null
      const temp_c = cleanCwaValue(we.AirTemperature ?? null)

      if (!isPlausibleWind(wind_kmh) || !isPlausibleTemp(temp_c)) {
        rejected++
        continue
      }

      accepted.push({
        ts: stn.ObsTime.DateTime,
        source: "cwa_aws",
        station_id: stn.StationId,
        lat: coord.StationLatitude,
        lng: coord.StationLongitude,
        wind_kmh,
        wind_dir_deg: cleanCwaValue(we.WindDirection ?? null),
        gust_kmh,
        temp_c,
        rh_pct: cleanCwaValue(we.RelativeHumidity ?? null),
        pressure_hpa: cleanCwaValue(we.AirPressure ?? null),
        rain_mm_10min: we.Now?.Precipitation ?? null,
        qc_flags: { bias_corrected: false, outlier: false },
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
      error_message: String(err),
      duration_ms: Date.now() - start,
    })
    throw err
  }
}
