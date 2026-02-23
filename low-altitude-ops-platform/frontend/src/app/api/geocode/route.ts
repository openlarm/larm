// ─── GET /api/geocode?q=<address> ────────────────────────────────────────────
//
// Multi-strategy Taiwan geocoding:
//   1. Nominatim (OSM) — full address, then progressive truncation
//   2. NLSC (Taiwan MOI) — best local coverage; handles TWD97 → WGS84
//
// All providers are free with no API key required.

import { NextResponse } from "next/server"

const USER_AGENT = "GDS-LAOP-Mock/1.0 (demo only)"

// ─── Taiwan WGS84 bounding box ────────────────────────────────────────────────

function isWithinTaiwan(lat: number, lng: number): boolean {
  return lat >= 21.8 && lat <= 25.4 && lng >= 119.2 && lng <= 122.1
}

// ─── TWD97 TM2 Zone 1 (EPSG:3826) → WGS84 ───────────────────────────────────
//
// NLSC often returns TWD97 easting/northing even when EPSG:4326 is requested.
// TWD97 Zone 1: central meridian 121°E, false easting 250,000m, scale 0.9999.
// Typical Taiwan values: x≈150,000–320,000m, y≈2,400,000–2,850,000m.

function isTWD97Range(x: number, y: number): boolean {
  return x >= 100_000 && x <= 400_000 && y >= 2_300_000 && y <= 3_000_000
}

function twd97ToWGS84(easting: number, northing: number): { lat: number; lng: number } {
  const a = 6_378_137.0
  const f = 1.0 / 298.257_222_101
  const b = a * (1 - f)
  const e2 = 2 * f - f * f
  const e = Math.sqrt(e2)
  const k0 = 0.9999
  const lon0 = 121.0 * (Math.PI / 180)
  const FE = 250_000.0

  const x = easting - FE
  const y = northing

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))
  const M = y / k0
  const mu = M / (a * (1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256))

  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu)

  const sinPhi1 = Math.sin(phi1)
  const cosPhi1 = Math.cos(phi1)
  const tanPhi1 = Math.tan(phi1)

  const N1 = a / Math.sqrt(1 - e2 * sinPhi1 ** 2)
  const T1 = tanPhi1 ** 2
  const C1 = (e2 / (1 - e2)) * cosPhi1 ** 2
  const R1 = (a * (1 - e2)) / (1 - e2 * sinPhi1 ** 2) ** 1.5
  const D = x / (N1 * k0)

  const lat =
    phi1 -
    ((N1 * tanPhi1) / R1) *
    (D ** 2 / 2 -
      ((5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * (e2 / (1 - e2))) * D ** 4) / 24 +
      ((61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * (e2 / (1 - e2)) - 3 * C1 ** 2) *
        D ** 6) /
      720)

  const lon =
    lon0 +
    (D -
      ((1 + 2 * T1 + C1) * D ** 3) / 6 +
      ((5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * (e2 / (1 - e2)) + 24 * T1 ** 2) *
        D ** 5) /
      120) /
    cosPhi1

  return {
    lat: lat * (180 / Math.PI),
    lng: lon * (180 / Math.PI),
  }
}

// ─── Strategy 1: Nominatim ───────────────────────────────────────────────────

async function tryNominatim(q: string) {
  const url = new URL("https://nominatim.openstreetmap.org/search")
  url.searchParams.set("q", q)
  url.searchParams.set("format", "json")
  url.searchParams.set("countrycodes", "tw")
  url.searchParams.set("limit", "1")
  url.searchParams.set("addressdetails", "1")

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": USER_AGENT,
      "Accept-Language": "zh-TW,zh;q=0.9,en;q=0.8",
    },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null

  const results = await res.json()
  if (!Array.isArray(results) || results.length === 0) return null

  const item = results[0]
  const lat = parseFloat(item.lat)
  const lng = parseFloat(item.lon)

  if (!isWithinTaiwan(lat, lng)) return null

  const addr = item.address ?? {}
  return {
    lat,
    lng,
    district: addr.suburb ?? addr.city_district ?? addr.borough ?? addr.township ?? "",
    city: addr.city ?? addr.town ?? addr.county ?? addr.state ?? "",
    source: "nominatim",
    _display_name: item.display_name,
  }
}

// ─── Strategy 2: NLSC ────────────────────────────────────────────────────────

async function tryNLSC(q: string) {
  const url = new URL("https://geocoder.nlsc.gov.tw/query.aspx")
  url.searchParams.set("queryType", "26")
  url.searchParams.set("inPut", q)
  url.searchParams.set("oSRS", "EPSG:4326")
  url.searchParams.set("format", "JSON")

  const res = await fetch(url.toString(), {
    headers: { "User-Agent": USER_AGENT },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null

  let data: Record<string, unknown>
  try {
    data = await res.json()
  } catch {
    return null
  }

  // Try structured geometry first (EPSG:4326 array [lng, lat])
  const geom = data.theGeometry as { coordinates?: number[] } | undefined
  if (geom?.coordinates && geom.coordinates.length >= 2) {
    const lng = geom.coordinates[0]
    const lat = geom.coordinates[1]
    if (isWithinTaiwan(lat, lng)) {
      return {
        lat, lng,
        district: String(data.town ?? data.district ?? ""),
        city: String(data.city ?? data.county ?? ""),
        source: "nlsc",
      }
    }
  }

  // Fallback: raw x/y fields
  const rawX = parseFloat(String(data.x ?? data.X ?? ""))
  const rawY = parseFloat(String(data.y ?? data.Y ?? ""))
  if (!isFinite(rawX) || !isFinite(rawY)) return null

  // Detect TWD97 by magnitude and convert
  if (isTWD97Range(rawX, rawY)) {
    const wgs = twd97ToWGS84(rawX, rawY)
    if (!isWithinTaiwan(wgs.lat, wgs.lng)) return null
    return {
      lat: wgs.lat, lng: wgs.lng,
      district: String(data.town ?? data.district ?? ""),
      city: String(data.city ?? data.county ?? ""),
      source: "nlsc-converted",
    }
  }

  // Already WGS84
  if (isWithinTaiwan(rawY, rawX)) {
    return {
      lat: rawY, lng: rawX,
      district: String(data.town ?? data.district ?? ""),
      city: String(data.city ?? data.county ?? ""),
      source: "nlsc",
    }
  }

  return null
}

// ─── Progressive address truncation ──────────────────────────────────────────

function truncateVariants(q: string): string[] {
  const variants: string[] = [q]
  const noNumber = q.replace(/\d+(?:-\d+)?號.*$/, "").trim()
  if (noNumber && noNumber !== q) variants.push(noNumber)
  const noLane = noNumber.replace(/\d+[弄巷].*$/, "").trim()
  if (noLane && noLane !== noNumber) variants.push(noLane)
  return variants
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")

  if (!q || q.trim().length < 4) {
    return NextResponse.json({ status: "failed", reason: "query too short" }, { status: 400 })
  }

  const variants = truncateVariants(q.trim())

  for (const variant of variants) {
    try {
      const result = await tryNominatim(variant)
      if (result) return NextResponse.json({ ...result, raw: q, altitude_m: 0, status: "success" })
    } catch { /* continue */ }
  }

  try {
    const result = await tryNLSC(q.trim())
    if (result) return NextResponse.json({ ...result, raw: q, altitude_m: 0, status: "success" })
  } catch { /* continue */ }

  return NextResponse.json({
    status: "failed",
    reason: "找不到此地址，請確認格式為「縣市＋區＋路名＋門牌號」",
  })
}
