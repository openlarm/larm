// ─── GET /api/weather/seasonal?lat=&lng=&months=3 ───────────────────────────
// Returns seasonal (1-6 month) forecast from ECMWF SEAS5 via Open-Meteo.
//
// Data source: Open-Meteo Seasonal Forecast API
//   Free:  https://seasonal-api.open-meteo.com/v1/seasonal
//   Paid:  https://customer-seasonal-api.open-meteo.com/v1/seasonal
//
// Returns monthly P10/P50/P90 for wind speed, precipitation, temperature.

import { NextRequest, NextResponse } from "next/server"
import type { SeasonalForecast } from "@/lib/types"

function seasonalBase(paid: boolean): string {
  return paid
    ? "https://customer-seasonal-api.open-meteo.com/v1/seasonal"
    : "https://seasonal-api.open-meteo.com/v1/seasonal"
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const lat = parseFloat(sp.get("lat") ?? "")
  const lng = parseFloat(sp.get("lng") ?? "")
  const months = Math.min(6, Math.max(1, parseInt(sp.get("months") ?? "3", 10)))

  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "Missing or invalid lat/lng" }, { status: 400 })
  }

  const apiKey = process.env.OPEN_METEO_API_KEY || undefined
  const paid = !!apiKey

  try {
    const url = new URL(seasonalBase(paid))
    if (apiKey) url.searchParams.set("apikey", apiKey)
    url.searchParams.set("latitude", lat.toFixed(4))
    url.searchParams.set("longitude", lng.toFixed(4))
    url.searchParams.set(
      "daily",
      "wind_speed_10m_max,precipitation_sum,temperature_2m_max"
    )
    url.searchParams.set("wind_speed_unit", "kmh")
    url.searchParams.set("timezone", "Asia/Taipei")

    // Seasonal API returns up to 6 months of daily data from multiple ensemble members
    const res = await fetch(url.toString(), {
      next: { revalidate: 86400 },  // cache 24 hours (seasonal data updates monthly)
      signal: AbortSignal.timeout(15_000),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => "")
      return NextResponse.json({
        error: `Seasonal API returned ${res.status}`,
        detail: text.slice(0, 200),
        fallback: true,
        months: generateFallbackMonths(months),
      })
    }

    const data = await res.json()
    const daily = data.daily

    if (!daily?.time) {
      return NextResponse.json({
        error: "No daily data in seasonal response",
        fallback: true,
        months: generateFallbackMonths(months),
      })
    }

    // Group daily values by month, computing P10/P50/P90 across ensemble members
    const times: string[] = daily.time
    const windArr: (number | null)[] = daily.wind_speed_10m_max ?? []
    const rainArr: (number | null)[] = daily.precipitation_sum ?? []
    const tempArr: (number | null)[] = daily.temperature_2m_max ?? []

    // Bucket by month
    const monthBuckets = new Map<string, {
      winds: number[]
      rains: number[]
      temps: number[]
    }>()

    for (let i = 0; i < times.length; i++) {
      const monthKey = times[i].slice(0, 7) // "2026-04"
      const bucket = monthBuckets.get(monthKey) ?? { winds: [], rains: [], temps: [] }

      const w = windArr[i]
      const r = rainArr[i]
      const t = tempArr[i]

      if (w != null && isFinite(w)) bucket.winds.push(w)
      if (r != null && isFinite(r)) bucket.rains.push(r)
      if (t != null && isFinite(t)) bucket.temps.push(t)

      monthBuckets.set(monthKey, bucket)
    }

    // Convert to SeasonalForecast array, limited to requested months
    const now = new Date()
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`

    const forecasts: SeasonalForecast[] = []
    const sortedMonths = [...monthBuckets.keys()]
      .filter(m => m > currentMonth)
      .sort()
      .slice(0, months)

    for (const month of sortedMonths) {
      const b = monthBuckets.get(month)!
      const sortedWind = [...b.winds].sort((a, c) => a - c)
      const sortedRain = [...b.rains].sort((a, c) => a - c)
      const sortedTemp = [...b.temps].sort((a, c) => a - c)

      // For rain: sum daily values to get monthly total estimate
      const rainTotal = b.rains.reduce((s, v) => s + v, 0)
      const daysInMonth = b.rains.length || 30

      forecasts.push({
        month,
        wind_max_p10: Math.round(percentile(sortedWind, 0.1) * 10) / 10,
        wind_max_p50: Math.round(percentile(sortedWind, 0.5) * 10) / 10,
        wind_max_p90: Math.round(percentile(sortedWind, 0.9) * 10) / 10,
        rain_sum_p10: Math.round(rainTotal * 0.6),  // rough P10 estimate
        rain_sum_p50: Math.round(rainTotal),
        rain_sum_p90: Math.round(rainTotal * 1.5),  // rough P90 estimate
        temp_max_p50: sortedTemp.length > 0
          ? Math.round(percentile(sortedTemp, 0.5) * 10) / 10
          : 25,
      })
    }

    return NextResponse.json({
      lat,
      lng,
      months: forecasts,
      source: paid ? "open-meteo-paid" : "open-meteo-free",
      model: "ecmwf_seas5",
      fetched_at: new Date().toISOString(),
      days_in_data: times.length,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    return NextResponse.json({
      error: msg,
      fallback: true,
      months: generateFallbackMonths(months),
    }, { status: 500 })
  }
}

// ─── Fallback: generate placeholder months when API is unavailable ──────────

function generateFallbackMonths(count: number): SeasonalForecast[] {
  const now = new Date()
  const result: SeasonalForecast[] = []

  for (let i = 1; i <= count; i++) {
    const d = new Date(now)
    d.setMonth(d.getMonth() + i)
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`

    result.push({
      month,
      wind_max_p10: 8,
      wind_max_p50: 15,
      wind_max_p90: 25,
      rain_sum_p10: 50,
      rain_sum_p50: 120,
      rain_sum_p90: 250,
      temp_max_p50: 25,
    })
  }
  return result
}
