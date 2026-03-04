// ─── GET /api/weather/health ──────────────────────────────────────────────────
//
// Diagnostic endpoint — tests Open-Meteo APIs and all CWA data sources.
// Returns per-service status so you can verify API keys are working.
//
// CWA services tested:
//   - F-C0032-001: County-level weather forecast (thunder detection)
//   - F-D0047-091: Township-level forecast (WS/WD/PoP12h cross-validation)
//   - O-A0003-001: Real-time station observation (nearest station)
//
// Usage:
//   curl http://localhost:3000/api/weather/health | jq

import { NextResponse } from "next/server"

const TEST_LAT = 25.0336  // Taipei
const TEST_LNG = 121.5636
const TEST_CITY = "臺北市"

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
    ? "https://customer-historical-forecast-api.open-meteo.com/v1/forecast"
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

async function checkEnsemble(apiKey: string | undefined): Promise<ServiceStatus> {
  // Ensemble works on both free and paid tiers
  const paid = !!apiKey
  const base = paid
    ? "https://customer-ensemble-api.open-meteo.com/v1/ensemble"
    : "https://ensemble-api.open-meteo.com/v1/ensemble"

  const url = new URL(base)
  if (apiKey) url.searchParams.set("apikey", apiKey)
  url.searchParams.set("latitude",  TEST_LAT.toString())
  url.searchParams.set("longitude", TEST_LNG.toString())
  url.searchParams.set("models",    "ecmwf_ifs025")
  url.searchParams.set("hourly",    "wind_speed_10m")
  url.searchParams.set("wind_speed_unit", "kmh")
  url.searchParams.set("timezone",  "Asia/Taipei")
  url.searchParams.set("forecast_days", "2")

  const t0 = Date.now()
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(12_000) })
    const latency_ms = Date.now() - t0
    if (!res.ok) {
      const body = await res.text().catch(() => "")
      return { ok: false, endpoint: base, plan: paid ? "paid" : "free", latency_ms, error: `HTTP ${res.status}: ${body.slice(0, 120)}` }
    }
    const data = await res.json()
    const hourly = data.hourly ?? {}
    const memberKeys: string[] = Object.keys(hourly).filter((k: string) =>
      /^wind_speed_10m_member\d+$/.test(k)
    )
    const memberCount = memberKeys.length
    const hourCount: number = Array.isArray(hourly.wind_speed_10m)
      ? (hourly.wind_speed_10m as unknown[]).length
      : 0
    return {
      ok: memberCount > 0 || hourCount > 0,
      endpoint: base,
      plan: paid ? "paid" : "free",
      latency_ms,
      sample: { members: memberCount, hours: hourCount, model: "ecmwf_ifs025" },
    }
  } catch (e) {
    return { ok: false, endpoint: base, plan: paid ? "paid" : "free", latency_ms: Date.now() - t0, error: String(e) }
  }
}

// ─── CWA Health Checks ───────────────────────────────────────────────────────

async function checkCWAThunder(apiKey: string | undefined): Promise<ServiceStatus> {
  const endpoint = "opendata.cwa.gov.tw/F-C0032-001"
  if (!apiKey) {
    return { ok: false, endpoint, plan: "n/a", latency_ms: null, error: "CWA_API_KEY not set" }
  }
  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-C0032-001")
  url.searchParams.set("Authorization", apiKey)
  url.searchParams.set("locationName", TEST_CITY)
  url.searchParams.set("elementName", "Wx")

  const t0 = Date.now()
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(6_000) })
    const latency_ms = Date.now() - t0
    if (!res.ok) {
      return { ok: false, endpoint, plan: "n/a", latency_ms, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    const timeCount: number = data?.records?.location?.[0]?.weatherElement?.[0]?.time?.length ?? 0
    return {
      ok: timeCount > 0,
      endpoint,
      plan: "n/a",
      latency_ms,
      sample: { dataset: "F-C0032-001", forecast_periods: timeCount, purpose: "thunder_detection" },
    }
  } catch (e) {
    return { ok: false, endpoint, plan: "n/a", latency_ms: Date.now() - t0, error: String(e) }
  }
}

