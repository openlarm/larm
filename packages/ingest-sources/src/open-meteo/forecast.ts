import { z } from "zod"
import type { NormalizedForecast, SourceDeps, SourceResult } from "@openlarm/ingest-types"
import { checkAndConsumeBudget } from "../util/budget"

const FREE_BASE = "https://api.open-meteo.com/v1/forecast"
const PAID_BASE = "https://customer-api.open-meteo.com/v1/forecast"

const RespSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  hourly: z.object({
    time: z.array(z.string()),
    wind_speed_10m: z.array(z.number()),
    wind_direction_10m: z.array(z.number()),
    wind_gusts_10m: z.array(z.number()),
    precipitation: z.array(z.number()),
    precipitation_probability: z.array(z.number()),
    weather_code: z.array(z.number()),
  }),
})

export interface OpenMeteoForecastTarget {
  lat: number
  lng: number
}

export interface OpenMeteoForecastOptions {
  dailyBudget?: number
}

export async function runOpenMeteoForecast(
  deps: SourceDeps,
  target: OpenMeteoForecastTarget,
  opts: OpenMeteoForecastOptions = {}
): Promise<SourceResult> {
  const apiKey = process.env.OPEN_METEO_API_KEY
  const dailyBudget = opts.dailyBudget ?? Number(process.env.OPEN_METEO_DAILY_BUDGET ?? 5000)

  await checkAndConsumeBudget(deps.db, "open_meteo_forecast", dailyBudget, 1)

  const t0 = Date.now()

  const url = new URL(apiKey ? PAID_BASE : FREE_BASE)
  if (apiKey) url.searchParams.set("apikey", apiKey)
  url.searchParams.set("latitude", target.lat.toFixed(4))
  url.searchParams.set("longitude", target.lng.toFixed(4))
  url.searchParams.set(
    "hourly",
    "wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,weather_code"
  )
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone", "Asia/Taipei")
  url.searchParams.set("forecast_days", "14")

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
  const parsed = RespSchema.parse(await res.json())

  const issuedAt = deps.now().toISOString()
  const rows: NormalizedForecast[] = parsed.hourly.time.map((t, i) => ({
    issued_at: issuedAt,
    valid_at: new Date(`${t}+08:00`).toISOString(),
    source: "open_meteo_forecast",
    lat: parsed.latitude,
    lng: parsed.longitude,
    wind_kmh: parsed.hourly.wind_speed_10m[i],
    wind_dir_deg: parsed.hourly.wind_direction_10m[i],
    gust_kmh: parsed.hourly.wind_gusts_10m[i],
    rain_prob_pct: parsed.hourly.precipitation_probability[i],
    rain_mmph: parsed.hourly.precipitation[i],
    weather_code: String(parsed.hourly.weather_code[i]),
  }))

  const written = await deps.db.upsertForecasts(rows)
  return { rows_written: written, rows_rejected: 0, duration_ms: Date.now() - t0 }
}
