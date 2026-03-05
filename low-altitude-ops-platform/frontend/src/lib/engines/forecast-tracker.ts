// ─── Forecast Accuracy Training Engine ───────────────────────────────────────
// Client-side engine that:
// 1. Converts API response data into ForecastLogEntry records
// 2. Backfills actual observations by matching forecast entries
// 3. Computes bias correction coefficients from accumulated data
// 4. Applies bias correction to raw forecast values

import type {
  ForecastLogEntry,
  ForecastBiasCorrection,
  BiasStats,
  ForecastAccuracySummary,
} from "@/lib/types"
import {
  putLogEntries,
  getLogEntriesByLocation,
  putBiasCorrection,
  toLocationKey,
} from "./forecast-db"

// ─── Types for API response payloads ────────────────────────────────────────

export interface ForecastLogAPIResponse {
  forecast_days: Array<{
    date: string
    lead_days: number
    wind_max_kmh: number
    wind_gust_kmh: number | null
    rain_prob_pct: number
    rain_sum_mm: number
    wind_p10_kmh: number | null
    wind_p90_kmh: number | null
    confidence: number | null
  }>
  actual_yesterday: {
    date: string
    wind_max_kmh: number
    wind_gust_kmh: number | null
    rain_sum_mm: number
    source: "archive" | "cwa-observation"
  } | null
}

// ─── Record Today's Forecasts ───────────────────────────────────────────────

export async function recordForecasts(
  lat: number,
  lng: number,
  apiData: ForecastLogAPIResponse,
): Promise<{ recorded: number; backfilled: number }> {
  const locationKey = toLocationKey(lat, lng)
  const now = new Date().toISOString()

  // Create forecast log entries for each of the 14 forecast days
  const newEntries: ForecastLogEntry[] = apiData.forecast_days.map(day => ({
    id: `${day.date}_${day.lead_days}_${locationKey}`,
    date: day.date,
    recorded_at: now,
    location_key: locationKey,
    lead_days: day.lead_days,
    forecast: {
      wind_max_kmh: day.wind_max_kmh,
      wind_gust_kmh: day.wind_gust_kmh,
      rain_prob_pct: day.rain_prob_pct,
      rain_sum_mm: day.rain_sum_mm,
      wind_p10_kmh: day.wind_p10_kmh,
      wind_p90_kmh: day.wind_p90_kmh,
      confidence: day.confidence,
      source: "open-meteo",
    },
  }))

  await putLogEntries(newEntries)

  // Backfill yesterday's actuals
  let backfilled = 0
  if (apiData.actual_yesterday) {
    backfilled = await backfillActuals(
      locationKey,
      apiData.actual_yesterday.date,
      apiData.actual_yesterday,
    )
  }

  return { recorded: newEntries.length, backfilled }
}

// ─── Backfill Actual Observations ───────────────────────────────────────────

async function backfillActuals(
  locationKey: string,
  date: string,
  actual: {
    wind_max_kmh: number
    wind_gust_kmh: number | null
    rain_sum_mm: number
    source: "archive" | "cwa-observation"
  },
): Promise<number> {
  // Find all forecast entries that predicted this date
  const allEntries = await getLogEntriesByLocation(locationKey)
  const matching = allEntries.filter(e => e.date === date && !e.actual)

  if (matching.length === 0) return 0

  const updated: ForecastLogEntry[] = matching.map(entry => {
    const windError = entry.forecast.wind_max_kmh - actual.wind_max_kmh
    const rainError = entry.forecast.rain_sum_mm - actual.rain_sum_mm
    const forecastHasRain = entry.forecast.rain_prob_pct >= 50
    const actualHasRain = actual.rain_sum_mm >= 1

    return {
      ...entry,
      actual: {
        wind_max_kmh: actual.wind_max_kmh,
        wind_gust_kmh: actual.wind_gust_kmh,
        rain_sum_mm: actual.rain_sum_mm,
        source: actual.source,
      },
      accuracy: {
        wind_error_kmh: Math.round(windError * 10) / 10,
        wind_abs_error_kmh: Math.round(Math.abs(windError) * 10) / 10,
        rain_error_mm: Math.round(rainError * 10) / 10,
        rain_hit: forecastHasRain === actualHasRain,
      },
    }
  })

  await putLogEntries(updated)
  return updated.length
}

