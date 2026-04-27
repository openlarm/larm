export interface SourceResult {
  rows_written: number
  rows_rejected: number
  duration_ms: number
}

export interface SourceDeps {
  db: IngestDb
  now: () => Date
}

// Database interface — implementation in apps/ingest-worker
export interface IngestDb {
  upsertObservations(rows: import("./observations").NormalizedObservation[]): Promise<number>
  upsertForecasts(rows: import("./forecasts").NormalizedForecast[]): Promise<number>
  upsertEnsemble(rows: import("./forecasts").NormalizedEnsemble[]): Promise<number>
  upsertLightning(strikes: Array<{ ts: string; source: string; lat: number; lng: number; intensity_ka?: number | null; polarity?: string | null }>): Promise<number>
  recordFetchStart(source: string): Promise<{ id: number; startedAt: Date }>
  recordFetchEnd(id: number, status: "ok" | "partial" | "failed", payload: { rows_written?: number; rows_rejected?: number; error_message?: string; duration_ms: number }): Promise<void>
  getBudget(source: string): Promise<{ used: number; resetAt: Date }>
  incrementBudget(source: string, by: number): Promise<void>
}
