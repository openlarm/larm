import cron from "node-cron"
import {
  runCwaAws,
  runCwaRainfall,
  runCwaRadar,
  runEpaAq,
  runOpenMeteoForecast,
  runOpenMeteoArchive,
} from "@openlarm/ingest-sources"
import type { IngestDb, SourceResult, SourceDeps } from "@openlarm/ingest-types"

// Minimal storage interface matching @openlarm/ingest-sources StorageClient.
// Inlined here because StorageClient is not re-exported from the package index.
interface StorageClient {
  upload(
    path: string,
    body: Blob,
    opts?: { contentType?: string }
  ): Promise<{ path: string; fullPath: string; size: number }>
}

export interface ScheduleEntry {
  cron: string
  name: string
  run: (deps: { db: IngestDb; now: () => Date }) => Promise<SourceResult>
}

// Default target location (Taipei) used by forecast/archive stubs.
// In Sprint 2 these will be replaced by a frequent_sites loop in index.ts.
const DEFAULT_TARGET = { lat: 25.05, lng: 121.53 }

// No-op storage stub for radar — real storage client injected in production via env.
const noopStorage: StorageClient = {
  upload: async () => { throw new Error("storage not configured") },
}

export function buildSchedule(): ScheduleEntry[] {
  return [
    { cron: "*/10 * * * *", name: "cwa_aws", run: runCwaAws },
    { cron: "*/10 * * * *", name: "cwa_rainfall", run: runCwaRainfall },
    {
      cron: "*/10 * * * *",
      name: "cwa_radar",
      run: (deps: SourceDeps) => runCwaRadar({ ...deps, storage: noopStorage }),
    },
    { cron: "0 * * * *", name: "epa_aq", run: runEpaAq },
    // Forecast / archive jobs use a default Taipei target.
    // Production frequent_sites loop is deferred to Sprint 2.
    {
      cron: "0 */3 * * *",
      name: "open_meteo_forecast",
      run: (deps: SourceDeps) => runOpenMeteoForecast(deps, DEFAULT_TARGET),
    },
    {
      cron: "0 2 * * *",
      name: "open_meteo_archive",
      run: (deps: SourceDeps) => runOpenMeteoArchive(deps, { ...DEFAULT_TARGET, days: 30 }),
    },
  ]
}

export async function runOnceForTest(
  job: { name: string; run: (deps: { db: IngestDb; now: () => Date }) => Promise<SourceResult> },
  db: IngestDb
): Promise<{ status: "ok" | "failed"; result?: SourceResult; error?: string }> {
  const log = await db.recordFetchStart(job.name)
  const t0 = Date.now()
  try {
    const result = await job.run({ db, now: () => new Date() })
    await db.recordFetchEnd(log.id, "ok", { ...result, duration_ms: Date.now() - t0 })
    return { status: "ok", result }
  } catch (err) {
    await db.recordFetchEnd(log.id, "failed", {
      error_message: String(err),
      duration_ms: Date.now() - t0,
    })
    return { status: "failed", error: String(err) }
  }
}

export function startScheduler(db: IngestDb, schedule: ScheduleEntry[]): void {
  for (const job of schedule) {
    let running = false
    cron.schedule(
      job.cron,
      async () => {
        if (running) return
        running = true
        try {
          await runOnceForTest(job, db)
        } finally {
          running = false
        }
      },
      { timezone: "Asia/Taipei" }
    )
  }
}
