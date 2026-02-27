// ─── GET /api/weather/context?lat=&lng=&city= ────────────────────────────────
//
// Returns real rolling 30-day weather statistics (Weather30dInput) and
// a 14-day daily forecast (WeatherTodayInput[]) for the given coordinates.
//
// Data sources:
//   1. Open-Meteo Historical Archive API  → 30-day hourly data → compute stats
//   2. Open-Meteo Forecast API            → 14-day daily forecast
//   3. CWA F-C0032-001 (if CWA_API_KEY)  → enhance thunder_risk for near-term days

import { NextResponse } from "next/server"
import type { Weather30dInput, WeatherTodayInput } from "@/lib/types"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISODate(d: Date): string {
  return d.toISOString().split("T")[0]
}

function clamp(v: number, min: number, max: number) {
  return Math.min(max, Math.max(min, v))
}

function percentile(sorted: number[], p: number): number {
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

// ─── Step A: Open-Meteo Historical → Weather30dInput ─────────────────────────

async function fetchHistorical(lat: number, lng: number): Promise<Weather30dInput | null> {
  const now = new Date()
  const endDate = new Date(now)
  endDate.setDate(endDate.getDate() - 1)            // yesterday
  const startDate = new Date(endDate)
  startDate.setDate(startDate.getDate() - 29)       // 30 days total

  const url = new URL("https://archive-api.open-meteo.com/v1/archive")
  url.searchParams.set("latitude", lat.toFixed(4))
  url.searchParams.set("longitude", lng.toFixed(4))
  url.searchParams.set("start_date", toISODate(startDate))
  url.searchParams.set("end_date", toISODate(endDate))
  url.searchParams.set("hourly", "wind_speed_10m,wind_gusts_10m,precipitation")
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone", "Asia/Taipei")

  const res = await fetch(url.toString(), {
    next: { revalidate: 3600 },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return null

  const data = await res.json()
  const hourly = data.hourly
  if (!hourly) return null

  const windArr: number[] = (hourly.wind_speed_10m ?? []).map(Number).filter(isFinite)
  const gustArr: number[] = (hourly.wind_gusts_10m ?? []).map(Number).filter(isFinite)
  const rainArr: number[] = (hourly.precipitation ?? []).map(Number).filter(isFinite)

  if (windArr.length === 0) return null

  const sortedWind = [...windArr].sort((a, b) => a - b)
  const sortedGust = [...gustArr].sort((a, b) => a - b)

  const wind_mean = mean(windArr)
  const wind_p90 = percentile(sortedWind, 0.9)
  const gust_p90 = percentile(sortedGust, 0.9)

  // Group into daily buckets (24h each)
  const dailyRain: number[] = []
  for (let d = 0; d < 30; d++) {
    const slice = rainArr.slice(d * 24, (d + 1) * 24)
    dailyRain.push(slice.reduce((s, v) => s + v, 0))
  }
  const rain_days_30 = dailyRain.filter(d => d >= 1).length
  const heavy_rain_days_30 = dailyRain.filter(d => d >= 20).length

  // Derived instability index
  const instability_index = clamp(
    (rain_days_30 / 30) * 0.6 + (heavy_rain_days_30 / Math.max(rain_days_30, 1)) * 0.4,
    0, 1
  )

  // Derived predictability score: 1 − normalised wind coefficient of variation
  const cv = stddev(windArr, wind_mean) / Math.max(wind_mean, 1)
  const predictability_score = clamp(1 - cv * 0.7, 0, 1)

  return {
    wind_mean_kmh:        Math.round(wind_mean),
    wind_p90_kmh:         Math.round(wind_p90),
    gust_p90_kmh:         Math.round(gust_p90),
    rain_days_30,
    heavy_rain_days_30,
    instability_index:    Math.round(instability_index * 100) / 100,
    predictability_score: Math.round(predictability_score * 100) / 100,
  }
}

// ─── Step B: Open-Meteo Forecast → WeatherTodayInput[] ───────────────────────

type ForecastDay = { date: string; weather_today: WeatherTodayInput }

async function fetchForecast(lat: number, lng: number): Promise<ForecastDay[]> {
  const url = new URL("https://api.open-meteo.com/v1/forecast")
  url.searchParams.set("latitude", lat.toFixed(4))
  url.searchParams.set("longitude", lng.toFixed(4))
  url.searchParams.set(
    "daily",
    "wind_speed_10m_max,wind_gusts_10m_max,precipitation_probability_max,precipitation_sum,weather_code"
  )
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone", "Asia/Taipei")
  url.searchParams.set("forecast_days", "14")

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

// ─── Step C: CWA Thunder Enhancement ─────────────────────────────────────────

function normalizeCityName(city: string): string {
  // CWA uses 臺 not 台 for official county names
  return city.replace(/台/g, "臺")
}

async function fetchCWAThunder(
  city: string,
  apiKey: string
): Promise<Map<string, 1>> {
  const url = new URL(
    "https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001"
  )
  url.searchParams.set("Authorization", apiKey)
  url.searchParams.set("locationName", normalizeCityName(city))
  url.searchParams.set("elementName", "Wx")

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
    const dateStr = (t.startTime ?? "").split(" ")[0]  // "2026-02-27 06:00:00" → "2026-02-27"
    const wx = t.parameter?.parameterName ?? ""
    if (wx.includes("雷")) {
      thunderMap.set(dateStr, 1)
    }
  }
  return thunderMap
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = parseFloat(searchParams.get("lat") ?? "")
  const lng = parseFloat(searchParams.get("lng") ?? "")
  const city = searchParams.get("city") ?? ""

  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "invalid lat/lng" }, { status: 400 })
  }

  // Fetch in parallel
  const [weather_30d, forecast] = await Promise.all([
    fetchHistorical(lat, lng).catch(() => null),
    fetchForecast(lat, lng).catch(() => []),
  ])

  // CWA thunder enhancement (if key is configured and city is known)
  const cwaKey = process.env.CWA_API_KEY
  if (cwaKey && city && forecast.length > 0) {
    try {
      const thunderMap = await fetchCWAThunder(city, cwaKey)
      if (thunderMap.size > 0) {
        for (const day of forecast) {
          if (thunderMap.has(day.date)) {
            day.weather_today.thunder_risk = 1
          }
        }
      }
    } catch {
      // CWA is enhancement-only; silently skip on error
    }
  }

  return NextResponse.json({ weather_30d, forecast })
}
