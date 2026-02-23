// ─── GET /api/geocode?q=<address> ────────────────────────────────────────────
//
// Proxy to Nominatim (OpenStreetMap) for Taiwan address geocoding.
// Free, no API key required. Rate limit: 1 req/sec — adequate for this demo.
//
// Returns AddressResult-compatible JSON.

import { NextResponse } from "next/server"

const NOMINATIM_BASE = "https://nominatim.openstreetmap.org"
const USER_AGENT = "GDS-LAOP-Mock/1.0 (demo only)"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get("q")

  if (!q || q.trim().length < 4) {
    return NextResponse.json({ status: "failed", reason: "query too short" }, { status: 400 })
  }

  try {
    const url = new URL(`${NOMINATIM_BASE}/search`)
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
      next: { revalidate: 3600 }, // cache 1hr — addresses don't move
    })

    if (!res.ok) {
      return NextResponse.json({ status: "failed", reason: "nominatim error" })
    }

    const results = await res.json()

    if (!Array.isArray(results) || results.length === 0) {
      return NextResponse.json({ status: "failed", reason: "not found" })
    }

    const item = results[0]
    const addr = item.address ?? {}

    // Map Nominatim fields → AddressResult
    const district =
      addr.suburb ??
      addr.city_district ??
      addr.borough ??
      addr.county ??
      addr.township ??
      ""

    const city =
      addr.city ??
      addr.town ??
      addr.county ??
      addr.state ??
      ""

    return NextResponse.json({
      raw: q,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      altitude_m: 0, // Nominatim does not provide elevation
      district,
      city,
      status: "success",
      // Extra: full display_name for debugging
      _display_name: item.display_name,
    })
  } catch {
    return NextResponse.json({ status: "failed", reason: "network error" })
  }
}