// ─── Compute Bias Correction ────────────────────────────────────────────────

function emptyBias(): BiasStats {
  return { wind_bias_kmh: 0, wind_mae_kmh: 0, rain_bias_pct: 0, rain_hit_rate: 0, sample_count: 0 }
}

function computeBucket(entries: ForecastLogEntry[]): BiasStats {
  const withAccuracy = entries.filter(e => e.accuracy != null)
  if (withAccuracy.length === 0) return emptyBias()

  const n = withAccuracy.length
  const windBias = withAccuracy.reduce((s, e) => s + e.accuracy!.wind_error_kmh, 0) / n
  const windMAE = withAccuracy.reduce((s, e) => s + e.accuracy!.wind_abs_error_kmh, 0) / n
  const rainBias = withAccuracy.reduce((s, e) => s + e.accuracy!.rain_error_mm, 0) / n
  const rainHits = withAccuracy.filter(e => e.accuracy!.rain_hit).length

  return {
    wind_bias_kmh: Math.round(windBias * 10) / 10,
    wind_mae_kmh: Math.round(windMAE * 10) / 10,
    rain_bias_pct: Math.round(rainBias * 10) / 10,
    rain_hit_rate: Math.round((rainHits / n) * 100) / 100,
    sample_count: n,
  }
}

export async function computeAndStoreBiasCorrection(
  locationKey: string,
  lookbackDays: number = 90,
): Promise<ForecastBiasCorrection> {
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - lookbackDays)
  const sinceDateStr = sinceDate.toISOString().split("T")[0]

  const entries = await getLogEntriesByLocation(locationKey, sinceDateStr)

  const lead1to3 = entries.filter(e => e.lead_days >= 1 && e.lead_days <= 3)
  const lead4to7 = entries.filter(e => e.lead_days >= 4 && e.lead_days <= 7)
  const lead8to14 = entries.filter(e => e.lead_days >= 8 && e.lead_days <= 14)

  const correction: ForecastBiasCorrection = {
    location_key: locationKey,
    updated_at: new Date().toISOString(),
    sample_count: entries.filter(e => e.accuracy != null).length,
    buckets: {
      lead_1_3: computeBucket(lead1to3),
      lead_4_7: computeBucket(lead4to7),
      lead_8_14: computeBucket(lead8to14),
    },
  }

  await putBiasCorrection(correction)

  // Also cache to localStorage for quick access by Climate page
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(
      `forecast_bias_${locationKey}`,
      JSON.stringify(correction),
    )
  }

  return correction
}

// ─── Apply Bias Correction ──────────────────────────────────────────────────

export function applyWindBiasCorrection(
  forecastWindKmh: number,
  leadDays: number,
  correction: ForecastBiasCorrection,
): number {
  const bucket = getBucket(leadDays, correction)
  if (bucket.sample_count < 14) return forecastWindKmh  // not enough data
  return Math.max(0, Math.round((forecastWindKmh - bucket.wind_bias_kmh) * 10) / 10)
}

export function applyRainBiasCorrection(
  forecastRainMm: number,
  leadDays: number,
  correction: ForecastBiasCorrection,
): number {
  const bucket = getBucket(leadDays, correction)
  if (bucket.sample_count < 14) return forecastRainMm
  return Math.max(0, Math.round((forecastRainMm - bucket.rain_bias_pct) * 10) / 10)
}

function getBucket(leadDays: number, correction: ForecastBiasCorrection): BiasStats {
  if (leadDays <= 3) return correction.buckets.lead_1_3
  if (leadDays <= 7) return correction.buckets.lead_4_7
  return correction.buckets.lead_8_14
}

// ─── Compute Accuracy Summary ───────────────────────────────────────────────

