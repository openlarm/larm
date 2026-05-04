/**
 * Sprint 1 Acceptance Test Suite — 24-hour smoke tests
 *
 * Run ONLY after the ingest worker has been deployed to Railway and has been
 * running for at least 24 hours. Requires a live Supabase DATABASE_URL.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... FRONTEND_URL=https://... \
 *     npx vitest run apps/ingest-worker/test/acceptance/
 *
 * These tests are EXCLUDED from the default `npm test` run via vitest.config.ts.
 */
import { describe, it, expect, afterAll } from "vitest"
import postgres from "postgres"

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is required for acceptance tests. " +
      "Export it before running: DATABASE_URL=postgresql://... npx vitest run apps/ingest-worker/test/acceptance/"
  )
}

const sql = postgres(process.env.DATABASE_URL, { max: 1 })

afterAll(async () => {
  await sql.end()
})

describe("Sprint 1 acceptance — 24h after deployment", () => {
  /**
   * Test 1: All four P0 sources must have had a successful fetch within the
   * last hour. This verifies the cron schedule is firing and the CWA / EPA
   * adapters are writing to meta_sources.last_success on every successful run.
   */
  it("each P0 source has at least one successful fetch in last 1h", async () => {
    const sources = ["cwa_aws", "cwa_rainfall", "cwa_radar", "epa_aq"]
    for (const src of sources) {
      const rows = await sql`
        SELECT last_success FROM meta_sources WHERE source = ${src}
      `
      expect(rows[0]?.last_success, `meta_sources row missing for source: ${src}`).toBeDefined()
      const ageMin =
        (Date.now() - new Date(rows[0].last_success as string).getTime()) / 60_000
      expect(
        ageMin,
        `source ${src} last_success is ${ageMin.toFixed(1)} min ago — expected < 60`
      ).toBeLessThan(60)
    }
  })

  /**
   * Test 2: The observations_point table must contain at least one row written
   * in the past hour. A count of zero means the CWA AWS / rainfall adapters
   * fetched data but the writer failed or schema changed.
   */
  it("observations_point has rows from last 1h", async () => {
    const rows = await sql`
      SELECT count(*) AS cnt FROM observations_point
      WHERE ts > now() - INTERVAL '1 hour'
    `
    expect(
      Number(rows[0].cnt),
      "observations_point is empty for the last 1h — check meta_fetch_log for write errors"
    ).toBeGreaterThan(0)
  })

  /**
   * Test 3: The forecast_point table must contain at least one row issued
   * within the past 6 hours. Open-Meteo forecasts are refreshed every hour,
   * so 6 hours gives generous tolerance for transient failures.
   */
  it("forecast_point has rows from last 6h for at least one frequent site", async () => {
    const rows = await sql`
      SELECT count(*) AS cnt FROM forecast_point
      WHERE issued_at > now() - INTERVAL '6 hours'
    `
    expect(
      Number(rows[0].cnt),
      "forecast_point is empty for the last 6h — check Open-Meteo adapter and meta_fetch_log"
    ).toBeGreaterThan(0)
  })

  /**
   * Test 4: The overall fetch error rate across all sources must be below 10%
   * over the past 24 hours. A higher rate suggests an API key issue, network
   * problem, or schema mismatch causing repeated failures.
   */
  it("fetch error rate is below 10% in last 24h", async () => {
    const rows = await sql`
      SELECT
        count(*) FILTER (WHERE status = 'failed')::float
          / NULLIF(count(*), 0) AS error_rate
      FROM meta_fetch_log
      WHERE started_at > now() - INTERVAL '24 hours'
    `
    const rate = Number(rows[0].error_rate ?? 0)
    expect(
      rate,
      `error rate is ${(rate * 100).toFixed(1)}% — expected < 10%. ` +
        "Run: SELECT source, status, error_message FROM meta_fetch_log ORDER BY started_at DESC LIMIT 20"
    ).toBeLessThan(0.1)
  })

  /**
   * Test 5: The frontend /api/weather/context route must return HTTP 200 with
   * a freshness field of "fresh" or "degraded". A "stale" or error response
   * means the Builder layer is not reading from Supabase correctly, or the
   * ingest data has aged out of the freshness window.
   */
  it("frontend /api/weather/context returns fresh data", async () => {
    const baseUrl = process.env.FRONTEND_URL ?? "http://localhost:3000"
    const url = `${baseUrl}/api/weather/context?lat=25.04&lng=121.51`

    let res: Response
    try {
      res = await fetch(url)
    } catch (err) {
      throw new Error(
        `Could not reach frontend at ${url}. ` +
          `Set FRONTEND_URL to the deployed Vercel URL. Original error: ${err}`
      )
    }

    expect(res.ok, `GET ${url} returned HTTP ${res.status}`).toBe(true)
    const body = (await res.json()) as Record<string, unknown>
    expect(body.freshness, "body.freshness is missing").toBeDefined()
    expect(
      ["fresh", "degraded"],
      `body.freshness = "${body.freshness}" — expected "fresh" or "degraded". ` +
        "If the worker just started, wait until ingest has been running for at least 1 hour."
    ).toContain(body.freshness)
  })
})
