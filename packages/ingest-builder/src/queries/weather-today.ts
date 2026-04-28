import type { WeatherTodayInput } from "@openlarm/core"
import { classifyFreshness, DataUnavailableError, type Freshness } from "../freshness.js"
import type { DbWithSql } from "./weather30d.js"

const SOURCE_PRIORITY = ["cwa_aws", "epa_aq"] as const

export interface WeatherTodayQueryInput {
  lat: number
  lng: number
  when: Date
}

export interface WeatherTodayResult {
  input: WeatherTodayInput
  freshness: Freshness
  source_breakdown: Record<string, string>
}

// ─── Row type guards ─────────────────────────────────────────────────────────

interface ObservationRow {
  source: string
  wind_kmh: number | null
  wind_dir_deg?: number | null
  gust_kmh?: number | null
  ts: Date | string
  distance_m?: number | null
}

function isObservationRow(v: unknown): v is ObservationRow {
  return (
    typeof v === "object" &&
    v !== null &&
    "source" in v &&
    "wind_kmh" in v &&
    "ts" in v
  )
}

interface ForecastRow {
  source: string
  wind_kmh: number | null
  gust_kmh?: number | null
  rain_prob_pct?: number | null
  rain_mmph?: number | null
  weather_code?: string | null
  valid_at: Date | string
}

function isForecastRow(v: unknown): v is ForecastRow {
  return (
    typeof v === "object" &&
    v !== null &&
    "source" in v &&
    "wind_kmh" in v &&
    "valid_at" in v
  )
}

interface EnsembleRow {
  p10: number | null
  p90: number | null
}

function isEnsembleRow(v: unknown): v is EnsembleRow {
  return typeof v === "object" && v !== null && "p10" in v && "p90" in v
}

// ─── Main function ────────────────────────────────────────────────────────────

export async function queryWeatherToday(
  db: DbWithSql,
  input: WeatherTodayQueryInput,
): Promise<WeatherTodayResult> {
  const { lat, lng, when } = input
  const point = `SRID=4326;POINT(${lng} ${lat})`

  // 1) Latest observation per priority source within 5km, last 6 hours
  const rawObs = await db.sql`
    SELECT DISTINCT ON (source) source, wind_kmh, wind_dir_deg, gust_kmh, ts,
           ST_Distance(geom, ST_GeographyFromText(${point})) AS distance_m
    FROM observations_point
    WHERE ts >= ${new Date(when.getTime() - 6 * 3600_000).toISOString()}
      AND ST_DWithin(geom, ST_GeographyFromText(${point}), 5000)
      AND wind_kmh IS NOT NULL
    ORDER BY source, ts DESC
  `
  const obsRows = rawObs.filter(isObservationRow)

  // 2) Forecast for current hour (closest valid_at to now, within ±30 min)
  const rawFc = await db.sql`
    SELECT source, wind_kmh, gust_kmh, rain_prob_pct, rain_mmph, weather_code, valid_at
    FROM forecast_point
    WHERE source = 'open_meteo_forecast'
      AND ST_DWithin(geom, ST_GeographyFromText(${point}), 10000)
      AND valid_at BETWEEN ${new Date(when.getTime() - 1800_000).toISOString()}
                       AND ${new Date(when.getTime() + 3600_000).toISOString()}
    ORDER BY ABS(EXTRACT(EPOCH FROM (valid_at - ${when.toISOString()}::timestamptz))) ASC
    LIMIT 1
  `
  const fcRows = rawFc.filter(isForecastRow)

  // 3) Ensemble P10/P90 for wind
  const rawEns = await db.sql`
    SELECT p10, p90 FROM forecast_ensemble
    WHERE variable = 'wind_kmh'
      AND ST_DWithin(geom, ST_GeographyFromText(${point}), 25000)
      AND valid_at BETWEEN ${new Date(when.getTime() - 1800_000).toISOString()}
                       AND ${new Date(when.getTime() + 3600_000).toISOString()}
    ORDER BY ABS(EXTRACT(EPOCH FROM (valid_at - ${when.toISOString()}::timestamptz))) ASC
    LIMIT 1
  `
  const ensRows = rawEns.filter(isEnsembleRow)

  // ─── Fusion: iterate SOURCE_PRIORITY, take first fresh source ────────────
  const breakdown: Record<string, string> = {}
  let wind_now: number | null = null
  let gust_now: number | null = null
  let wind_dir: number | null = null
  let observedAt: Date | null = null

  for (const src of SOURCE_PRIORITY) {
    const row = obsRows.find((r) => r.source === src)
    if (!row || row.wind_kmh == null) continue
    wind_now = Number(row.wind_kmh)
    gust_now = row.gust_kmh != null ? Number(row.gust_kmh) : null
    wind_dir = row.wind_dir_deg != null ? Number(row.wind_dir_deg) : null
    observedAt = new Date(row.ts instanceof Date ? row.ts : row.ts)
    breakdown.wind_now_kmh = src
    break
  }

  // Fall back to forecast if no prioritized station found
  const fc = fcRows[0]
  if (wind_now === null && fc != null) {
    wind_now = Number(fc.wind_kmh)
    gust_now = fc.gust_kmh != null ? Number(fc.gust_kmh) : null
    observedAt = new Date(fc.valid_at instanceof Date ? fc.valid_at : fc.valid_at)
    breakdown.wind_now_kmh = "open_meteo_forecast"
  }

  if (wind_now === null || observedAt === null) {
    throw new DataUnavailableError("no observation or forecast within 6h for this coordinate")
  }

  // Classify freshness (throws DataUnavailableError if >6h)
  const freshness = classifyFreshness(observedAt, when)

  const rain_prob = fc != null ? Number(fc.rain_prob_pct ?? 0) : 0
  const rain_mmph = fc != null ? Number(fc.rain_mmph ?? 0) : 0
  const weather_code = fc != null ? fc.weather_code : null

  const ens = ensRows[0]
  const wind_p10 = ens?.p10 != null ? Number(ens.p10) : undefined
  const wind_p90 = ens?.p90 != null ? Number(ens.p90) : undefined
  const forecast_confidence =
    wind_p10 != null && wind_p90 != null && wind_now > 0
      ? Math.max(0, Math.min(100, 100 * (1 - (wind_p90 - wind_p10) / wind_now)))
      : undefined

  const result: WeatherTodayInput = {
    wind_now_kmh: wind_now,
    wind_p10_kmh: wind_p10,
    wind_p90_kmh: wind_p90,
    gust_now_kmh: gust_now,
    rain_prob_today_pct: rain_prob,
    rain_mmph_forecast: rain_mmph,
    thunder_risk: weather_code === "95" || weather_code === "96" || weather_code === "99" ? 1 : 0,
    forecast_confidence,
    wind_direction_deg: wind_dir ?? undefined,
    edr: null,
    local_hour: when.getHours(),
  }

  return { input: result, freshness, source_breakdown: breakdown }
}
