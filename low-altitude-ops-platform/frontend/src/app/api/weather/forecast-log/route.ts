// ─── POST /api/weather/forecast-log ──────────────────────────────────────────
// Fetches today's 14-day forecast + yesterday's actual observations.
// Returns structured data for client-side IndexedDB storage + bias computation.
//
// POST body: { lat: number, lng: number }
// GET ?lat=&lng=&action=stats  → returns log statistics summary
//
// Data sources:
//   - Open-Meteo Forecast API → 14-day daily forecast
//   - Open-Meteo Ensemble API → P10/P90/confidence per day
//   - Open-Meteo Archive API  → yesterday's actual observations

import { NextRequest, NextResponse } from "next/server"

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0]
}

function meteoBase(paid: boolean, service: "forecast" | "archive" | "ensemble"): string {
  if (paid) {
    if (service === "forecast") return "https://customer-api.open-meteo.com/v1/forecast"
    if (service === "ensemble") return "https://customer-ensemble-api.open-meteo.com/v1/ensemble"
    return "https://customer-historical-forecast-api.open-meteo.com/v1/forecast"
  }
  if (service === "ensemble") return "https://ensemble-api.open-meteo.com/v1/ensemble"
  return service === "forecast"
    ? "https://api.open-meteo.com/v1/forecast"
    : "https://archive-api.open-meteo.com/v1/archive"
}

// ─── Fetch 14-day forecast ──────────────────────────────────────────────────

interface ForecastDayData {
  date: string
  lead_days: number
  wind_max_kmh: number
  wind_gust_kmh: number | null
  rain_prob_pct: number
  rain_sum_mm: number
  wind_p10_kmh: number | null
  wind_p90_kmh: number | null
  confidence: number | null
}

async function fetchForecastData(lat: number, lng: number, apiKey?: string): Promise<ForecastDayData[]> {
  const url = new URL(meteoBase(!!apiKey, "forecast"))
  if (apiKey) url.searchParams.set("apikey", apiKey)
  url.searchParams.set("latitude", lat.toFixed(4))
  url.searchParams.set("longitude", lng.toFixed(4))
  url.searchParams.set(
    "daily",
    "wind_speed_10m_max,wind_gusts_10m_max,precipitation_probability_max,precipitation_sum"
  )
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone", "Asia/Taipei")
  url.searchParams.set("forecast_days", "14")

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) return []

  const data = await res.json()
  const daily = data.daily
  if (!daily?.time) return []

  const today = toISODate(new Date())
  return (daily.time as string[]).map((date: string, i: number) => {
    const leadDays = Math.round(
      (new Date(date).getTime() - new Date(today).getTime()) / (86400000)
    )
    return {
      date,
      lead_days: Math.max(1, leadDays + 1),
      wind_max_kmh: Math.round(daily.wind_speed_10m_max?.[i] ?? 0),
      wind_gust_kmh: daily.wind_gusts_10m_max?.[i] != null
        ? Math.round(daily.wind_gusts_10m_max[i])
        : null,
      rain_prob_pct: Math.round(daily.precipitation_probability_max?.[i] ?? 0),
      rain_sum_mm: Math.round((daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
      wind_p10_kmh: null,
      wind_p90_kmh: null,
      confidence: null,
    }
  })
}

// ─── Fetch ensemble P10/P90 ────────────────────────────────────────────────

async function fetchEnsembleData(
  lat: number, lng: number, apiKey?: string
): Promise<Map<string, { p10: number; p90: number; confidence: number }>> {
  const url = new URL(meteoBase(!!apiKey, "ensemble"))
  if (apiKey) url.searchParams.set("apikey", apiKey)
  url.searchParams.set("latitude", lat.toFixed(4))
  url.searchParams.set("longitude", lng.toFixed(4))
  url.searchParams.set("models", "ecmwf_ifs025")
  url.searchParams.set("hourly", "wind_speed_10m")
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone", "Asia/Taipei")
  url.searchParams.set("forecast_days", "14")

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) return new Map()

  const data = await res.json()
  const hourly = data.hourly
  if (!hourly?.time) return new Map()

  const memberKeys = Object.keys(hourly)
    .filter(k => /^wind_speed_10m_member\d+$/.test(k))
    .sort()
  if (memberKeys.length === 0) return new Map()

  const times: string[] = hourly.time
  const dateMap = new Map<string, number[]>()

  for (const mk of memberKeys) {
    const vals: (number | null)[] = hourly[mk] ?? []
    const dailyByDate = new Map<string, number[]>()
    for (let h = 0; h < Math.min(times.length, vals.length); h++) {
      const v = vals[h]
      if (v == null || !isFinite(v)) continue
      const date = times[h].split("T")[0]
      const bucket = dailyByDate.get(date) ?? []
      bucket.push(v)
      dailyByDate.set(date, bucket)
    }
    for (const [date, hours] of dailyByDate) {
      const dayMax = Math.max(...hours)
      const arr = dateMap.get(date) ?? []
      arr.push(dayMax)
      dateMap.set(date, arr)
    }
  }

  const result = new Map<string, { p10: number; p90: number; confidence: number }>()
  for (const [date, memberVals] of dateMap) {
    const sorted = [...memberVals].sort((a, b) => a - b)
    const p10Idx = Math.floor(sorted.length * 0.1)
    const p90Idx = Math.min(Math.floor(sorted.length * 0.9), sorted.length - 1)
    const p10 = sorted[p10Idx]
    const p90 = sorted[p90Idx]
    const spread = p90 - p10
    const confidence = Math.max(0, Math.min(100, Math.round((1 - spread / 30) * 100)))
    result.set(date, { p10: Math.round(p10), p90: Math.round(p90), confidence })
  }
  return result
}