async function checkCWAForecast(apiKey: string | undefined): Promise<ServiceStatus> {
  const endpoint = "opendata.cwa.gov.tw/F-D0047-091"
  if (!apiKey) {
    return { ok: false, endpoint, plan: "n/a", latency_ms: null, error: "CWA_API_KEY not set" }
  }
  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-091")
  url.searchParams.set("Authorization", apiKey)
  url.searchParams.set("locationName", TEST_CITY)
  url.searchParams.set("elementName", "WS,WD,PoP12h")

  const t0 = Date.now()
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) })
    const latency_ms = Date.now() - t0
    if (!res.ok) {
      return { ok: false, endpoint, plan: "n/a", latency_ms, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    const locations = data?.records?.Locations?.[0]?.Location ?? data?.records?.locations?.[0]?.location ?? []
    const elCount: number = locations[0]?.weatherElement?.length ?? 0
    const windEntries: number = locations[0]?.weatherElement?.[0]?.time?.length ?? 0
    return {
      ok: elCount > 0,
      endpoint,
      plan: "n/a",
      latency_ms,
      sample: { dataset: "F-D0047-091", elements: elCount, wind_entries: windEntries, purpose: "cross_validation" },
    }
  } catch (e) {
    return { ok: false, endpoint, plan: "n/a", latency_ms: Date.now() - t0, error: String(e) }
  }
}

async function checkCWAObservation(apiKey: string | undefined): Promise<ServiceStatus> {
  const endpoint = "opendata.cwa.gov.tw/O-A0003-001"
  if (!apiKey) {
    return { ok: false, endpoint, plan: "n/a", latency_ms: null, error: "CWA_API_KEY not set" }
  }
  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001")
  url.searchParams.set("Authorization", apiKey)

  const t0 = Date.now()
  try {
    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(8_000) })
    const latency_ms = Date.now() - t0
    if (!res.ok) {
      return { ok: false, endpoint, plan: "n/a", latency_ms, error: `HTTP ${res.status}` }
    }
    const data = await res.json()
    const stations: Array<{ StationName?: string }> = data?.records?.Station ?? []
    const sampleStation = stations[0]?.StationName ?? null
    return {
      ok: stations.length > 0,
      endpoint,
      plan: "n/a",
      latency_ms,
      sample: { dataset: "O-A0003-001", station_count: stations.length, sample_station: sampleStation, purpose: "realtime_observation" },
    }
  } catch (e) {
    return { ok: false, endpoint, plan: "n/a", latency_ms: Date.now() - t0, error: String(e) }
  }
}

export async function GET() {
  const meteoKey = process.env.OPEN_METEO_API_KEY || undefined
  const cwaKey   = process.env.CWA_API_KEY || undefined

  const [forecast, archive, ensemble, cwaThunder, cwaForecast, cwaObservation] = await Promise.all([
    checkForecast(meteoKey),
    checkArchive(meteoKey),
    checkEnsemble(meteoKey),
    checkCWAThunder(cwaKey),
    checkCWAForecast(cwaKey),
    checkCWAObservation(cwaKey),
  ])

  const allOk = forecast.ok && archive.ok

  const instructions = [
    meteoKey
      ? "Using paid Open-Meteo commercial endpoints. Forecast: customer-api | Archive: customer-historical-forecast-api (IFS 9km, P1) | Ensemble: customer-ensemble-api (ecmwf_ifs025, 50 members)."
      : "Using free Open-Meteo endpoints (rate-limited). Ensemble available on free tier (ecmwf_ifs025, lower rate limit). To activate paid plan: add OPEN_METEO_API_KEY=<your_key> to .env.local and restart.",
    cwaKey
      ? "CWA enabled: thunder detection (F-C0032-001), township forecast cross-validation (F-D0047-091), real-time observation (O-A0003-001)."
      : "CWA disabled: add CWA_API_KEY to .env.local for thunder detection, forecast cross-validation, and real-time station data.",
  ].join(" ")

  return NextResponse.json(
    {
      status:   allOk ? "ok" : "degraded",
      meteo_plan: meteoKey ? "paid" : "free",
      cwa_enabled: !!cwaKey,
      checked_at: new Date().toISOString(),
      services: {
        // Open-Meteo
        forecast,
        archive,
        ensemble,
        // CWA
        cwa_thunder: cwaThunder,
        cwa_forecast: cwaForecast,
        cwa_observation: cwaObservation,
      },
      instructions,
    },
    { status: allOk ? 200 : 207 }
  )
}
