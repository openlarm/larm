import { z } from "zod"
import type { NormalizedObservation, SourceDeps, SourceResult } from "@openlarm/ingest-types"

const EPA_AQ_URL = "https://data.moenv.gov.tw/api/v2/aqx_p_488"

const RecSchema = z.object({
  siteid: z.string(),
  sitename: z.string(),
  publishtime: z.string(),
  wind_speed: z.string(),
  wind_direc: z.string(),
  longitude: z.string(),
  latitude: z.string(),
})

// Envelope-loose: only assert that records is an array of unknowns
const EnvelopeSchema = z.object({
  records: z.array(z.unknown()),
})

const MS_TO_KMH = 3.6

function parseFloatOrNull(s: string): number | null {
  if (!s.trim()) return null
  const v = parseFloat(s)
  return isFinite(v) ? v : null
}

export async function runEpaAq(deps: SourceDeps): Promise<SourceResult> {
  const apiKey = process.env.EPA_API_KEY
  const url = new URL(EPA_AQ_URL)
  if (apiKey) url.searchParams.set("api_key", apiKey)
  url.searchParams.set("format", "json")
  url.searchParams.set("limit", "1000")

  const t0 = Date.now()

  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!res.ok) throw new Error(`EPA HTTP ${res.status}`)
  const envelope = EnvelopeSchema.parse(await res.json())

  const accepted: NormalizedObservation[] = []
  let rejected = 0

  for (const raw of envelope.records) {
    const recResult = RecSchema.safeParse(raw)
    if (!recResult.success) {
      rejected++
      continue
    }
    const rec = recResult.data

    const ws = parseFloatOrNull(rec.wind_speed)
    if (ws === null) {
      rejected++
      continue
    }

    const lat = parseFloatOrNull(rec.latitude)
    const lng = parseFloatOrNull(rec.longitude)
    if (lat === null || lng === null) {
      rejected++
      continue
    }

    const wd = parseFloatOrNull(rec.wind_direc)

    accepted.push({
      ts: new Date(rec.publishtime.replace(" ", "T") + "+08:00").toISOString(),
      source: "epa_aq",
      station_id: rec.siteid,
      lat,
      lng,
      wind_kmh: ws * MS_TO_KMH,
      wind_dir_deg: wd,
      qc_flags: { bias_corrected: false, outlier: false },
    })
  }

  const written = await deps.db.upsertObservations(accepted)
  return { rows_written: written, rows_rejected: rejected, duration_ms: Date.now() - t0 }
}
