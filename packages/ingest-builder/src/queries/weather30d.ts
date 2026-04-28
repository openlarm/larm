import type { Weather30dInput } from "@openlarm/core"

export interface Weather30dQueryInput {
  lat: number
  lng: number
  when: Date
}

/** Minimal db interface required by queryWeather30d */
export interface DbWithSql {
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<unknown[]>
}

interface ObservationRow {
  wind_kmh: number | null
  gust_kmh: number | null
  rain_mm_1h: number | null
  ts: string
}

function isObservationRow(v: unknown): v is ObservationRow {
  return typeof v === "object" && v !== null && "wind_kmh" in v && "ts" in v
}

export async function queryWeather30d(
  db: DbWithSql,
  input: Weather30dQueryInput,
): Promise<Weather30dInput> {
  const end = input.when
  const start = new Date(end.getTime() - 30 * 86_400_000)

  const raw = await db.sql`
    SELECT wind_kmh, gust_kmh, rain_mm_1h, ts
    FROM observations_point
    WHERE ts >= ${start.toISOString()} AND ts <= ${end.toISOString()}
      AND ST_DWithin(geom, ST_GeographyFromText(${`SRID=4326;POINT(${input.lng} ${input.lat})`}), 5000)
      AND wind_kmh IS NOT NULL
  `

  const rows = raw.filter(isObservationRow)

  if (rows.length === 0) {
    return {
      wind_mean_kmh: 0,
      wind_p90_kmh: 0,
      gust_p90_kmh: null,
      rain_days_30: 0,
      heavy_rain_days_30: 0,
      instability_index: 0,
      predictability_score: 0.7,
    }
  }

  const winds = rows
    .map((r) => Number(r.wind_kmh))
    .filter(Number.isFinite)
    .sort((a, b) => a - b)

  const gusts = rows
    .filter((r) => r.gust_kmh != null)
    .map((r) => Number(r.gust_kmh))
    .sort((a, b) => a - b)

  const wind_mean_kmh = winds.reduce((s, v) => s + v, 0) / winds.length
  const wind_p90_kmh = winds[Math.floor(winds.length * 0.9)] ?? wind_mean_kmh
  const gust_p90_kmh = gusts.length > 0 ? (gusts[Math.floor(gusts.length * 0.9)] ?? null) : null

  // Group hourly rain into calendar-day buckets, count days ≥1mm and ≥20mm
  const dayBuckets = new Map<string, number>()
  for (const r of rows) {
    const day = new Date(r.ts).toISOString().slice(0, 10)
    dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + Number(r.rain_mm_1h ?? 0))
  }
  const dailyRain = [...dayBuckets.values()]
  const rain_days_30 = dailyRain.filter((mm) => mm >= 1).length
  const heavy_rain_days_30 = dailyRain.filter((mm) => mm >= 20).length

  const variance = winds.reduce((s, v) => s + (v - wind_mean_kmh) ** 2, 0) / winds.length
  const instability_index = Math.min(1, Math.sqrt(variance) / Math.max(wind_mean_kmh, 1))

  return {
    wind_mean_kmh,
    wind_p90_kmh,
    gust_p90_kmh,
    rain_days_30,
    heavy_rain_days_30,
    instability_index,
    // predictability_score fixed at 0.7 bootstrap; will be refined in Sprint 3
    // once forecast vs. observed RMSE data is available
    predictability_score: 0.7,
  }
}
