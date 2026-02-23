// ─── GET /api/geocode?q=<address> ────────────────────────────────────────────
//
// Multi-strategy Taiwan geocoding:
//   1. Nominatim (OSM) — full address
//   2. Nominatim — progressive truncation (remove house number, then district)
//   3. NLSC (National Land Surveying and Mapping Center, Taiwan) — best coverage
//
// All providers are free with no API key required.

import { NextResponse } from "next/server"

const USER_AGENT = "GDS-LAOP-Mock/1.0 (demo only)"

// ─── Strategy 1 & 2: Nominatim ───────────────────────────────────────────────

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
      "Accept": "application/json",
    },
    next: { revalidate: 3600 },
  })
  if (!res.ok) return null

  const results = await res.json()
  if (!Array.isArray(results) || results.length === 0) return null

  const item = results[0]
  const addr = item.address ?? {}

  return {
    lat: parseFloat(item.lat),
    lng: parseFloat(item.lon),
    district:
      addr.suburb ?? addr.city_district ?? addr.borough ??
      addr.county ?? addr.township ?? "",
    city:
      addr.city ?? addr.town ?? addr.county ?? addr.state ?? "",
    source: "nominatim",
    _display_name: item.display_name,
  }
}

// ─── Strategy 3: NLSC (Taiwan MOI) ───────────────────────────────────────────
// Endpoint: https://geocoder.nlsc.gov.tw/query.aspx
// Returns GeoJSON-like JSON with TWD97 or WGS84 coords.
// queryType=26 = address search, oSRS=EPSG:4326 = WGS84 output

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

  const text = await res.text()
  let data: Record<string, unknown>
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }

  // NLSC response: { "lgcode": "...", "x": "121.xxx", "y": "25.xxx", ... }
  const x = parseFloat(String(data.x ?? data.X ?? ""))
  const y = parseFloat(String(data.y ?? data.Y ?? ""))

  if (!isFinite(x) || !isFinite(y) || x === 0 || y === 0) return null

  // NLSC returns x=lng, y=lat in EPSG:4326
  return {
    lat: y,
    lng: x,
    district: String(data.district ?? data.town ?? ""),
    city: String(data.city ?? data.county ?? ""),
    source: "nlsc",
    _display_name: q,
  }
}

// ─── Progressive address truncation ──────────────────────────────────────────
// "台北市信義區松高路92號" → "台北市信義區松高路" → "台北市信義區"

function truncateVariants(q: string): string[] {
  const variants: string[] = [q]
  // Remove house number (e.g. "92號", "92-1號")
  const noNumber = q.replace(/\d+(?:-\d+)?號.*$/, "").trim()
  if (noNumber && noNumber !== q) variants.push(noNumber)
  // Remove lane/alley (弄/巷)
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

  // Strategy 1 & 2: Nominatim with progressive truncation
  for (const variant of variants) {
    try {
      const result = await tryNominatim(variant)
      if (result) {
        return NextResponse.json({ ...result, raw: q, altitude_m: 0, status: "success" })
      }
    } catch {
      // continue to next strategy
    }
  }

  // Strategy 3: NLSC — best coverage for Taiwan granular addresses
  try {
    const result = await tryNLSC(q.trim())
    if (result) {
      return NextResponse.json({ ...result, raw: q, altitude_m: 0, status: "success" })
    }
  } catch {
    // fall through
  }

  return NextResponse.json({
    status: "failed",
    reason: "找不到此地址，請確認地址格式正確（縣市＋鄉鎮區＋路名＋門牌）",
  })
}
