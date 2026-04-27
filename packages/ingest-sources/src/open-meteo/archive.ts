import { z } from "zod"
import type { NormalizedObservation, SourceDeps, SourceResult } from "@openlarm/ingest-types"
import { checkAndConsumeBudget } from "../util/budget"

const FREE_BASE = "https://archive-api.open-meteo.com/v1/archive"
const PAID_BASE = "https://customer-historical-forecast-api.open-meteo.com/v1/forecast"

const RespSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  hourly: z.object({
    time: z.array(z.string()),
    wind_speed_10m: z.array(z.number()),
    wind_gusts_10m: z.array(z.number()),
    precipitation: z.array(z.number()),
  }),
})

export interface OpenMeteoArchiveTarget {
  lat: number
  lng: number
  days: number
}

export interface OpenMeteoArchiveOptions {
  dailyBudget?: number
}

export async function runOpenMeteoArchive(
  deps: SourceDeps,
  target: OpenMeteoArchiveTarget,
  opts: OpenMeteoArchiveOptions = {}
): Promise<SourceResult> {
  const apiKey = process.env.OPEN_METEO_API_KEY
  const dailyBudget = opts.dailyBudget ?? Number(process.env.OPEN_METEO_DAILY_BUDGET ?? 5000)

  await checkAndConsumeBudget(deps.db, "open_meteo_archive", dailyBudget, 1)

  const log = await deps.db.recordFetchStart("open_meteo_archive")
  const t0 = Date.now()

  try {
    const end = new Date(deps.now())
    end.setDate(end.getDate() - 1)
    const start = new Date(end)
    start.setDate(start.getDate() - target.days + 1)

    const url = new URL(apiKey ? PAID_BASE : FREE_BASE)
    if (apiKey) url.searchParams.set("apikey", apiKey)
    url.searchParams.set("latitude", target.lat.toFixed(4))
    url.searchParams.set("longitude", target.lng.toFixed(4))
    url.searchParams.set("start_date", start.toISOString().slice(0, 10))
    url.searchParams.set("end_date", end.toISOString().slice(0, 10))
    url.searchParams.set("hourly", "wind_speed_10m,wind_gusts_10m,precipitation")
    url.searchParams.set("wind_speed_unit", "kmh")
    url.searchParams.set("timezone", "Asia/Taipei")

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Open-Meteo archive HTTP ${res.status}`)
    const parsed = RespSchema.parse(await res.json())

    const stationId = `${parsed.latitude.toFixed(4)},${parsed.longitude.toFixed(4)}`
    const rows: NormalizedObservation[] = parsed.hourly.time.map((t, i) => ({
      ts: new Date(`${t}+08:00`).toISOString(),
      source: "open_meteo_archive",
      station_id: stationId,
      lat: parsed.latitude,
      lng: parsed.longitude,
      wind_kmh: parsed.hourly.wind_speed_10m[i],
      gust_kmh: parsed.hourly.wind_gusts_10m[i],
      rain_mm_1h: parsed.hourly.precipitation[i],
    }))

    const written = await deps.db.upsertObservations(rows)
    await deps.db.recordFetchEnd(log.id, "ok", {
      rows_written: written,
      rows_rejected: 0,
      duration_ms: Date.now() - t0,
    })
    return { rows_written: written, rows_rejected: 0, duration_ms: Date.now() - t0 }
  } catch (err) {
    await deps.db.recordFetchEnd(log.id, "failed", {
      error_message: err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err),
      duration_ms: Date.now() - t0,
    })
    throw err
  }
}
