// ─── GET /api/weather/context?lat=&lng= ──────────────────────────────────────
//
// Reads from Supabase via @openlarm/ingest-builder and returns:
//   - weather_30d:         Weather30dInput     (30-day rolling stats from DB)
//   - weather_today:       WeatherTodayInput   (current conditions fused from DB)
//   - freshness:           "fresh" | "degraded" | "stale"
//   - source_breakdown:    Record<string, string>
//
// Deprecated (preserved for UI backward-compatibility, now always null):
//   - forecast:            null  (was: { date, weather_today }[] from Open-Meteo)
//   - cwa_cross_validation: null  (was: CWA cross-validation meta)
//   - _meta:               null  (was: meteo_plan / ensemble_days etc.)
//
// History: the original ~600-line Open-Meteo + CWA fetch handler is available
// via `git show HEAD~1:low-altitude-ops-platform/frontend/src/app/api/weather/context/route.ts`

import { NextResponse } from "next/server"
import { buildLARMInput, DataUnavailableError } from "@openlarm/ingest-builder"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: Request): Promise<NextResponse> {
  const url = new URL(req.url)
  const lat = parseFloat(url.searchParams.get("lat") ?? "")
  const lng = parseFloat(url.searchParams.get("lng") ?? "")

  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "lat,lng required" }, { status: 400 })
  }

  try {
    const result = await buildLARMInput(db, {
      lat,
      lng,
      when: new Date(),
      mission_meta: {},
    })

    return NextResponse.json({
      // New fields from Builder layer
      weather_30d: result.input.weather_30d,
      weather_today: result.input.weather_today,
      freshness: result.freshness,
      source_breakdown: result.source_breakdown,
      // Deprecated fields — kept null so existing UI consumers degrade gracefully
      // rather than throw on missing keys. Remove in Sprint 2 once consumers updated.
      forecast: null,
      cwa_cross_validation: null,
      _meta: null,
    })
  } catch (err) {
    if (err instanceof DataUnavailableError) {
      return NextResponse.json(
        { error: "data_unavailable", detail: err.message },
        { status: 503 },
      )
    }
    return NextResponse.json(
      { error: "internal_error", detail: String(err) },
      { status: 500 },
    )
  }
}