export async function computeAccuracySummary(
  locationKey: string,
  periodDays: number = 90,
): Promise<ForecastAccuracySummary> {
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - periodDays)
  const sinceDateStr = sinceDate.toISOString().split("T")[0]

  const entries = await getLogEntriesByLocation(locationKey, sinceDateStr)
  const withAccuracy = entries.filter(e => e.accuracy != null)

  const lead1to3 = entries.filter(e => e.lead_days >= 1 && e.lead_days <= 3)
  const lead4to7 = entries.filter(e => e.lead_days >= 4 && e.lead_days <= 7)
  const lead8to14 = entries.filter(e => e.lead_days >= 8 && e.lead_days <= 14)

  // Compute daily MAE for sparkline
  const dailyMap = new Map<string, number[]>()
  for (const e of withAccuracy) {
    const arr = dailyMap.get(e.date) ?? []
    arr.push(e.accuracy!.wind_abs_error_kmh)
    dailyMap.set(e.date, arr)
  }
  const dailyMAE = [...dailyMap.entries()]
    .map(([date, errs]) => ({
      date,
      mae: Math.round((errs.reduce((s, v) => s + v, 0) / errs.length) * 10) / 10,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // Trend: compare first-half MAE vs second-half MAE
  const overallMAE = withAccuracy.length > 0
    ? withAccuracy.reduce((s, e) => s + e.accuracy!.wind_abs_error_kmh, 0) / withAccuracy.length
    : 0
  const rainHitRate = withAccuracy.length > 0
    ? withAccuracy.filter(e => e.accuracy!.rain_hit).length / withAccuracy.length
    : 0

  let trend: "improving" | "stable" | "degrading" = "stable"
  if (dailyMAE.length >= 14) {
    const half = Math.floor(dailyMAE.length / 2)
    const firstHalf = dailyMAE.slice(0, half).reduce((s, d) => s + d.mae, 0) / half
    const secondHalf = dailyMAE.slice(half).reduce((s, d) => s + d.mae, 0) / (dailyMAE.length - half)
    if (secondHalf < firstHalf * 0.9) trend = "improving"
    else if (secondHalf > firstHalf * 1.1) trend = "degrading"
  }

  return {
    location_key: locationKey,
    period_days: periodDays,
    overall_wind_mae: Math.round(overallMAE * 10) / 10,
    overall_rain_hit_rate: Math.round(rainHitRate * 100) / 100,
    trend,
    buckets: {
      lead_1_3: computeBucket(lead1to3),
      lead_4_7: computeBucket(lead4to7),
      lead_8_14: computeBucket(lead8to14),
    },
    daily_mae: dailyMAE,
  }
}

// ─── Read cached bias from localStorage ─────────────────────────────────────

export function getCachedBiasCorrection(locationKey: string): ForecastBiasCorrection | null {
  if (typeof localStorage === "undefined") return null
  const raw = localStorage.getItem(`forecast_bias_${locationKey}`)
  if (!raw) return null
  try {
    return JSON.parse(raw) as ForecastBiasCorrection
  } catch {
    return null
  }
}

// ─── Export log entries as CSV ───────────────────────────────────────────────

export function logEntriesToCSV(entries: ForecastLogEntry[]): string {
  const headers = [
    "date", "lead_days", "location_key", "recorded_at",
    "fc_wind_max", "fc_gust", "fc_rain_prob", "fc_rain_sum",
    "fc_wind_p10", "fc_wind_p90", "fc_confidence",
    "actual_wind_max", "actual_gust", "actual_rain_sum",
    "err_wind", "err_wind_abs", "err_rain", "rain_hit",
  ]
  const rows = entries.map(e => [
    e.date, e.lead_days, e.location_key, e.recorded_at,
    e.forecast.wind_max_kmh, e.forecast.wind_gust_kmh ?? "",
    e.forecast.rain_prob_pct, e.forecast.rain_sum_mm,
    e.forecast.wind_p10_kmh ?? "", e.forecast.wind_p90_kmh ?? "",
    e.forecast.confidence ?? "",
    e.actual?.wind_max_kmh ?? "", e.actual?.wind_gust_kmh ?? "",
    e.actual?.rain_sum_mm ?? "",
    e.accuracy?.wind_error_kmh ?? "", e.accuracy?.wind_abs_error_kmh ?? "",
    e.accuracy?.rain_error_mm ?? "", e.accuracy?.rain_hit ?? "",
  ].join(","))

  return [headers.join(","), ...rows].join("\n")
}
