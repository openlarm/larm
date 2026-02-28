// ─── GET /api/weather/context?lat=&lng=&city= ────────────────────────────────
//
// Returns real rolling 30-day weather statistics (Weather30dInput) and
// a 14-day daily forecast (WeatherTodayInput[]) for the given coordinates.
//
// Data sources:
//   1. Open-Meteo Historical API    → 30-day hourly data → compute stats
//   2. Open-Meteo Forecast API      → 14-day daily forecast
//   3. Open-Meteo Ensemble API      → P10/P90/confidence per day (free + paid)
//   4. CWA F-C0032-001 (if key)    → enhance thunder_risk for near-term days
//
// Paid Open-Meteo support (OPEN_METEO_API_KEY in .env.local):
//   Forecast  → customer-api.open-meteo.com           (no rate limit)
//   Archive   → customer-historical-forecast-api.open-meteo.com (IFS 9km, P1)
//   Ensemble  → customer-ensemble-api.open-meteo.com  (51-member ECMWF IFS)

import { NextResponse } from "next/server"
import type { Weather30dInput, WeatherTodayInput } from "@/lib/types"

// ─── Open-Meteo endpoint resolver ─────────────────────────────────────────────

function meteoBase(paid: boolean, service: "forecast" | "archive" | "ensemble"): string {
  if (paid) {
    if (service === "forecast")  return "https://customer-api.open-meteo.com/v1/forecast"
    if (service === "ensemble")  return "https://customer-ensemble-api.open-meteo.com/v1/ensemble"
    // P1: Historical Forecast API — real forecast-model archive, IFS ~9km vs ERA5 25km
    return "https://customer-historical-forecast-api.open-meteo.com/v1/forecast"
  }
  if (service === "ensemble") return "https://ensemble-api.open-meteo.com/v1/ensemble"
  return service === "forecast"
    ? "https://api.open-meteo.com/v1/forecast"
    : "https://archive-api.open-meteo.com/v1/archive"
}

function applyApiKey(url: URL, apiKey: string | undefined) {
  if (apiKey) url.searchParams.set("apikey", apiKey)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0]
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

function mean(arr: number[]): number {
  if (arr.length === 0) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stddev(arr: number[], avg: number): number {
  if (arr.length === 0) return 0
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length
  return Math.sqrt(variance)
}

// ─── Step A: Historical API → Weather30dInput ─────────────────────────────────
// Free  → ERA5 reanalysis (25km)
// Paid  → Historical Forecast API (IFS archive, ~9km, P1 upgrade)

async function fetchHistorical(lat: number, lng: number, apiKey?: string): Promise<Weather30dInput | null> {
  const now = new Date()
  const endDate = new Date(now)
  endDate.setDate(endDate.getDate() - 1)            // yesterday
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 29)       // 30 days total

  const url = new URL(meteoBase(!!apiKey, "archive"))
  applyApiKey(url, apiKey)
  url.searchParams.set("latitude",   lat.toFixed(4))
  url.searchParams.set("longitude",  lng.toFixed(4))
  url.searchParams.set("start_date", toISODate(startDate))
  url.searchParams.set("end_date",   toISODate(endDate))
  url.searchParams.set("hourly",     "wind_speed_10m,wind_gusts_10m,precipitation")
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone",   "Asia/Taipei")

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null

  const data = await res.json()
  const hourly = data.hourly
  if (!hourly) return null

  const windArr: number[] = (hourly.wind_speed_10m  ?? []).map(Number).filter(isFinite)
  const gustArr: number[] = (hourly.wind_gusts_10m  ?? []).map(Number).filter(isFinite)
  const rainArr: number[] = (hourly.precipitation   ?? []).map(Number).filter(isFinite)

  if (windArr.length === 0) return null

  const sortedWind = [...windArr].sort((a, b) => a - b)
  const sortedGust = [...gustArr].sort((a, b) => a - b)

  const wind_mean = mean(windArr)
  const wind_p90  = percentile(sortedWind, 0.9)
  const gust_p90  = percentile(sortedGust, 0.9)

  // Group into daily buckets (24h each)
  const dailyRain: number[] = []
  for (let d = 0; d < 30; d++) {
    const slice = rainArr.slice(d * 24, (d + 1) * 24)
    dailyRain.push(slice.reduce((s, v) => s + v, 0))
  }
  const rain_days_30       = dailyRain.filter(d => d >= 1).length
  const heavy_rain_days_30 = dailyRain.filter(d => d >= 20).length

  const instability_index = clamp(
    (rain_days_30 / 30) * 0.6 + (heavy_rain_days_30 / Math.max(rain_days_30, 1)) * 0.4,
    0, 1
  )
  const cv = stddev(windArr, wind_mean) / Math.max(wind_mean, 1)
  const predictability_score = clamp(1 - cv * 0.7, 0, 1)

  return {
    wind_mean_kmh:        Math.round(wind_mean),
    wind_p90_kmh:         Math.round(wind_p90),
    gust_p90_kmh:         gustArr.length > 0 ? Math.round(gust_p90) : null,
    rain_days_30,
    heavy_rain_days_30,
    instability_index:    Math.round(instability_index * 100) / 100,
    predictability_score: Math.round(predictability_score * 100) / 100,
  }
}

