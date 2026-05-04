// ─── GET /api/weather/climate-profile ─────────────────────────────────────────
//
// Returns location-specific monthly W-code frequency distributions derived from
// 3 years of Open-Meteo ERA5 daily data.  Used by the Climate page to replace
// the hardcoded Taiwan MONTH_PROFILES for far-future (>14d) calendar generation.
//
// Response:
//   { source, year_range, sample_days, profiles: MonthProfile[12] }
//   MonthProfile = { wDist: [number, WCode][]; riskBase: RLevel }
//
// Caching: 24 h (revalidate=86400).  Historical climate barely changes day-to-day.

import { NextRequest, NextResponse } from "next/server"

type WCode  = "W0" | "W1" | "W2" | "W3" | "W4" | "W5"
type RLevel = "R0" | "R1" | "R2" | "R3" | "R4"
export type MonthProfile = { wDist: [number, WCode][]; riskBase: RLevel }

const W_ORDER: WCode[] = ["W0", "W1", "W2", "W3", "W4", "W5"]

/**
 * Classify one historical day into a W-code using daily aggregates.
 * Simplified vs real-time inferWCode (no rolling 30-day context), but
 * appropriate for batch monthly-frequency computation.
 */
function inferDayW(
  windMaxKmh: number,
  precipSumMm: number,
  precipHours: number,
  weatherCode: number,
): WCode {
  if (windMaxKmh >= 39) return "W5"                          // typhoon / strong wind
  if (weatherCode >= 95) return "W4"                         // WMO thunderstorm codes
  if (precipSumMm >= 20 || precipHours >= 6) return "W3"    // heavy / persistent rain
  if (precipSumMm >= 3  || precipHours >= 2) return "W2"    // frontal / moderate rain
  if (windMaxKmh >= 18) return "W1"                          // NE monsoon light
  return "W0"
}

/** Map per-month W-code counts → riskBase (R-level for seasonal generation). */
function riskBaseFromCounts(counts: Record<WCode, number>, total: number): RLevel {
  if (total === 0) return "R0"
  const severe   = (counts.W4 + counts.W5) / total
  const moderate = counts.W3 / total
  if (severe > 0.20) return "R3"
  if (severe > 0.08 || severe + moderate > 0.30) return "R2"
  if (moderate > 0.12 || (counts.W1 + counts.W2) / total > 0.50) return "R1"
  return "R0"
}

const fmt = (d: Date) => d.toISOString().split("T")[0]

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const lat = parseFloat(searchParams.get("lat") ?? "")
  const lng = parseFloat(searchParams.get("lng") ?? "")
  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: "lat and lng are required" }, { status: 400 })
  }

  // Rolling 3-year window ending yesterday
  const end   = new Date(); end.setDate(end.getDate() - 1)
  const start = new Date(end); start.setFullYear(start.getFullYear() - 3)

  const apiUrl = [
    `https://archive-api.open-meteo.com/v1/archive`,
    `?latitude=${lat}&longitude=${lng}`,
    `&start_date=${fmt(start)}&end_date=${fmt(end)}`,
    `&daily=wind_speed_10m_max,precipitation_sum,precipitation_hours,weather_code`,
    `&wind_speed_unit=kmh&timezone=Asia%2FTaipei`,
  ].join("")

  let body: {
    daily?: {
      time:                 string[]
      wind_speed_10m_max:   (number | null)[]
      precipitation_sum:    (number | null)[]
      precipitation_hours:  (number | null)[]
      weather_code:         (number | null)[]
    }
  }

  try {
    const resp = await fetch(apiUrl, { next: { revalidate: 86400 } })
    if (!resp.ok) throw new Error(`Open-Meteo HTTP ${resp.status}`)
    body = await resp.json()
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 502 })
  }

  const daily = body.daily
  if (!daily?.time?.length) {
    return NextResponse.json({ error: "no data returned by Open-Meteo" }, { status: 502 })
  }

  // Accumulate W-code counts per calendar month (0 = Jan … 11 = Dec)
  const counts: Record<number, Record<WCode, number>> = {}
  for (let m = 0; m < 12; m++) counts[m] = { W0: 0, W1: 0, W2: 0, W3: 0, W4: 0, W5: 0 }
  const totals = new Array<number>(12).fill(0)

  for (let i = 0; i < daily.time.length; i++) {
    const m = new Date(daily.time[i]).getMonth()
    const w = inferDayW(
      daily.wind_speed_10m_max[i]  ?? 0,
      daily.precipitation_sum[i]   ?? 0,
      daily.precipitation_hours[i] ?? 0,
      daily.weather_code[i]        ?? 0,
    )
    counts[m][w]++
    totals[m]++
  }

  // Build cumulative wDist per month (skip W-codes with 0 occurrences)
  const profiles: MonthProfile[] = Array.from({ length: 12 }, (_, m) => {
    const total = totals[m]
    if (total === 0) return { wDist: [[1.00, "W0"]], riskBase: "R0" }

    const wDist: [number, WCode][] = []
    let cum = 0
    for (const w of W_ORDER) {
      if (counts[m][w] === 0) continue
      cum += counts[m][w] / total
      wDist.push([Math.round(cum * 1000) / 1000, w])
    }
    // Clamp last entry to exactly 1.00 to avoid float drift
    if (wDist.length > 0) wDist[wDist.length - 1][0] = 1.00

    return { wDist, riskBase: riskBaseFromCounts(counts[m], total) }
  })

  return NextResponse.json({
    source:      "open_meteo_era5",
    year_range:  `${fmt(start).slice(0, 4)}–${fmt(end).slice(0, 4)}`,
    sample_days: daily.time.length,
    profiles,
  })
}
