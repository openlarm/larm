// ─── GET /api/weather/health ──────────────────────────────────────────────────
//
// Diagnostic endpoint — tests both Open-Meteo APIs and CWA.
// Returns per-service status so you can verify your API key is working.
//
// Usage:
//   curl http://localhost:3000/api/weather/health | jq
//   or open in browser: http://localhost:3000/api/weather/health

import { NextResponse } from "next/server"

const TEST_LAT = 25.0336  // Taipei
const TEST_LNG = 121.5636

interface ServiceStatus {
  ok: boolean
  endpoint: string
  plan: "paid" | "free" | "n/a"
  latency_ms: number | null
  error?: string
  sample?: Record<string, unknown>
}

async function checkForecast(apiKey: string | undefined): Promise<ServiceStatus> {
  const paid = !!apiKey
  const base = paid
    ? "https://customer-api.open-meteo.com/v1/forecast"
    : "https://api.open-meteo.com/v1/forecast"

  const url = new URL(base)
  if (apiKey) url.searchParams.set("apikey", apiKey)
  url.searchParams.set("latitude",  TEST_LAT.toString())
  url.searchParams.set("longitude", TEST_LNG.toString())
  url.searchParams.set("daily", "wind_speed_10m_max,precipitation_probability_max")
  url.searchParams.set("timezone", "Asia/Taipei")
  url.searchParams.set("forecast_days", "3")

  const t0 = Date.now()
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) })
    const latency_ms = Date.now() - t0
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { ok: false, endpoint: base, plan: paid ? "paid" : "free", latency_ms, error: `HTTP ${res.status}: ${body.slice(0, 120)}` }
    }
    const data = await res.json()
    const dates: string[] = data.daily?.time ?? []
    return {
      ok: true,
      endpoint: base,
      plan: paid ? "paid" : "free",
      latency_ms,
      sample: { dates_returned: dates.length, first_date: dates[0] ?? null },
    }
  } catch (e) {
    return { ok: false, endpoint: base, plan: paid ? "paid" : "free", latency_ms: Date.now() - t0, error: String(e) }
  }
}

async function checkArchive(apiKey: string | undefined): Promise<ServiceStatus> {
  const paid = !!apiKey
  const base = paid
    ? "https://customer-archive-api.open-meteo.com/v1/archive"
    : "https://archive-api.open-meteo.com/v1/archive"

  const now = new Date()
  const end = new Date(now); end.setDate(end.getDate() - 1)
  const start = new Date(end); start.setDate(start.getDate() - 2)
  const fmt = (d: Date) => d.toISOString().split("T")[0]

  const url = new URL(base)
  if (apiKey) url.searchParams.set("apikey", apiKey)
  url.searchParams.set("latitude",   TEST_LAT.toString())
  url.searchParams.set("longitude",  TEST_LNG.toString())
  url.searchParams.set("start_date", fmt(start))
  url.searchParams.set("end_date",   fmt(end))
  url.searchParams.set("hourly",     "wind_speed_10m")
  url.searchParams.set("timezone",   "Asia/Taipei")

  const t0 = Date.now()
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) })
    const latency_ms = Date.now() - t0
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { ok: false, endpoint: base, plan: paid ? "paid" : "free", latency_ms, error: `HTTP ${res.status}: ${body.slice(0, 120)}` }
    }
    const data = await res.json()
    const hours: number[] = data.hourly?.wind_speed_10m ?? []
    return {
      ok: true,
      endpoint: base,
      plan: paid ? "paid" : "free",
      latency_ms,
      sample: { hourly_rows: hours.length, wind_sample_kmh: hours.slice(0, 3) },
    }
  } catch (e) {
    return { ok: false, endpoint: base, plan: paid ? "paid" : "free", latency_ms: Date.now() - t0, error: String(e) }
  }
}

async function checkCWA(apiKey: string | undefined): Promise<ServiceStatus> {
  if (!apiKey) {
    return { ok: false, endpoint: "opendata.cwa.gov.tw", plan: "n/a", latency_ms: null, error: "CWA_API_KEY not set" }
  }
  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001")
  url.searchParams.set("Authorization", apiKey)
  url.searchParams.set("locationName", "臺北市")
  url.searchParams.set("elementName", "Wx")

  const t0 = Date.now()
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6_000) })
    const latency_ms = Date.now() - t0
    if (!res.ok) {
      return { ok: false, endpoint: "opendata.cwa.gov.tw", plan: "n/a", latency_ms, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    const timeCount: number = data?.records?.location?.[0]?.weatherElement?.[0]?.time?.length ?? 0
    return {
      ok: timeCount > 0,
      endpoint: "opendata.cwa.gov.tw",
      plan: "n/a",
      latency_ms,
      sample: { forecast_periods: timeCount },
    }
  } catch (e) {
    return { ok: false, endpoint: "opendata.cwa.gov.tw", plan: "n/a", latency_ms: Date.now() - t0, error: String(e) }
  }
}

export async function GET() {
  const meteoKey = process.env.OPEN_METEO_API_KEY || undefined
  const cwaKey   = process.env.CWA_API_KEY || undefined

  const [forecast, archive, cwa] = await Promise.all([
    checkForecast(meteoKey),
    checkArchive(meteoKey),
    checkCWA(cwaKey),
  ])

  const allOk = forecast.ok && archive.ok

  return NextResponse.json(
    {
      status:   allOk ? "ok" : "degraded",
      meteo_plan: meteoKey ? "paid" : "free",
      checked_at: new Date().toISOString(),
      services: { forecast, archive, cwa },
      instructions: meteoKey
        ? "Using paid Open-Meteo commercial endpoints (customer-api / customer-archive-api)"
        : [
            "Using free Open-Meteo endpoints (rate-limited).",
            "To activate paid plan: add OPEN_METEO_API_KEY=<your_key> to .env.local and restart.",
          ].join(" "),
    },
    { status: allOk ? 200 : 207 }
  )
}
