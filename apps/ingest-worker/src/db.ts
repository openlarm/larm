import postgres from "postgres"
import type {
  IngestDb,
  NormalizedObservation,
  NormalizedForecast,
  NormalizedEnsemble,
} from "@openlarm/ingest-types"

type Sql = ReturnType<typeof postgres>

// Helper: safely cast unknown to JSONValue expected by sql.json()
function toJson(v: unknown): postgres.JSONValue {
  return v as postgres.JSONValue
}

/** Upsert observations in chunks of 500 using per-row VALUES. */
async function upsertObsBatch(sql: Sql, batch: NormalizedObservation[]): Promise<number> {
  // Build a VALUES list with raw SQL fragments for the geometry column.
  // Each row becomes: ($ts, $source, $station_id, ST_GeogFromText(...), ...)
  const fragments = batch.map((r) => sql`
    (
      ${r.ts}, ${r.source}, ${r.station_id},
      ST_GeographyFromText(${"SRID=4326;POINT(" + r.lng + " " + r.lat + ")"}),
      ${r.wind_kmh ?? null}, ${r.wind_dir_deg ?? null}, ${r.gust_kmh ?? null},
      ${r.temp_c ?? null}, ${r.rh_pct ?? null}, ${r.pressure_hpa ?? null},
      ${r.rain_mm_10min ?? null}, ${r.rain_mm_1h ?? null}, ${r.rain_mm_24h ?? null},
      ${r.qc_flags != null ? sql.json(toJson(r.qc_flags)) : null},
      ${r.raw_payload != null ? sql.json(toJson(r.raw_payload)) : null}
    )
  `)

  // Join fragments with commas
  const values = fragments.reduce((acc, frag, idx) =>
    idx === 0 ? frag : sql`${acc}, ${frag}`
  )

  const result = await sql`
    INSERT INTO observations_point
      (ts, source, station_id, geom,
       wind_kmh, wind_dir_deg, gust_kmh, temp_c, rh_pct, pressure_hpa,
       rain_mm_10min, rain_mm_1h, rain_mm_24h, qc_flags, raw_payload)
    VALUES ${values}
    ON CONFLICT (ts, source, station_id) DO UPDATE SET
      wind_kmh = EXCLUDED.wind_kmh,
      wind_dir_deg = EXCLUDED.wind_dir_deg,
      gust_kmh = EXCLUDED.gust_kmh,
      temp_c = EXCLUDED.temp_c,
      rh_pct = EXCLUDED.rh_pct,
      pressure_hpa = EXCLUDED.pressure_hpa,
      rain_mm_10min = EXCLUDED.rain_mm_10min,
      rain_mm_1h = EXCLUDED.rain_mm_1h,
      rain_mm_24h = EXCLUDED.rain_mm_24h
  `
  return result.count ?? batch.length
}

/** Upsert forecasts in chunks of 500. */
async function upsertForecastBatch(sql: Sql, batch: NormalizedForecast[]): Promise<number> {
  const fragments = batch.map((row) => sql`
    (
      ${row.issued_at}, ${row.valid_at}, ${row.source},
      ST_GeographyFromText(${"SRID=4326;POINT(" + row.lng + " " + row.lat + ")"}),
      ${row.region_id ?? null}, ${row.wind_kmh ?? null}, ${row.wind_dir_deg ?? null},
      ${row.gust_kmh ?? null}, ${row.rain_prob_pct ?? null}, ${row.rain_mmph ?? null},
      ${row.weather_code ?? null},
      ${row.raw_payload != null ? sql.json(toJson(row.raw_payload)) : null}
    )
  `)

  const values = fragments.reduce((acc, frag, idx) =>
    idx === 0 ? frag : sql`${acc}, ${frag}`
  )

  const r = await sql`
    INSERT INTO forecast_point
      (issued_at, valid_at, source, geom, region_id,
       wind_kmh, wind_dir_deg, gust_kmh, rain_prob_pct, rain_mmph,
       weather_code, raw_payload)
    VALUES ${values}
    ON CONFLICT (issued_at, valid_at, source, COALESCE(region_id, ''), ST_AsText(geom::geometry))
    DO UPDATE SET
      wind_kmh = EXCLUDED.wind_kmh,
      gust_kmh = EXCLUDED.gust_kmh,
      rain_prob_pct = EXCLUDED.rain_prob_pct,
      rain_mmph = EXCLUDED.rain_mmph
  `
  return r.count ?? batch.length
}