// ─── Step B: Forecast API → WeatherTodayInput[] ───────────────────────────────

type ForecastDay = { date: string; weather_today: WeatherTodayInput }

async function fetchForecast(lat: number, lng: number, apiKey?: string): Promise<ForecastDay[]> {
  const url = new URL(meteoBase(!!apiKey, "forecast"))
  applyApiKey(url, apiKey)
  url.searchParams.set("latitude",  lat.toFixed(4))
  url.searchParams.set("longitude", lng.toFixed(4))
  url.searchParams.set(
    "daily",
    "wind_speed_10m_max,wind_gusts_10m_max,precipitation_probability_max,precipitation_sum,weather_code"
  )
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone",       "Asia/Taipei")
  url.searchParams.set("forecast_days",  "14")

  const res = await fetch(url.toString(), {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) return []

  const data = await res.json()
  const daily = data.daily
  if (!daily?.time) return []

  return (daily.time as string[]).map((date: string, i: number) => {
    const windKmh: number = daily.wind_speed_10m_max?.[i] ?? 0
    const gustKmh: number = daily.wind_gusts_10m_max?.[i] ?? 0
    const rainProb: number = daily.precipitation_probability_max?.[i] ?? 0
    const rainSum: number = daily.precipitation_sum?.[i] ?? 0
    const wCode: number = daily.weather_code?.[i] ?? 0

    return {
      date,
      weather_today: {
        wind_now_kmh:        Math.round(windKmh),
        gust_now_kmh:        Math.round(gustKmh),
        rain_prob_today_pct: Math.round(rainProb),
        rain_mmph_forecast:  Math.round((rainSum / 12) * 10) / 10,
        thunder_risk:        wCode >= 95 ? 1 : 0,
      },
    }
  })
}

// ─── Step C: Ensemble API → P10/P90/confidence per day ────────────────────────
// Uses ECMWF IFS (ecmwf_ifs025, ~0.25°, 50 members).
// Works on both free (ensemble-api.open-meteo.com) and paid plan.
// Confidence formula:
//   confidence = clamp(1 − (P90 − P10) / 30, 0, 1) × 100
//   → 0 km/h spread = 100%, 30+ km/h spread = 0%

type EnsembleDay = { p10: number; p90: number; confidence: number }

async function fetchEnsemble(
  lat: number,
  lng: number,
  apiKey?: string,
): Promise<Map<string, EnsembleDay>> {
  const url = new URL(meteoBase(!!apiKey, "ensemble"))
  if (apiKey) url.searchParams.set("apikey", apiKey)
  url.searchParams.set("latitude",  lat.toFixed(4))
  url.searchParams.set("longitude", lng.toFixed(4))
  url.searchParams.set("models",    "ecmwf_ifs025")
  url.searchParams.set("hourly",    "wind_speed_10m")
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone",  "Asia/Taipei")
  url.searchParams.set("forecast_days", "14")

  const res = await fetch(url.toString(), {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return new Map()

  const data = await res.json()
  const hourly = data.hourly
  if (!hourly?.time) return new Map()

  // Resolve member arrays — ecmwf_ifs025 uses Pattern B (separate member keys).
  // Pattern A (2D array) kept as fallback for API format changes.
  const raw = hourly.wind_speed_10m
  let memberArrays: number[][]

  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
    // Pattern A: 2D array [member][time]
    memberArrays = (raw as (number | null)[][]).map(row =>
      row.filter((v): v is number => v != null && isFinite(v))
    )
  } else {
    // Pattern B: separate wind_speed_10m_memberXX keys (ecmwf_ifs025 standard)
    const memberKeys = Object.keys(hourly)
      .filter(k => /^wind_speed_10m_member\d+$/.test(k))
      .sort()
    if (memberKeys.length === 0) return new Map()
    memberArrays = memberKeys.map(mk =>
      ((hourly[mk] as (number | null)[]) ?? [])
        .filter((v): v is number => v != null && isFinite(v))
    )
  }

  const times: string[] = hourly.time

  // For each member: group hourly → daily max → store in cross-member map
  // dateMap: date → array of each member's daily-max wind speed
  const dateMap = new Map<string, number[]>()

  for (const memberVals of memberArrays) {
    // Bucket hourly values by date
    const dailyByDate = new Map<string, number[]>()
    for (let h = 0; h < Math.min(times.length, memberVals.length); h++) {
      const date = times[h].split("T")[0]
      const bucket = dailyByDate.get(date) ?? []
      bucket.push(memberVals[h])
      dailyByDate.set(date, bucket)
    }

    // Daily max for this member → cross-member array
    for (const [date, hours] of dailyByDate) {
      const dayMax = Math.max(...hours)
      const arr = dateMap.get(date) ?? []
      arr.push(dayMax)
      dateMap.set(date, arr)
    }
  }

  // Compute P10, P90, confidence for each day
  const result = new Map<string, EnsembleDay>()
  for (const [date, memberVals] of dateMap) {
    const sorted = [...memberVals].sort((a, b) => a - b)
    const p10 = percentile(sorted, 0.1)
    const p90 = percentile(sorted, 0.9)
    const spread = p90 - p10
    // Narrower spread = higher confidence; 30 km/h spread = 0 confidence
    const confidence = Math.max(0, Math.min(100, Math.round((1 - spread / 30) * 100)))
    result.set(date, { p10: Math.round(p10), p90: Math.round(p90), confidence })
  }
  return result
}

// ─── Step D: CWA Thunder Enhancement ─────────────────────────────────────────

function normalizeCityName(city: string): string {
  return city.replace(/台/g, "臺")
}

async function fetchCWAThunder(city: string, apiKey: string): Promise<Map<string, 1>> {
  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001")
  url.searchParams.set("Authorization", apiKey)
  url.searchParams.set("locationName",  normalizeCityName(city))
  url.searchParams.set("elementName",   "Wx")

  const res = await fetch(url.toString(), {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(6_000),
  })
  if (!res.ok) return new Map()

  const data = await res.json()
  const thunderMap = new Map<string, 1>()

  const times: { startTime: string; parameter?: { parameterName?: string } }[] =
    data?.records?.location?.[0]?.weatherElement?.[0]?.time ?? []

  for (const t of times) {
    const dateStr = (t.startTime ?? "").split(" ")[0]
    const wx = t.parameter?.parameterName ?? ""
    if (wx.includes("雷")) thunderMap.set(dateStr, 1)
  }
  return thunderMap
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat  = parseFloat(searchParams.get("lat")  ?? "")
  const lng  = parseFloat(searchParams.get("lng")  ?? "")
  const city = searchParams.get("city") ?? ""

  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "invalid lat/lng" }, { status: 400 })
  }

  const meteoKey = process.env.OPEN_METEO_API_KEY || undefined

  // Fetch all three in parallel; ensemble works on free tier too (lower rate limit)
  const [weather_30d, forecast, ensembleMap] = await Promise.all([
    fetchHistorical(lat, lng, meteoKey).catch(() => null),
    fetchForecast(lat, lng, meteoKey).catch(() => []),
    fetchEnsemble(lat, lng, meteoKey).catch(() => new Map<string, EnsembleDay>()),
  ])

  // Merge ensemble P10/P90/confidence into each forecast day
  if (ensembleMap.size > 0) {
    for (const day of forecast) {
      const ens = ensembleMap.get(day.date)
      if (ens) {
        day.weather_today.wind_p10_kmh       = ens.p10
        day.weather_today.wind_p90_kmh       = ens.p90
        day.weather_today.forecast_confidence = ens.confidence
      }
    }
  }

  // CWA thunder enhancement (if key configured and city is known)
  const cwaKey = process.env.CWA_API_KEY
  if (cwaKey && city && forecast.length > 0) {
    try {
      const thunderMap = await fetchCWAThunder(city, cwaKey)
      if (thunderMap.size > 0) {
        for (const day of forecast) {
          if (thunderMap.has(day.date)) day.weather_today.thunder_risk = 1
        }
      }
    } catch {
      // CWA is enhancement-only; silently skip on error
    }
  }

  return NextResponse.json({
    weather_30d,
    forecast,
    _meta: {
      meteo_plan:    meteoKey ? "paid" : "free",
      ensemble_days: ensembleMap.size,
    },
  })
}
