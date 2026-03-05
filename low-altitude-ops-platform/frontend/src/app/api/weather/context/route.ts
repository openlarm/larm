// ─── GET /api/weather/context?lat=&lng=&city= ────────────────────────────────
//
// Returns real rolling 30-day weather statistics (Weather30dInput) and
// a 14-day daily forecast (WeatherTodayInput[]) for the given coordinates.
//
// Data sources:
//   1. Open-Meteo Historical API    → 30-day hourly data → compute stats
//   2. Open-Meteo Forecast API      → 14-day daily forecast (+ wind direction)
//   3. Open-Meteo Ensemble API      → P10/P90/confidence per day (free + paid)
//   4. CWA F-C0032-001 (if key)    → enhance thunder_risk for near-term days
//   5. CWA F-D0047-091 (if key)    → township-level forecast (WS/WD/PoP12h) for cross-validation
//   6. CWA O-A0003-001 (if key)    → real-time observation from nearest station
//
// Paid Open-Meteo support (OPEN_METEO_API_KEY in .env.local):
//   Forecast  → customer-api.open-meteo.com           (no rate limit)
//   Archive   → customer-historical-forecast-api.open-meteo.com (IFS 9km, P1)
//   Ensemble  → customer-ensemble-api.open-meteo.com  (51-member ECMWF IFS)

import { NextResponse } from "next/server"
import type {
  Weather30dInput, WeatherTodayInput,
  CWAForecastDay, CWAObservation, CWACrossValidation,
  CWACrossValidationMeta, CrossValidationDivergence,
} from "@/lib/types"

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