// ─── Fetch yesterday's actual observations ──────────────────────────────────

async function fetchYesterdayActual(
  lat: number, lng: number, apiKey?: string
): Promise<{
  date: string
  wind_max_kmh: number
  wind_gust_kmh: number | null
  rain_sum_mm: number
  source: "archive"
} | null> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const dateStr = toISODate(yesterday)

  const url = new URL(meteoBase(!!apiKey, "archive"))
  if (apiKey) url.searchParams.set("apikey", apiKey)
  url.searchParams.set("latitude", lat.toFixed(4))
  url.searchParams.set("longitude", lng.toFixed(4))
  url.searchParams.set("start_date", dateStr)
  url.searchParams.set("end_date", dateStr)
  url.searchParams.set("daily", "wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum")
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone", "Asia/Taipei")

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) })
  if (!res.ok) return null

  const data = await res.json()
  const daily = data.daily
  if (!daily?.time || daily.time.length === 0) return null

  return {
    date: dateStr,
    wind_max_kmh: Math.round(daily.wind_speed_10m_max?.[0] ?? 0),
    wind_gust_kmh: daily.wind_gusts_10m_max?.[0] != null
      ? Math.round(daily.wind_gusts_10m_max[0])
      : null,
    rain_sum_mm: Math.round((daily.precipitation_sum?.[0] ?? 0) * 10) / 10,
    source: "archive" as const,
  }
}

// ─── POST handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const lat = parseFloat(body.lat)
    const lng = parseFloat(body.lng)
    if (!isFinite(lat) || !isFinite(lng)) {
      return NextResponse.json({ error: "Invalid lat/lng" }, { status: 400 })
    }

    const apiKey = process.env.OPEN_METEO_API_KEY || undefined

    // Fetch all data sources in parallel
    const [forecastDays, ensembleMap, actual] = await Promise.all([
      fetchForecastData(lat, lng, apiKey),
      fetchEnsembleData(lat, lng, apiKey),
      fetchYesterdayActual(lat, lng, apiKey),
    ])

    // Merge ensemble data into forecast days
    for (const day of forecastDays) {
      const ens = ensembleMap.get(day.date)
      if (ens) {
        day.wind_p10_kmh = ens.p10
        day.wind_p90_kmh = ens.p90
        day.confidence = ens.confidence
      }
    }

    return NextResponse.json({
      forecast_days: forecastDays,
      actual_yesterday: actual,
      fetched_at: new Date().toISOString(),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// ─── GET handler (stats) ────────────────────────────────────────────────────

export async function GET() {
  // This endpoint returns info about the API for health checks
  return NextResponse.json({
    service: "forecast-log",
    description: "Records daily forecasts and compares with actual observations for bias training",
    usage: "POST { lat, lng } to record today's forecast and backfill yesterday's actuals",
    storage: "Client-side IndexedDB (larm_forecast_db)",
  })
}
