// ─── GET /api/overpass?lat=...&lng=... ────────────────────────────────────────
//
// Proxy to Overpass API to fetch building footprints near a coordinate.
// Avoids CORS issues from client-side requests.
// Returns the geometry of the nearest building polygon.

import { NextResponse } from "next/server"

const OVERPASS_URL = "https://overpass-api.de/api/interpreter"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const lat = searchParams.get("lat")
  const lng = searchParams.get("lng")

  if (!lat || !lng) {
    return NextResponse.json({ status: "error", reason: "missing lat/lng" }, { status: 400 })
  }

  const query = `
    [out:json][timeout:10];
    (
      way["building"](around:50, ${lat}, ${lng});
      relation["building"](around:50, ${lat}, ${lng});
    );
    out geom;
  `.trim()

  try {
    const res = await fetch(OVERPASS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `data=${encodeURIComponent(query)}`,
      next: { revalidate: 86400 }, // cache 24h — buildings don't move
    })

    if (!res.ok) {
      return NextResponse.json({ status: "error", reason: "overpass returned " + res.status })
    }

    const data = await res.json()
    const elements = data.elements ?? []

    // Find the closest building element with geometry
    let bestElement: { geometry: { lat: number; lon: number }[] } | null = null
    let bestDist = Infinity

    for (const el of elements) {
      if (!el.geometry || el.geometry.length < 3) continue
      // Use centroid for distance comparison
      const centroid = {
        lat: el.geometry.reduce((s: number, p: { lat: number }) => s + p.lat, 0) / el.geometry.length,
        lon: el.geometry.reduce((s: number, p: { lon: number }) => s + p.lon, 0) / el.geometry.length,
      }
      const dist = Math.hypot(centroid.lat - Number(lat), centroid.lon - Number(lng))
      if (dist < bestDist) {
        bestDist = dist
        bestElement = el
      }
    }

    if (!bestElement) {
      return NextResponse.json({ status: "not_found", elements_count: elements.length })
    }

    return NextResponse.json({
      status: "found",
      geometry: bestElement.geometry,
      elements_count: elements.length,
    })
  } catch {
    return NextResponse.json({ status: "error", reason: "network error" })
  }
}
