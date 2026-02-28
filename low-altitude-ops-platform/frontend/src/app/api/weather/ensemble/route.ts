// ─── GET /api/weather/ensemble?lat=&lng=&days= ────────────────────────────────
//
// Returns per-day wind P10/P50/P90 and forecast confidence from the
// ECMWF IFS ensemble (51 members, ~0.4° resolution).
//
// Open-Meteo Ensemble API returns wind_speed_10m as a 2D array:
//   hourly.wind_speed_10m[member_index][time_index]
// (Not as separate wind_speed_10m_member01 keys)
//
// Requires OPEN_METEO_API_KEY (paid Open-Meteo plan).
// Without a key → 402 response with instructions.

import { NextResponse } from "next/server"

const ENSEMBLE_BASE = "https://customer-ensemble-api.open-meteo.com/v1/ensemble"

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

// Resolve the member arrays from the hourly wind data.
// Open-Meteo may return either:
//   A) 2D array: hourly.wind_speed_10m = [[m0_t0, m0_t1,...], [m1_t0, m1_t1,...], ...]
//   B) Separate keys: hourly.wind_speed_10m_member01, ..._member51
//   C) 1D array: ensemble mean only (not useful for spread)
function resolveMemberArrays(
  hourly: Record<string, unknown>
): { arrays: number[][]; format: string } {
  const raw = hourly.wind_speed_10m

  // Pattern A: 2D array [member][time]
  if (Array.isArray(raw) && raw.length > 0 && Array.isArray(raw[0])) {
    const arrays = (raw as number[][]).map(memberRow =>
      memberRow.map(Number).filter(isFinite)
    )
    return { arrays, format: `2d_array[${arrays.length}][${arrays[0]?.length ?? 0}]` }
  }

  // Pattern B: separate wind_speed_10m_memberXX keys
  const memberKeys = Object.keys(hourly).filter(k =>
    /^wind_speed_10m_member\d+$/.test(k)
  )
  if (memberKeys.length > 0) {
    const arrays = memberKeys.map(mk =>
      ((hourly[mk] as number[]) ?? []).map(Number).filter(isFinite)
    )
    return { arrays, format: `separate_keys[${memberKeys.length}]` }
  }

  // Pattern C: 1D array (ensemble mean) — cannot compute spread
  if (Array.isArray(raw) && raw.length > 0) {
    const arr = (raw as number[]).map(Number).filter(isFinite)
    return { arrays: [arr], format: `1d_mean[${arr.length}]` }
  }

  return { arrays: [], format: "unknown" }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat  = parseFloat(searchParams.get("lat")  ?? "")
  const lng  = parseFloat(searchParams.get("lng")  ?? "")
  const days = Math.min(14, Math.max(1, parseInt(searchParams.get("days") ?? "7", 10)))

  const apiKey = process.env.OPEN_METEO_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      {
        error: "OPEN_METEO_API_KEY not configured",
        instructions: "Add OPEN_METEO_API_KEY=<your_key> to .env.local and restart. Requires a paid Open-Meteo subscription.",
      },
      { status: 402 }
    )
  }

  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "invalid lat/lng" }, { status: 400 })
  }

  const url = new URL(ENSEMBLE_BASE)
  url.searchParams.set("apikey",          apiKey)
  url.searchParams.set("latitude",        lat.toFixed(4))
  url.searchParams.set("longitude",       lng.toFixed(4))
  url.searchParams.set("models",          "ecmwf_ifs04")
  url.searchParams.set("hourly",          "wind_speed_10m")
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone",        "Asia/Taipei")
  url.searchParams.set("forecast_days",   String(days))

  const t0 = Date.now()
  let res: Response
  try {
    res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) })
  } catch (e) {
    return NextResponse.json({ error: "ensemble fetch failed", detail: String(e) }, { status: 502 })
  }

  const latency_ms = Date.now() - t0

  if (!res.ok) {
    const body = await res.text().catch(() => "")
    return NextResponse.json({ error: `upstream HTTP ${res.status}`, detail: body.slice(0, 200) }, { status: 502 })
  }

  const data = await res.json()
  const hourly = data.hourly as Record<string, unknown> | undefined
  if (!hourly?.time) {
    return NextResponse.json({ error: "unexpected response shape", raw_keys: Object.keys(data) }, { status: 502 })
  }

  const allHourlyKeys = Object.keys(hourly)
  const times: string[] = hourly.time as string[]

  // Resolve member data (handles 2D array, separate keys, and 1D mean)
  const { arrays: memberArrays, format: dataFormat } = resolveMemberArrays(hourly)

  // dateMap: date → array of each-member's daily-max wind (km/h)
  const dateMap = new Map<string, number[]>()

  for (const memberVals of memberArrays) {
    const dailyByDate = new Map<string, number[]>()
    for (let h = 0; h < Math.min(times.length, memberVals.length); h++) {
      const date = times[h].split("T")[0]
      const bucket = dailyByDate.get(date) ?? []
      bucket.push(memberVals[h])
      dailyByDate.set(date, bucket)
    }
    for (const [date, hrs] of dailyByDate) {
      const dayMax = Math.max(...hrs)
      const arr = dateMap.get(date) ?? []
      arr.push(dayMax)
      dateMap.set(date, arr)
    }
  }

  // Compute percentiles + confidence per day
  const forecast_days = Array.from(dateMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, vals]) => {
      const sorted = [...vals].sort((a, b) => a - b)
      const p10 = percentile(sorted, 0.1)
      const p50 = percentile(sorted, 0.5)
      const p90 = percentile(sorted, 0.9)
      const spread = p90 - p10
      // Confidence: 0 km/h spread = 100%, 30 km/h spread = 0%
      const forecast_confidence = Math.max(0, Math.min(100, Math.round((1 - spread / 30) * 100)))
      return {
        date,
        wind_p10_kmh:       Math.round(p10),
        wind_p50_kmh:       Math.round(p50),
        wind_p90_kmh:       Math.round(p90),
        wind_spread_kmh:    Math.round(spread),
        forecast_confidence,
        member_count:       vals.length,
      }
    })

  return NextResponse.json({
    model:        "ecmwf_ifs04",
    member_count: memberArrays.length,
    data_format:  dataFormat,
    lat, lng, days,
    latency_ms,
    forecast_days,
    _debug_hourly_keys: allHourlyKeys,
  })
}