function normalizeCityName(city: string): string {
  return city.replace(/台/g, "臺")
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
// Now also fetches wind_direction_10m_dominant for cross-validation

type ForecastDay = { date: string; weather_today: WeatherTodayInput }

async function fetchForecast(lat: number, lng: number, apiKey?: string): Promise<ForecastDay[]> {
  const url = new URL(meteoBase(!!apiKey, "forecast"))
  applyApiKey(url, apiKey)
  url.searchParams.set("latitude",  lat.toFixed(4))
  url.searchParams.set("longitude", lng.toFixed(4))
  url.searchParams.set(
    "daily",
    "wind_speed_10m_max,wind_gusts_10m_max,wind_direction_10m_dominant,precipitation_probability_max,precipitation_sum,weather_code"
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
    const windDir: number | null = daily.wind_direction_10m_dominant?.[i] ?? null
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
        wind_direction_deg:  windDir != null ? Math.round(windDir) : undefined,
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

// ─── Step D: CWA Thunder Enhancement (F-C0032-001) ──────────────────────────

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

// ─── Step E: CWA Township Forecast (F-D0047-091) ────────────────────────────
// Fetches WS, WD, PoP12h, Wx, MinT, MaxT for cross-validation with Open-Meteo.
// F-D0047-091 is a township-level (鄉鎮) dataset where:
//   records.Locations[] = counties (locationsName = "臺北市")
//   records.Locations[].Location[] = townships (locationName = "中正區")
// We match by county name (city param) then pick the first township.

interface CWATimeEntry {
  startTime: string
  endTime: string
  elementValue: Array<{ value: string; measures: string }>
}

interface CWAWeatherElement {
  elementName: string
  description: string
  time: CWATimeEntry[]
}

interface CWALocationData {
  locationName: string
  geocode: string
  lat: string
  lon: string
  weatherElement: CWAWeatherElement[]
}

interface CWALocationsGroup {
  locationsName: string
  dataid: string
  Location: CWALocationData[]
}

// Parse CWA wind speed text: "3" → m/s, convert to km/h. Handles "< 1" style.
function parseCWAWindSpeed(val: string): number | null {
  const cleaned = val.replace(/[<>≤≥]/g, "").trim()
  const num = parseFloat(cleaned)
  if (!isFinite(num)) return null
  return Math.round(num * 3.6)  // m/s → km/h
}

async function fetchCWAForecast(
  city: string,
  apiKey: string,
): Promise<Map<string, CWAForecastDay>> {
  // F-D0047-091: query without locationName to get county-grouped data,
  // then match by county name (locationsName) in the response.
  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/F-D0047-091")
  url.searchParams.set("Authorization", apiKey)
  url.searchParams.set("elementName", "WS,WD,PoP12h,Wx,MinT,MaxT")

  const res = await fetch(url.toString(), {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) return new Map()

  const data = await res.json()

  // F-D0047 response: records.Locations[] = array of county groups
  const locationsGroups: CWALocationsGroup[] = data?.records?.Locations ?? []
  if (locationsGroups.length === 0) return new Map()

  // Find the matching county by name (e.g. "臺北市")
  const normalizedCity = normalizeCityName(city)
  const matchingCounty = locationsGroups.find(
    g => g.locationsName === normalizedCity
  ) ?? locationsGroups[0]  // fallback to first county if no match

  const locations: CWALocationData[] = matchingCounty?.Location ?? []
  if (locations.length === 0) return new Map()

  // Use first township in the matched county
  const loc = locations[0]
  const elements = loc.weatherElement ?? []

  // Build element lookup: elementName → array of time entries
  const elMap = new Map<string, CWATimeEntry[]>()
  for (const el of elements) {
    elMap.set(el.elementName, el.time ?? [])
  }

  // Merge all elements by date (use startTime date as key)
  const result = new Map<string, CWAForecastDay>()
  const allDates = new Set<string>()

  // Collect all unique dates from WS (most reliable to have entries)
  const wsEntries = elMap.get("WS") ?? elMap.get("Wx") ?? []
  for (const entry of wsEntries) {
    const dateStr = (entry.startTime ?? "").split("T")[0].split(" ")[0]
    if (dateStr) allDates.add(dateStr)
  }

  // Helper: find the best value for a given element on a given date
  function findValue(elementName: string, date: string): string | null {
    const entries = elMap.get(elementName) ?? []
    for (const entry of entries) {
      const entryDate = (entry.startTime ?? "").split("T")[0].split(" ")[0]
      if (entryDate === date && entry.elementValue?.length > 0) {
        return entry.elementValue[0].value ?? null
      }
    }
    return null
  }

  for (const date of allDates) {
    const wsRaw = findValue("WS", date)
    const wdRaw = findValue("WD", date)
    const popRaw = findValue("PoP12h", date)
    const wxRaw = findValue("Wx", date)
    const minTRaw = findValue("MinT", date)
    const maxTRaw = findValue("MaxT", date)

    const day: CWAForecastDay = {
      wind_speed_kmh: wsRaw != null ? parseCWAWindSpeed(wsRaw) : null,
      wind_direction: wdRaw,
      rain_prob_12h: popRaw != null ? parseInt(popRaw, 10) || null : null,
      weather_desc: wxRaw,
      min_temp_c: minTRaw != null ? parseFloat(minTRaw) || null : null,
      max_temp_c: maxTRaw != null ? parseFloat(maxTRaw) || null : null,
    }

    // Only add if we have at least one meaningful value
    if (day.wind_speed_kmh != null || day.rain_prob_12h != null || day.weather_desc != null) {
      result.set(date, day)
    }
  }

  return result
}

// ─── Step F: CWA Real-Time Observation (O-A0003-001) ────────────────────────
// Fetches current conditions from nearest CWA weather station.
// Returns wind speed, wind direction, gust, temperature, humidity, precipitation.

async function fetchCWAObservation(
  lat: number,
  lng: number,
  apiKey: string,
): Promise<CWAObservation | null> {
  const url = new URL("https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0003-001")
  url.searchParams.set("Authorization", apiKey)

  const res = await fetch(url.toString(), {
    next: { revalidate: 600 },    // 10-min cache for real-time observation
    signal: AbortSignal.timeout(8_000),
  })
  if (!res.ok) return null

  const data = await res.json()
  interface StationRecord {
    StationName: string
    StationId: string
    ObsTime?: { DateTime?: string }
    GeoInfo?: { Coordinates?: Array<{ StationLatitude?: number; StationLongitude?: number }> }
    WeatherElement?: {
      WindDirection?: number
      WindSpeed?: number
      AirTemperature?: number
      RelativeHumidity?: number
      AirPressure?: number
      Weather?: string
    }
    GustInfo?: { PeakGustSpeed?: number }
    RainfallElement?: { Now?: { Precipitation?: number } }
  }
  const stations: StationRecord[] = data?.records?.Station ?? []
  if (stations.length === 0) return null

  // Find nearest station by Haversine-approximate distance
  let nearest: StationRecord | null = null
  let minDist = Infinity

  for (const st of stations) {
    const coords = st.GeoInfo?.Coordinates
    if (!coords || coords.length === 0) continue
    const stLat = coords[0].StationLatitude
    const stLng = coords[0].StationLongitude
    if (stLat == null || stLng == null) continue

    const dLat = (stLat - lat) * 111  // rough km per degree
    const dLng = (stLng - lng) * 111 * Math.cos(lat * Math.PI / 180)
    const dist = Math.sqrt(dLat * dLat + dLng * dLng)

    if (dist < minDist) {
      minDist = dist
      nearest = st
    }
  }

  if (!nearest) return null

  const we = nearest.WeatherElement
  const windSpeedMs = we?.WindSpeed
  const gustSpeedMs = nearest.GustInfo?.PeakGustSpeed
  const humidity = we?.RelativeHumidity

  return {
    station_name: nearest.StationName ?? "Unknown",
    station_id: nearest.StationId ?? "",
    observed_at: nearest.ObsTime?.DateTime ?? new Date().toISOString(),
    wind_speed_kmh: windSpeedMs != null && isFinite(windSpeedMs) ? Math.round(windSpeedMs * 3.6) : null,
    wind_direction_deg: we?.WindDirection != null && isFinite(we.WindDirection) ? we.WindDirection : null,
    gust_speed_kmh: gustSpeedMs != null && isFinite(gustSpeedMs) ? Math.round(gustSpeedMs * 3.6) : null,
    temperature_c: we?.AirTemperature != null && isFinite(we.AirTemperature) ? we.AirTemperature : null,
    humidity_pct: humidity != null && isFinite(humidity) ? Math.round(humidity) : null,
    precipitation_mm: nearest.RainfallElement?.Now?.Precipitation ?? null,
  }
}

// ─── Step G: Cross-Validation Engine ────────────────────────────────────────
// Compares Open-Meteo forecast with CWA forecast for each day.
// Flags divergences by severity so operators can assess data reliability.

function computeDivergence(
  omWind: number,
  omRainProb: number,
  cwa: CWAForecastDay,
): CrossValidationDivergence {
  const notes: string[] = []

  // Wind divergence
  const windDelta = cwa.wind_speed_kmh != null ? omWind - cwa.wind_speed_kmh : null
  if (windDelta != null) {
    const absWind = Math.abs(windDelta)
    if (absWind > 15) {
      notes.push(`風速差異大：Open-Meteo ${omWind} vs CWA ${cwa.wind_speed_kmh} km/h (差 ${windDelta > 0 ? "+" : ""}${windDelta})`)
    } else if (absWind > 8) {
      notes.push(`風速中度差異：OM ${omWind} vs CWA ${cwa.wind_speed_kmh} km/h`)
    }
  }

  // Rain probability divergence
  const rainDelta = cwa.rain_prob_12h != null ? omRainProb - cwa.rain_prob_12h : null
  if (rainDelta != null) {
    const absRain = Math.abs(rainDelta)
    if (absRain > 40) {
      notes.push(`降雨機率差異大：OM ${omRainProb}% vs CWA ${cwa.rain_prob_12h}%`)
    } else if (absRain > 20) {
      notes.push(`降雨機率中度差異：OM ${omRainProb}% vs CWA ${cwa.rain_prob_12h}%`)
    }
  }

  // Determine severity
  const absWindDelta = windDelta != null ? Math.abs(windDelta) : 0
  const absRainDelta = rainDelta != null ? Math.abs(rainDelta) : 0

  let severity: "low" | "medium" | "high" = "low"
  if (absWindDelta > 15 || absRainDelta > 40) {
    severity = "high"
  } else if (absWindDelta > 8 || absRainDelta > 20) {
    severity = "medium"
  }

  // Check if CWA weather description contains severe weather keywords
  if (cwa.weather_desc) {
    const severe = ["雷", "暴", "豪雨", "大雨", "颱", "強風"]
    for (const kw of severe) {
      if (cwa.weather_desc.includes(kw)) {
        notes.push(`CWA 預報含嚴重天氣：「${cwa.weather_desc}」`)
        if (severity === "low") severity = "medium"
        break
      }
    }
  }

  if (notes.length === 0) {
    notes.push("Open-Meteo 與 CWA 預報一致")
  }

  return {
    wind_delta_kmh: windDelta,
    rain_prob_delta: rainDelta,
    severity,
    notes,
  }
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
  const cwaKey   = process.env.CWA_API_KEY || undefined

  // Phase 1: Fetch Open-Meteo sources in parallel
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

  // Phase 2: Fetch CWA data in parallel (all optional, enhancement-only)
  const cwaDataSources: string[] = []
  let cwaObservation: CWAObservation | null = null
  let maxDivergenceSeverity: "low" | "medium" | "high" | "none" = "none"
  let cwaCoverage = 0

  if (cwaKey) {
    const cwaPromises: [
      Promise<Map<string, 1>>,
      Promise<Map<string, CWAForecastDay>>,
      Promise<CWAObservation | null>,
    ] = [
      city ? fetchCWAThunder(city, cwaKey).catch(() => new Map<string, 1>()) : Promise.resolve(new Map<string, 1>()),
      city ? fetchCWAForecast(city, cwaKey).catch(() => new Map<string, CWAForecastDay>()) : Promise.resolve(new Map<string, CWAForecastDay>()),
      fetchCWAObservation(lat, lng, cwaKey).catch(() => null),
    ]

    const [thunderMap, cwaForecastMap, observation] = await Promise.all(cwaPromises)

    // D: Thunder enhancement
    if (thunderMap.size > 0) {
      cwaDataSources.push("F-C0032-001")
      for (const day of forecast) {
        if (thunderMap.has(day.date)) day.weather_today.thunder_risk = 1
      }
    }

    // E: CWA forecast cross-validation
    if (cwaForecastMap.size > 0) {
      cwaDataSources.push("F-D0047-091")
      for (const day of forecast) {
        const cwaDay = cwaForecastMap.get(day.date)
        if (cwaDay) {
          cwaCoverage++
          const divergence = computeDivergence(
            day.weather_today.wind_now_kmh,
            day.weather_today.rain_prob_today_pct,
            cwaDay,
          )

          day.weather_today.cwa_cross = {
            cwa_forecast: cwaDay,
            divergence,
          }

          // Track max severity
          if (divergence.severity === "high") maxDivergenceSeverity = "high"
          else if (divergence.severity === "medium" && maxDivergenceSeverity !== "high") maxDivergenceSeverity = "medium"
          else if (divergence.severity === "low" && maxDivergenceSeverity === "none") maxDivergenceSeverity = "low"
        }
      }
    }

    // F: Real-time observation
    if (observation) {
      cwaDataSources.push("O-A0003-001")
      cwaObservation = observation
    }
  }

  // Build CWA cross-validation meta
  const cwa_cross_validation: CWACrossValidationMeta = {
    enabled: !!cwaKey,
    observation: cwaObservation,
    forecast_coverage: cwaCoverage,
    max_divergence_severity: maxDivergenceSeverity,
    data_sources: cwaDataSources,
  }

  return NextResponse.json({
    weather_30d,
    forecast,
    cwa_cross_validation,
    _meta: {
      meteo_plan:    meteoKey ? "paid" : "free",
      ensemble_days: ensembleMap.size,
      cwa_enabled:   !!cwaKey,
      cwa_sources:   cwaDataSources.length,
    },
  })
}