export function createDb(
  databaseUrl: string
): IngestDb & { sql: Sql } {
  const sql = postgres(databaseUrl, { max: 5, idle_timeout: 30 })

  return {
    sql,

    async upsertObservations(rows: NormalizedObservation[]) {
      if (rows.length === 0) return 0
      let total = 0
      for (let i = 0; i < rows.length; i += 500) {
        total += await upsertObsBatch(sql, rows.slice(i, i + 500))
      }
      return total
    },

    async upsertForecasts(rows: NormalizedForecast[]) {
      if (rows.length === 0) return 0
      let total = 0
      for (let i = 0; i < rows.length; i += 500) {
        total += await upsertForecastBatch(sql, rows.slice(i, i + 500))
      }
      return total
    },

    // Stub: implement when ensemble adapter lands
    async upsertEnsemble(_rows: NormalizedEnsemble[]) {
      return _rows.length
    },

    // Stub: implement in Sprint 3
    async upsertLightning() {
      return 0
    },

    async insertGridded(row) {
      const r = await sql`
        INSERT INTO observations_gridded (ts, source, variable, bbox, storage_url, raw_metadata)
        VALUES (
          ${row.ts}, ${row.source}, ${row.variable},
          ST_GeographyFromText(${"SRID=4326;" + row.bbox_wkt}),
          ${row.storage_url},
          ${row.raw_metadata != null ? sql.json(toJson(row.raw_metadata)) : null}
        )
        RETURNING id
      `
      return r[0].id as number
    },

    async recordFetchStart(source: string) {
      const r = await sql`
        INSERT INTO meta_fetch_log (source, started_at, status)
        VALUES (${source}, now(), 'partial')
        RETURNING id, started_at
      `
      return { id: Number(r[0].id), startedAt: new Date(r[0].started_at as string) }
    },

    async recordFetchEnd(id: number, status: "ok" | "partial" | "failed", payload) {
      await sql`
        UPDATE meta_fetch_log
        SET finished_at = now(),
            status = ${status},
            rows_written = ${payload.rows_written ?? null},
            rows_rejected = ${payload.rows_rejected ?? null},
            error_message = ${payload.error_message ?? null},
            duration_ms = ${payload.duration_ms}
        WHERE id = ${id}
      `
      if (status === "ok") {
        await sql`
          INSERT INTO meta_sources (source, last_success, last_attempt, consecutive_failures)
          VALUES ((SELECT source FROM meta_fetch_log WHERE id = ${id}), now(), now(), 0)
          ON CONFLICT (source) DO UPDATE SET
            last_success = now(),
            last_attempt = now(),
            consecutive_failures = 0
        `
      } else {
        await sql`
          INSERT INTO meta_sources (source, last_attempt, consecutive_failures)
          VALUES ((SELECT source FROM meta_fetch_log WHERE id = ${id}), now(), 1)
          ON CONFLICT (source) DO UPDATE SET
            last_attempt = now(),
            consecutive_failures = meta_sources.consecutive_failures + 1
        `
      }
    },

    async getBudget(source: string) {
      await sql`
        INSERT INTO meta_sources (source) VALUES (${source})
        ON CONFLICT (source) DO NOTHING
      `
      const rows = await sql`
        SELECT budget_used_today, budget_reset_at
        FROM meta_sources
        WHERE source = ${source}
      `
      const row = rows[0]
      const resetAt = new Date(row.budget_reset_at as string)
      if (Date.now() - resetAt.getTime() > 86_400_000) {
        await sql`
          UPDATE meta_sources
          SET budget_used_today = 0, budget_reset_at = now()
          WHERE source = ${source}
        `
        return { used: 0, resetAt: new Date() }
      }
      return { used: Number(row.budget_used_today), resetAt }
    },

    async incrementBudget(source: string, by: number) {
      await sql`
        UPDATE meta_sources
        SET budget_used_today = budget_used_today + ${by}
        WHERE source = ${source}
      `
    },
  }
}
