import type { SourceDeps, SourceResult } from "@openlarm/ingest-types"
import type { StorageClient } from "../util/storage"

interface RadarDeps extends SourceDeps {
  storage: StorageClient
}

const RADAR_URL = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0058-003"
const BBOX_WKT = "POLYGON((118 20, 124 20, 124 26, 118 26, 118 20))"

export async function runCwaRadar(deps: RadarDeps): Promise<SourceResult> {
  const apiKey = process.env.CWA_API_KEY
  if (!apiKey) throw new Error("CWA_API_KEY required")

  const log = await deps.db.recordFetchStart("cwa_radar")
  const t0 = Date.now()

  try {
    const url = new URL(RADAR_URL)
    url.searchParams.set("Authorization", apiKey)
    url.searchParams.set("format", "PNG")

    const res = await fetch(url.toString(), { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`CWA radar HTTP ${res.status}`)

    const blob = await res.blob()

    const now = deps.now()
    const dateFolder = now.toISOString().slice(0, 10)
    const timestamp = now
      .toISOString()
      .replace(/[-:T]/g, "")
      .replace(/\.\d+Z$/, "")
      .slice(0, 14)
    const path = `${dateFolder}/cwa-radar-${timestamp}.png`

    const uploaded = await deps.storage.upload(path, blob, { contentType: "image/png" })

    await deps.db.insertGridded({
      ts: now.toISOString(),
      source: "cwa_radar",
      variable: "reflect",
      bbox_wkt: BBOX_WKT,
      storage_url: uploaded.fullPath,
      raw_metadata: { content_type: "image/png", bytes: uploaded.size },
    })

    const duration_ms = Date.now() - t0
    await deps.db.recordFetchEnd(log.id, "ok", {
      rows_written: 1,
      rows_rejected: 0,
      duration_ms,
    })
    return { rows_written: 1, rows_rejected: 0, duration_ms }
  } catch (err) {
    const error_message =
      err instanceof Error ? `${err.message}\n${err.stack ?? ""}` : String(err)
    await deps.db.recordFetchEnd(log.id, "failed", {
      error_message,
      duration_ms: Date.now() - t0,
    })
    throw err
  }
}
