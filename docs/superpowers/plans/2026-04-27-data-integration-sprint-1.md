# Data Integration Sprint 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a Railway-hosted ingest worker that pulls 6 P0 weather data sources every 10 minutes to 1 hour, stores them in Supabase Postgres + PostGIS with `pg_partman` monthly partitions, and refactor `/api/weather/context` to read from a Builder layer that produces `LARMInput` from stored data.

**Architecture:** Three layers — `apps/ingest-worker` (Railway, 24/7 scheduled fetcher) → Supabase Postgres 17 + PostGIS + `pg_partman` (storage) → `packages/ingest-builder` (storage → LARMInput) → existing `@openlarm/core` published alpha unchanged.

**Tech Stack:** TypeScript 5, Node 20, node-cron 3, Supabase JS client v2, Zod 3, Vitest 1, Docker, Railway.

**Reference:** [`docs/architecture/data-integration.md`](../../architecture/data-integration.md) — design decisions, source→LARMInput mapping, fusion strategy, freshness tiers.

**Pre-flight (manual, owner: 段書元):**
- Provision Supabase project (region: ap-northeast-1, plan: Pro) → record `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`
- Provision Railway project linked to GitHub repo
- Confirm Open-Meteo Commercial API key in `.env.local` is still active
- Confirm CWA + EPA API keys

Each subagent task assumes those credentials are exported via `.env.local` at repo root and via Railway / Supabase project secrets.

---

## Task 1: Database extensions + meta tables

**Files:**
- Create: `infra/supabase/migrations/20260427_001_extensions.sql`
- Create: `infra/supabase/migrations/20260427_002_meta_tables.sql`
- Create: `infra/supabase/README.md`
- Test: `infra/supabase/test/001_smoke.test.ts`

- [ ] **Step 1: Write the migration smoke test**

```ts
// infra/supabase/test/001_smoke.test.ts
import { describe, it, expect } from "vitest"
import postgres from "postgres"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error("DATABASE_URL required for smoke tests")

describe("migration 001 + 002", () => {
  const sql = postgres(DATABASE_URL, { max: 1 })

  it("postgis extension installed", async () => {
    const rows = await sql`SELECT extname FROM pg_extension WHERE extname = 'postgis'`
    expect(rows).toHaveLength(1)
  })

  it("pg_partman extension installed", async () => {
    const rows = await sql`SELECT extname FROM pg_extension WHERE extname = 'pg_partman'`
    expect(rows).toHaveLength(1)
  })

  it("meta_sources + meta_fetch_log tables exist", async () => {
    const rows = await sql`
      SELECT tablename FROM pg_tables
      WHERE tablename IN ('meta_sources', 'meta_fetch_log')
      ORDER BY tablename
    `
    expect(rows.map((r) => r.tablename)).toEqual(["meta_fetch_log", "meta_sources"])
  })

  it("meta_sources can upsert", async () => {
    await sql`INSERT INTO meta_sources (source) VALUES ('smoke_test') ON CONFLICT (source) DO NOTHING`
    const rows = await sql`SELECT source FROM meta_sources WHERE source = 'smoke_test'`
    expect(rows).toHaveLength(1)
    await sql`DELETE FROM meta_sources WHERE source = 'smoke_test'`
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run infra/supabase/test/001_smoke.test.ts`
Expected: FAIL — `relation "meta_sources" does not exist` (because migrations not yet applied).

- [ ] **Step 3: Write the extension migration**

```sql
-- infra/supabase/migrations/20260427_001_extensions.sql
-- Enable PostGIS for geographic types and spatial joins.
-- Enable pg_partman for declarative monthly partitioning of time-series tables.
-- These are idempotent: safe to re-run.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;

-- pg_partman background worker config: schedule daily at 03:00 Asia/Taipei
-- (Supabase BGW is enabled per-project; verify in Supabase dashboard
-- Database → Extensions → pg_partman.)
```

- [ ] **Step 4: Write the meta tables migration**

```sql
-- infra/supabase/migrations/20260427_002_meta_tables.sql
-- Worker telemetry tables: track per-source fetch history and current health.

CREATE TABLE IF NOT EXISTS meta_sources (
  source                TEXT PRIMARY KEY,
  last_success          TIMESTAMPTZ,
  last_attempt          TIMESTAMPTZ,
  consecutive_failures  INT NOT NULL DEFAULT 0,
  enabled               BOOLEAN NOT NULL DEFAULT true,
  budget_used_today     INT NOT NULL DEFAULT 0,
  budget_reset_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_fetch_log (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL,
  finished_at     TIMESTAMPTZ,
  status          TEXT NOT NULL CHECK (status IN ('ok', 'partial', 'failed')),
  rows_written    INT,
  rows_rejected   INT,
  error_message   TEXT,
  duration_ms     INT
);

CREATE INDEX IF NOT EXISTS meta_fetch_log_source_time_idx
  ON meta_fetch_log (source, started_at DESC);
```

- [ ] **Step 5: Write README + apply + verify + commit**

```markdown
<!-- infra/supabase/README.md -->
# Supabase Migrations

Apply migrations in numeric order:

```bash
psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_001_extensions.sql
psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_002_meta_tables.sql
```

Smoke test after applying:
```bash
DATABASE_URL=... npx vitest run infra/supabase/test/
```

Migrations are idempotent (`CREATE EXTENSION IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`).
```

Run: `psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_001_extensions.sql && psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_002_meta_tables.sql && npx vitest run infra/supabase/test/`
Expected: 4 tests pass.

```bash
git add infra/supabase/
git commit -m "feat(infra): add pg_partman + meta tables migrations"
```

---

## Task 2: Time-series partitioned tables

**Files:**
- Create: `infra/supabase/migrations/20260427_003_observations_point.sql`
- Create: `infra/supabase/migrations/20260427_004_forecast_point.sql`
- Create: `infra/supabase/migrations/20260427_005_forecast_ensemble.sql`
- Test: `infra/supabase/test/003_partitioned_tables.test.ts`

- [ ] **Step 1: Write the partitioning smoke test**

```ts
// infra/supabase/test/003_partitioned_tables.test.ts
import { describe, it, expect } from "vitest"
import postgres from "postgres"

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

describe("partitioned tables", () => {
  it.each(["observations_point", "forecast_point", "forecast_ensemble"])(
    "%s is a partitioned table",
    async (table) => {
      const rows = await sql`
        SELECT relkind FROM pg_class WHERE relname = ${table}
      `
      expect(rows[0]?.relkind).toBe("p") // 'p' = partitioned table
    }
  )

  it("observations_point has GIST index on geom", async () => {
    const rows = await sql`
      SELECT indexname FROM pg_indexes
      WHERE tablename = 'observations_point' AND indexname LIKE '%geom%'
    `
    expect(rows.length).toBeGreaterThanOrEqual(1)
  })

  it("partman has at least 3 child partitions ahead for observations_point", async () => {
    const rows = await sql`
      SELECT count(*) FROM pg_inherits
      JOIN pg_class child ON pg_inherits.inhrelid = child.oid
      JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
      WHERE parent.relname = 'observations_point'
    `
    expect(Number(rows[0].count)).toBeGreaterThanOrEqual(3)
  })

  it("can insert and select observations_point row", async () => {
    await sql`
      INSERT INTO observations_point (ts, source, station_id, geom, wind_kmh)
      VALUES (now(), 'test_smoke', 'STN001',
              ST_GeographyFromText('SRID=4326;POINT(121.5 25.0)'), 12.3)
    `
    const rows = await sql`
      SELECT wind_kmh FROM observations_point
      WHERE source = 'test_smoke' AND station_id = 'STN001'
    `
    expect(rows[0].wind_kmh).toBe(12.3)
    await sql`DELETE FROM observations_point WHERE source = 'test_smoke'`
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run infra/supabase/test/003_partitioned_tables.test.ts`
Expected: FAIL — `relation "observations_point" does not exist`.

- [ ] **Step 3: Write the three migration files**

```sql
-- infra/supabase/migrations/20260427_003_observations_point.sql
CREATE TABLE IF NOT EXISTS observations_point (
  id            BIGSERIAL,
  ts            TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,
  station_id    TEXT NOT NULL,
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  wind_kmh      DOUBLE PRECISION,
  wind_dir_deg  DOUBLE PRECISION,
  gust_kmh      DOUBLE PRECISION,
  temp_c        DOUBLE PRECISION,
  rh_pct        DOUBLE PRECISION,
  pressure_hpa  DOUBLE PRECISION,
  rain_mm_10min DOUBLE PRECISION,
  rain_mm_1h    DOUBLE PRECISION,
  rain_mm_24h   DOUBLE PRECISION,
  qc_flags      JSONB,
  raw_payload   JSONB,
  PRIMARY KEY (ts, id)
) PARTITION BY RANGE (ts);

CREATE UNIQUE INDEX IF NOT EXISTS observations_point_natural_key
  ON observations_point (ts, source, station_id);
CREATE INDEX IF NOT EXISTS observations_point_geom_idx
  ON observations_point USING GIST (geom);
CREATE INDEX IF NOT EXISTS observations_point_lookup_idx
  ON observations_point (source, station_id, ts DESC);

SELECT partman.create_parent(
  p_parent_table => 'public.observations_point',
  p_control      => 'ts',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 3
) WHERE NOT EXISTS (
  SELECT 1 FROM partman.part_config WHERE parent_table = 'public.observations_point'
);
```

```sql
-- infra/supabase/migrations/20260427_004_forecast_point.sql
CREATE TABLE IF NOT EXISTS forecast_point (
  id            BIGSERIAL,
  issued_at     TIMESTAMPTZ NOT NULL,
  valid_at      TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  region_id     TEXT,
  wind_kmh      DOUBLE PRECISION,
  wind_dir_deg  DOUBLE PRECISION,
  gust_kmh      DOUBLE PRECISION,
  rain_prob_pct DOUBLE PRECISION,
  rain_mmph     DOUBLE PRECISION,
  weather_code  TEXT,
  raw_payload   JSONB,
  PRIMARY KEY (valid_at, id)
) PARTITION BY RANGE (valid_at);

CREATE UNIQUE INDEX IF NOT EXISTS forecast_point_natural_key
  ON forecast_point (issued_at, valid_at, source, COALESCE(region_id, ''), ST_AsText(geom::geometry));
CREATE INDEX IF NOT EXISTS forecast_point_geom_idx ON forecast_point USING GIST (geom);
CREATE INDEX IF NOT EXISTS forecast_point_lookup_idx ON forecast_point (source, valid_at DESC);

SELECT partman.create_parent(
  p_parent_table => 'public.forecast_point',
  p_control      => 'valid_at',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 3
) WHERE NOT EXISTS (
  SELECT 1 FROM partman.part_config WHERE parent_table = 'public.forecast_point'
);
```

```sql
-- infra/supabase/migrations/20260427_005_forecast_ensemble.sql
CREATE TABLE IF NOT EXISTS forecast_ensemble (
  id            BIGSERIAL,
  issued_at     TIMESTAMPTZ NOT NULL,
  valid_at      TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  variable      TEXT NOT NULL,
  p10           DOUBLE PRECISION,
  p50           DOUBLE PRECISION,
  p90           DOUBLE PRECISION,
  member_count  INT,
  PRIMARY KEY (valid_at, id)
) PARTITION BY RANGE (valid_at);

CREATE UNIQUE INDEX IF NOT EXISTS forecast_ensemble_natural_key
  ON forecast_ensemble (issued_at, valid_at, source, variable, ST_AsText(geom::geometry));

SELECT partman.create_parent(
  p_parent_table => 'public.forecast_ensemble',
  p_control      => 'valid_at',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 3
) WHERE NOT EXISTS (
  SELECT 1 FROM partman.part_config WHERE parent_table = 'public.forecast_ensemble'
);
```

- [ ] **Step 4: Apply + run test**

Run:
```bash
psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_003_observations_point.sql
psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_004_forecast_point.sql
psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_005_forecast_ensemble.sql
npx vitest run infra/supabase/test/003_partitioned_tables.test.ts
```
Expected: 6 tests pass.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/ infra/supabase/test/
git commit -m "feat(infra): add partitioned observation + forecast tables"
```

---

## Task 3: Events + static geo tables

**Files:**
- Create: `infra/supabase/migrations/20260427_006_events.sql`
- Create: `infra/supabase/migrations/20260427_007_static_geo.sql`
- Test: `infra/supabase/test/006_events_static.test.ts`

- [ ] **Step 1: Write smoke test**

```ts
// infra/supabase/test/006_events_static.test.ts
import { describe, it, expect } from "vitest"
import postgres from "postgres"

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

describe("events + static_geo", () => {
  it.each(["events_warning", "events_lightning", "static_buildings", "static_dem"])(
    "%s table exists",
    async (table) => {
      const rows = await sql`SELECT tablename FROM pg_tables WHERE tablename = ${table}`
      expect(rows).toHaveLength(1)
    }
  )

  it("events_warning supports MULTIPOLYGON insert", async () => {
    await sql`
      INSERT INTO events_warning (issued_at, expires_at, source, warning_type, severity, area_geom)
      VALUES (now(), now() + INTERVAL '6 hours', 'test_smoke', 'heavy_rain', 'medium',
              ST_GeographyFromText('SRID=4326;MULTIPOLYGON(((121 25, 122 25, 122 26, 121 26, 121 25)))'))
    `
    const rows = await sql`SELECT id FROM events_warning WHERE source = 'test_smoke'`
    expect(rows).toHaveLength(1)
    await sql`DELETE FROM events_warning WHERE source = 'test_smoke'`
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run infra/supabase/test/006_events_static.test.ts`
Expected: FAIL — table does not exist.

- [ ] **Step 3: Write events migration**

```sql
-- infra/supabase/migrations/20260427_006_events.sql
CREATE TABLE IF NOT EXISTS events_warning (
  id            BIGSERIAL PRIMARY KEY,
  issued_at     TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,
  warning_type  TEXT NOT NULL,
  severity      TEXT,
  area_geom     GEOGRAPHY(MULTIPOLYGON, 4326),
  raw_payload   JSONB
);
CREATE INDEX IF NOT EXISTS events_warning_geom_idx ON events_warning USING GIST (area_geom);
CREATE INDEX IF NOT EXISTS events_warning_time_idx ON events_warning (issued_at DESC);

CREATE TABLE IF NOT EXISTS events_lightning (
  id            BIGSERIAL,
  ts            TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  intensity_ka  DOUBLE PRECISION,
  polarity      TEXT,
  PRIMARY KEY (ts, id)
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS events_lightning_geom_idx ON events_lightning USING GIST (geom);

SELECT partman.create_parent(
  p_parent_table => 'public.events_lightning',
  p_control      => 'ts',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 3
) WHERE NOT EXISTS (
  SELECT 1 FROM partman.part_config WHERE parent_table = 'public.events_lightning'
);
```

- [ ] **Step 4: Write static_geo migration**

```sql
-- infra/supabase/migrations/20260427_007_static_geo.sql
CREATE TABLE IF NOT EXISTS static_buildings (
  id            TEXT PRIMARY KEY,
  geom          GEOGRAPHY(POLYGON, 4326) NOT NULL,
  height_m      DOUBLE PRECISION,
  floor_count   INT,
  source        TEXT NOT NULL,
  refreshed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS static_buildings_geom_idx
  ON static_buildings USING GIST (geom);

CREATE TABLE IF NOT EXISTS static_dem (
  tile_id       TEXT PRIMARY KEY,
  bbox          GEOGRAPHY(POLYGON, 4326) NOT NULL,
  resolution_m  DOUBLE PRECISION NOT NULL,
  storage_url   TEXT NOT NULL,
  refreshed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS static_dem_bbox_idx
  ON static_dem USING GIST (bbox);

CREATE TABLE IF NOT EXISTS static_frequent_sites (
  id            TEXT PRIMARY KEY,
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  display_name  TEXT,
  mission_count INT NOT NULL DEFAULT 0,
  last_used_at  TIMESTAMPTZ,
  rank          INT
);
CREATE INDEX IF NOT EXISTS static_frequent_sites_rank_idx
  ON static_frequent_sites (rank);
```

- [ ] **Step 5: Apply + test + commit**

Run:
```bash
psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_006_events.sql
psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_007_static_geo.sql
npx vitest run infra/supabase/test/006_events_static.test.ts
```
Expected: 5 tests pass.

```bash
git add infra/supabase/migrations/20260427_006_events.sql \
        infra/supabase/migrations/20260427_007_static_geo.sql \
        infra/supabase/test/006_events_static.test.ts
git commit -m "feat(infra): add events + static geo tables"
```

---

## Task 4: `@openlarm/ingest-types` package

**Files:**
- Create: `packages/ingest-types/package.json`
- Create: `packages/ingest-types/tsconfig.json`
- Create: `packages/ingest-types/src/index.ts`
- Create: `packages/ingest-types/src/observations.ts`
- Create: `packages/ingest-types/src/forecasts.ts`
- Create: `packages/ingest-types/src/source-result.ts`
- Create: `packages/ingest-types/test/observations.test.ts`
- Modify: `package.json` (root) — workspaces array already includes `packages/*` so no change needed; verify

- [ ] **Step 1: Write the type-shape test**

```ts
// packages/ingest-types/test/observations.test.ts
import { describe, it, expect } from "vitest"
import { NormalizedObservationSchema } from "../src/observations"

describe("NormalizedObservation schema", () => {
  it("accepts a complete CWA AWS observation", () => {
    const ok = NormalizedObservationSchema.safeParse({
      ts: "2026-04-27T10:00:00+08:00",
      source: "cwa_aws",
      station_id: "466920",
      lat: 25.0381,
      lng: 121.5145,
      wind_kmh: 12.3,
      wind_dir_deg: 180,
      gust_kmh: 18.5,
      temp_c: 22.1,
      rh_pct: 78,
      qc_flags: { bias_corrected: false, outlier: false },
    })
    expect(ok.success).toBe(true)
  })

  it("rejects observation with no station_id", () => {
    const bad = NormalizedObservationSchema.safeParse({
      ts: "2026-04-27T10:00:00+08:00",
      source: "cwa_aws",
      lat: 25.0,
      lng: 121.5,
    })
    expect(bad.success).toBe(false)
  })

  it("accepts a partial reading (wind only, no rain)", () => {
    const ok = NormalizedObservationSchema.safeParse({
      ts: "2026-04-27T10:00:00+08:00",
      source: "epa_aq",
      station_id: "EPA001",
      lat: 25.0,
      lng: 121.5,
      wind_kmh: 8.2,
    })
    expect(ok.success).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w @openlarm/ingest-types run test`
Expected: FAIL — package does not exist yet.

- [ ] **Step 3: Scaffold package files**

```json
// packages/ingest-types/package.json
{
  "name": "@openlarm/ingest-types",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5",
    "vitest": "^1.6.0"
  }
}
```

```json
// packages/ingest-types/tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

```ts
// packages/ingest-types/src/observations.ts
import { z } from "zod"

export const NormalizedObservationSchema = z.object({
  ts: z.string(),                    // ISO 8601 with timezone
  source: z.string(),                // 'cwa_aws', 'epa_aq', etc.
  station_id: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  wind_kmh: z.number().nullable().optional(),
  wind_dir_deg: z.number().min(0).max(360).nullable().optional(),
  gust_kmh: z.number().nullable().optional(),
  temp_c: z.number().nullable().optional(),
  rh_pct: z.number().min(0).max(100).nullable().optional(),
  pressure_hpa: z.number().nullable().optional(),
  rain_mm_10min: z.number().min(0).nullable().optional(),
  rain_mm_1h: z.number().min(0).nullable().optional(),
  rain_mm_24h: z.number().min(0).nullable().optional(),
  qc_flags: z.record(z.unknown()).optional(),
  raw_payload: z.unknown().optional(),
})

export type NormalizedObservation = z.infer<typeof NormalizedObservationSchema>
```

```ts
// packages/ingest-types/src/forecasts.ts
import { z } from "zod"

export const NormalizedForecastSchema = z.object({
  issued_at: z.string(),
  valid_at: z.string(),
  source: z.string(),
  lat: z.number(),
  lng: z.number(),
  region_id: z.string().nullable().optional(),
  wind_kmh: z.number().nullable().optional(),
  wind_dir_deg: z.number().nullable().optional(),
  gust_kmh: z.number().nullable().optional(),
  rain_prob_pct: z.number().min(0).max(100).nullable().optional(),
  rain_mmph: z.number().min(0).nullable().optional(),
  weather_code: z.string().nullable().optional(),
  raw_payload: z.unknown().optional(),
})

export type NormalizedForecast = z.infer<typeof NormalizedForecastSchema>

export const NormalizedEnsembleSchema = z.object({
  issued_at: z.string(),
  valid_at: z.string(),
  source: z.string(),
  lat: z.number(),
  lng: z.number(),
  variable: z.enum(["wind_kmh", "rain_mm", "temp_c", "gust_kmh"]),
  p10: z.number().nullable(),
  p50: z.number().nullable(),
  p90: z.number().nullable(),
  member_count: z.number().int(),
})

export type NormalizedEnsemble = z.infer<typeof NormalizedEnsembleSchema>
```

```ts
// packages/ingest-types/src/source-result.ts
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
```

```ts
// packages/ingest-types/src/index.ts
export * from "./observations"
export * from "./forecasts"
export * from "./source-result"
```

- [ ] **Step 4: Run test + build to verify**

Run: `npm install && npm -w @openlarm/ingest-types run test && npm -w @openlarm/ingest-types run build`
Expected: 3 tests pass; `dist/index.js` + `dist/index.d.ts` produced.

- [ ] **Step 5: Commit**

```bash
git add packages/ingest-types/ package-lock.json
git commit -m "feat(ingest-types): add NormalizedObservation/Forecast/Ensemble schemas"
```

---

## Task 5: CWA AWS adapter

**Files:**
- Create: `packages/ingest-sources/package.json`
- Create: `packages/ingest-sources/tsconfig.json`
- Create: `packages/ingest-sources/src/cwa/aws.ts`
- Create: `packages/ingest-sources/src/util/qc.ts`
- Create: `packages/ingest-sources/src/index.ts`
- Create: `packages/ingest-sources/test/cwa-aws.test.ts`
- Create: `packages/ingest-sources/test/fixtures/cwa-aws-response.json`

- [ ] **Step 1: Write the adapter test with fixture**

```ts
// packages/ingest-sources/test/cwa-aws.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runCwaAws } from "../src/cwa/aws"
import type { IngestDb } from "@openlarm/ingest-types"
import fixture from "./fixtures/cwa-aws-response.json"

describe("runCwaAws", () => {
  let mockDb: IngestDb
  let upsertedRows: any[] = []

  beforeEach(() => {
    upsertedRows = []
    mockDb = {
      upsertObservations: vi.fn(async (rows) => {
        upsertedRows.push(...rows)
        return rows.length
      }),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      getBudget: vi.fn(async () => ({ used: 0, resetAt: new Date() })),
      incrementBudget: vi.fn(async () => {}),
      upsertForecasts: vi.fn(),
      upsertEnsemble: vi.fn(),
      upsertLightning: vi.fn(),
    } as any

    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })
    ) as any
  })

  it("normalizes wind speed from m/s to km/h", async () => {
    await runCwaAws({ db: mockDb, now: () => new Date("2026-04-27T10:00:00+08:00") })
    const taipei = upsertedRows.find((r) => r.station_id === "466920")
    expect(taipei.wind_kmh).toBeCloseTo(7.2 * 3.6, 1) // 7.2 m/s in fixture
  })

  it("rejects readings with wind > 200 km/h", async () => {
    const result = await runCwaAws({ db: mockDb, now: () => new Date() })
    // fixture includes one bad station with 100 m/s wind → 360 km/h, must reject
    expect(result.rows_rejected).toBeGreaterThan(0)
    expect(upsertedRows.find((r) => r.station_id === "BADSTN")).toBeUndefined()
  })

  it("converts CWA -99 sentinel to null", async () => {
    await runCwaAws({ db: mockDb, now: () => new Date() })
    const stnNoGust = upsertedRows.find((r) => r.station_id === "NOGUST")
    expect(stnNoGust.gust_kmh).toBeNull()
  })

  it("logs fetch start + end", async () => {
    await runCwaAws({ db: mockDb, now: () => new Date() })
    expect(mockDb.recordFetchStart).toHaveBeenCalledWith("cwa_aws")
    expect(mockDb.recordFetchEnd).toHaveBeenCalledWith(1, "ok", expect.objectContaining({ rows_written: expect.any(Number) }))
  })
})
```

```json
// packages/ingest-sources/test/fixtures/cwa-aws-response.json
{
  "records": {
    "Station": [
      {
        "StationId": "466920",
        "StationName": "臺北",
        "ObsTime": { "DateTime": "2026-04-27T10:00:00+08:00" },
        "GeoInfo": { "Coordinates": [{ "StationLatitude": 25.0381, "StationLongitude": 121.5145 }] },
        "WeatherElement": {
          "WindSpeed": 7.2, "WindDirection": 180,
          "GustInfo": { "PeakGustSpeed": 11.5 },
          "AirTemperature": 22.1, "RelativeHumidity": 78,
          "AirPressure": 1013.2,
          "Now": { "Precipitation": 0.0 }
        }
      },
      {
        "StationId": "BADSTN",
        "StationName": "Bad",
        "ObsTime": { "DateTime": "2026-04-27T10:00:00+08:00" },
        "GeoInfo": { "Coordinates": [{ "StationLatitude": 25.0, "StationLongitude": 121.5 }] },
        "WeatherElement": { "WindSpeed": 100.0, "WindDirection": 0 }
      },
      {
        "StationId": "NOGUST",
        "StationName": "NoGust",
        "ObsTime": { "DateTime": "2026-04-27T10:00:00+08:00" },
        "GeoInfo": { "Coordinates": [{ "StationLatitude": 24.5, "StationLongitude": 121.0 }] },
        "WeatherElement": {
          "WindSpeed": 5.0, "WindDirection": 90,
          "GustInfo": { "PeakGustSpeed": -99 }
        }
      }
    ]
  }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w @openlarm/ingest-sources run test`
Expected: FAIL — package does not exist.

- [ ] **Step 3: Scaffold package + implement adapter**

```json
// packages/ingest-sources/package.json
{
  "name": "@openlarm/ingest-sources",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openlarm/ingest-types": "*",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "tsup": "^8.0.0",
    "typescript": "^5",
    "vitest": "^1.6.0"
  }
}
```

```ts
// packages/ingest-sources/src/util/qc.ts
const CWA_SENTINEL = -99
export function cleanCwaValue(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (v === CWA_SENTINEL || v <= -90) return null
  return v
}

export function isPlausibleWind(kmh: number | null): boolean {
  if (kmh === null) return true
  return kmh >= 0 && kmh <= 200
}

export function isPlausibleTemp(c: number | null): boolean {
  if (c === null) return true
  return c >= -40 && c <= 60
}
```

```ts
// packages/ingest-sources/src/cwa/aws.ts
import { z } from "zod"
import type { NormalizedObservation, SourceDeps, SourceResult } from "@openlarm/ingest-types"
import { cleanCwaValue, isPlausibleWind, isPlausibleTemp } from "../util/qc"

const CWA_AWS_URL =
  "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0001-001"

const CwaStationSchema = z.object({
  StationId: z.string(),
  StationName: z.string(),
  ObsTime: z.object({ DateTime: z.string() }),
  GeoInfo: z.object({
    Coordinates: z.array(z.object({
      StationLatitude: z.number(),
      StationLongitude: z.number(),
    })).min(1),
  }),
  WeatherElement: z.object({
    WindSpeed: z.number().optional(),       // m/s
    WindDirection: z.number().optional(),
    GustInfo: z.object({ PeakGustSpeed: z.number() }).optional(),
    AirTemperature: z.number().optional(),
    RelativeHumidity: z.number().optional(),
    AirPressure: z.number().optional(),
    Now: z.object({ Precipitation: z.number() }).optional(),
  }),
})

const CwaResponseSchema = z.object({
  records: z.object({ Station: z.array(CwaStationSchema) }),
})

const MS_TO_KMH = 3.6

export async function runCwaAws(deps: SourceDeps): Promise<SourceResult> {
  const apiKey = process.env.CWA_API_KEY
  if (!apiKey) throw new Error("CWA_API_KEY required")

  const fetchLog = await deps.db.recordFetchStart("cwa_aws")
  const start = Date.now()

  try {
    const url = new URL(CWA_AWS_URL)
    url.searchParams.set("Authorization", apiKey)
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`CWA AWS HTTP ${res.status}`)
    const json = await res.json()
    const parsed = CwaResponseSchema.parse(json)

    const accepted: NormalizedObservation[] = []
    let rejected = 0

    for (const stn of parsed.records.Station) {
      const we = stn.WeatherElement
      const coord = stn.GeoInfo.Coordinates[0]
      const wind_kmh = cleanCwaValue(we.WindSpeed ?? null) !== null
        ? (we.WindSpeed as number) * MS_TO_KMH
        : null
      const gust_kmh = we.GustInfo?.PeakGustSpeed != null && cleanCwaValue(we.GustInfo.PeakGustSpeed) !== null
        ? we.GustInfo.PeakGustSpeed * MS_TO_KMH
        : null
      const temp_c = cleanCwaValue(we.AirTemperature ?? null)

      if (!isPlausibleWind(wind_kmh) || !isPlausibleTemp(temp_c)) {
        rejected++
        continue
      }

      accepted.push({
        ts: stn.ObsTime.DateTime,
        source: "cwa_aws",
        station_id: stn.StationId,
        lat: coord.StationLatitude,
        lng: coord.StationLongitude,
        wind_kmh,
        wind_dir_deg: cleanCwaValue(we.WindDirection ?? null),
        gust_kmh,
        temp_c,
        rh_pct: cleanCwaValue(we.RelativeHumidity ?? null),
        pressure_hpa: cleanCwaValue(we.AirPressure ?? null),
        rain_mm_10min: we.Now?.Precipitation ?? null,
        qc_flags: { bias_corrected: false, outlier: false },
      })
    }

    const written = await deps.db.upsertObservations(accepted)
    await deps.db.recordFetchEnd(fetchLog.id, "ok", {
      rows_written: written,
      rows_rejected: rejected,
      duration_ms: Date.now() - start,
    })
    return { rows_written: written, rows_rejected: rejected, duration_ms: Date.now() - start }
  } catch (err) {
    await deps.db.recordFetchEnd(fetchLog.id, "failed", {
      error_message: String(err),
      duration_ms: Date.now() - start,
    })
    throw err
  }
}
```

```ts
// packages/ingest-sources/src/index.ts
export { runCwaAws } from "./cwa/aws"
```

- [ ] **Step 4: Run tests**

Run: `npm install && npm -w @openlarm/ingest-sources run test`
Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ingest-sources/ package-lock.json
git commit -m "feat(ingest-sources): add CWA AWS adapter with QC + bias filters"
```

---

## Task 6: CWA Rainfall adapter

**Files:**
- Create: `packages/ingest-sources/src/cwa/rainfall.ts`
- Create: `packages/ingest-sources/test/cwa-rainfall.test.ts`
- Create: `packages/ingest-sources/test/fixtures/cwa-rainfall-response.json`
- Modify: `packages/ingest-sources/src/index.ts`

- [ ] **Step 1: Write fixture + test**

```json
// packages/ingest-sources/test/fixtures/cwa-rainfall-response.json
{
  "records": {
    "Station": [
      {
        "StationId": "C0A640",
        "StationName": "中山",
        "ObsTime": { "DateTime": "2026-04-27T10:00:00+08:00" },
        "GeoInfo": { "Coordinates": [{ "StationLatitude": 25.06, "StationLongitude": 121.54 }] },
        "RainfallElement": {
          "Now": { "Precipitation": 0.5 },
          "Past1hr": { "Precipitation": 2.3 },
          "Past24hr": { "Precipitation": 18.7 }
        }
      }
    ]
  }
}
```

```ts
// packages/ingest-sources/test/cwa-rainfall.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runCwaRainfall } from "../src/cwa/rainfall"
import type { IngestDb } from "@openlarm/ingest-types"
import fixture from "./fixtures/cwa-rainfall-response.json"

describe("runCwaRainfall", () => {
  let mockDb: IngestDb
  let rows: any[] = []
  beforeEach(() => {
    rows = []
    mockDb = {
      upsertObservations: vi.fn(async (r) => { rows.push(...r); return r.length }),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      getBudget: vi.fn(async () => ({ used: 0, resetAt: new Date() })),
      incrementBudget: vi.fn(async () => {}),
      upsertForecasts: vi.fn(), upsertEnsemble: vi.fn(), upsertLightning: vi.fn(),
    } as any
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })) as any
  })

  it("emits rain_mm_1h and rain_mm_24h fields", async () => {
    await runCwaRainfall({ db: mockDb, now: () => new Date() })
    expect(rows[0].rain_mm_1h).toBe(2.3)
    expect(rows[0].rain_mm_24h).toBe(18.7)
    expect(rows[0].source).toBe("cwa_rainfall")
  })

  it("does not include wind fields", async () => {
    await runCwaRainfall({ db: mockDb, now: () => new Date() })
    expect(rows[0].wind_kmh).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w @openlarm/ingest-sources run test -- cwa-rainfall`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement adapter**

```ts
// packages/ingest-sources/src/cwa/rainfall.ts
import { z } from "zod"
import type { NormalizedObservation, SourceDeps, SourceResult } from "@openlarm/ingest-types"
import { cleanCwaValue } from "../util/qc"

const URL_ = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0002-001"

const StationSchema = z.object({
  StationId: z.string(),
  ObsTime: z.object({ DateTime: z.string() }),
  GeoInfo: z.object({
    Coordinates: z.array(z.object({
      StationLatitude: z.number(),
      StationLongitude: z.number(),
    })).min(1),
  }),
  RainfallElement: z.object({
    Now: z.object({ Precipitation: z.number() }).optional(),
    Past1hr: z.object({ Precipitation: z.number() }).optional(),
    Past24hr: z.object({ Precipitation: z.number() }).optional(),
  }),
})
const RespSchema = z.object({ records: z.object({ Station: z.array(StationSchema) }) })

export async function runCwaRainfall(deps: SourceDeps): Promise<SourceResult> {
  const apiKey = process.env.CWA_API_KEY
  if (!apiKey) throw new Error("CWA_API_KEY required")

  const log = await deps.db.recordFetchStart("cwa_rainfall")
  const t0 = Date.now()

  try {
    const url = new URL(URL_)
    url.searchParams.set("Authorization", apiKey)
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`CWA rainfall HTTP ${res.status}`)
    const parsed = RespSchema.parse(await res.json())

    const rows: NormalizedObservation[] = parsed.records.Station.map((stn) => ({
      ts: stn.ObsTime.DateTime,
      source: "cwa_rainfall",
      station_id: stn.StationId,
      lat: stn.GeoInfo.Coordinates[0].StationLatitude,
      lng: stn.GeoInfo.Coordinates[0].StationLongitude,
      rain_mm_10min: cleanCwaValue(stn.RainfallElement.Now?.Precipitation ?? null),
      rain_mm_1h: cleanCwaValue(stn.RainfallElement.Past1hr?.Precipitation ?? null),
      rain_mm_24h: cleanCwaValue(stn.RainfallElement.Past24hr?.Precipitation ?? null),
    }))

    const written = await deps.db.upsertObservations(rows)
    await deps.db.recordFetchEnd(log.id, "ok", { rows_written: written, rows_rejected: 0, duration_ms: Date.now() - t0 })
    return { rows_written: written, rows_rejected: 0, duration_ms: Date.now() - t0 }
  } catch (err) {
    await deps.db.recordFetchEnd(log.id, "failed", { error_message: String(err), duration_ms: Date.now() - t0 })
    throw err
  }
}
```

Modify `packages/ingest-sources/src/index.ts`:
```ts
export { runCwaAws } from "./cwa/aws"
export { runCwaRainfall } from "./cwa/rainfall"
```

- [ ] **Step 4: Run tests**

Run: `npm -w @openlarm/ingest-sources run test`
Expected: 6 tests pass (4 from Task 5 + 2 new).

- [ ] **Step 5: Commit**

```bash
git add packages/ingest-sources/src/cwa/rainfall.ts \
        packages/ingest-sources/test/cwa-rainfall.test.ts \
        packages/ingest-sources/test/fixtures/cwa-rainfall-response.json \
        packages/ingest-sources/src/index.ts
git commit -m "feat(ingest-sources): add CWA rainfall station adapter"
```

---

## Task 7: CWA Radar adapter (Supabase Storage)

**Files:**
- Create: `packages/ingest-sources/src/cwa/radar.ts`
- Create: `packages/ingest-sources/src/util/storage.ts`
- Create: `packages/ingest-sources/test/cwa-radar.test.ts`
- Create: `infra/supabase/migrations/20260427_008_observations_gridded.sql`
- Modify: `packages/ingest-sources/src/index.ts`

- [ ] **Step 1: Add gridded observations table migration**

```sql
-- infra/supabase/migrations/20260427_008_observations_gridded.sql
CREATE TABLE IF NOT EXISTS observations_gridded (
  id            BIGSERIAL,
  ts            TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,            -- 'cwa_radar', 'himawari'
  variable      TEXT NOT NULL,            -- 'reflect', 'bt_ch10'
  bbox          GEOGRAPHY(POLYGON, 4326) NOT NULL,
  storage_url   TEXT NOT NULL,            -- Supabase Storage path
  raw_metadata  JSONB,
  PRIMARY KEY (ts, id)
) PARTITION BY RANGE (ts);

CREATE INDEX IF NOT EXISTS observations_gridded_lookup_idx ON observations_gridded (source, variable, ts DESC);

SELECT partman.create_parent(
  p_parent_table => 'public.observations_gridded',
  p_control      => 'ts',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 3
) WHERE NOT EXISTS (
  SELECT 1 FROM partman.part_config WHERE parent_table = 'public.observations_gridded'
);
```

- [ ] **Step 2: Write the radar adapter test**

```ts
// packages/ingest-sources/test/cwa-radar.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runCwaRadar } from "../src/cwa/radar"

describe("runCwaRadar", () => {
  const fakeImage = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  let uploaded: { path: string; bytes: number } | null = null
  let mockDb: any
  let mockStorage: any

  beforeEach(() => {
    uploaded = null
    mockStorage = {
      upload: vi.fn(async (path: string, blob: Blob) => {
        uploaded = { path, bytes: blob.size }
        return { path, fullPath: `cwa-radar/${path}`, size: blob.size }
      }),
    }
    mockDb = {
      insertGridded: vi.fn(async () => 1),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
    }
    global.fetch = vi.fn(async () =>
      new Response(fakeImage, { status: 200, headers: { "content-type": "image/png" } })
    ) as any
  })

  it("uploads PNG to storage and inserts metadata row", async () => {
    await runCwaRadar({ db: mockDb, now: () => new Date("2026-04-27T10:00:00+08:00"), storage: mockStorage })
    expect(uploaded).not.toBeNull()
    expect(uploaded!.path).toMatch(/^2026-04-27\/cwa-radar-\d{14}\.png$/)
    expect(mockDb.insertGridded).toHaveBeenCalledWith(expect.objectContaining({
      source: "cwa_radar",
      variable: "reflect",
    }))
  })
})
```

- [ ] **Step 3: Implement storage util + radar adapter**

```ts
// packages/ingest-sources/src/util/storage.ts
export interface StorageClient {
  upload(path: string, body: Blob, opts?: { contentType?: string }): Promise<{ path: string; fullPath: string; size: number }>
}
```

```ts
// packages/ingest-sources/src/cwa/radar.ts
import type { SourceDeps, SourceResult } from "@openlarm/ingest-types"
import type { StorageClient } from "../util/storage"

interface RadarDeps extends SourceDeps {
  storage: StorageClient
}

const URL_ = "https://opendata.cwa.gov.tw/api/v1/rest/datastore/O-A0058-003"
// Taiwan radar mosaic bounding box (approximate)
const BBOX_WKT = "POLYGON((118 20, 124 20, 124 26, 118 26, 118 20))"

export async function runCwaRadar(deps: RadarDeps): Promise<SourceResult> {
  const apiKey = process.env.CWA_API_KEY
  if (!apiKey) throw new Error("CWA_API_KEY required")
  const log = await deps.db.recordFetchStart("cwa_radar")
  const t0 = Date.now()

  try {
    const url = new URL(URL_)
    url.searchParams.set("Authorization", apiKey)
    url.searchParams.set("format", "PNG")
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) })
    if (!res.ok) throw new Error(`CWA radar HTTP ${res.status}`)
    const blob = await res.blob()

    const now = deps.now()
    const dateFolder = now.toISOString().slice(0, 10)
    const filename = `cwa-radar-${now.toISOString().replace(/[-:T.Z]/g, "").slice(0, 14)}.png`
    const path = `${dateFolder}/${filename}`

    const uploaded = await deps.storage.upload(path, blob, { contentType: "image/png" })

    await (deps.db as any).insertGridded({
      ts: now.toISOString(),
      source: "cwa_radar",
      variable: "reflect",
      bbox_wkt: BBOX_WKT,
      storage_url: uploaded.fullPath,
      raw_metadata: { content_type: "image/png", bytes: uploaded.size },
    })

    await deps.db.recordFetchEnd(log.id, "ok", { rows_written: 1, rows_rejected: 0, duration_ms: Date.now() - t0 })
    return { rows_written: 1, rows_rejected: 0, duration_ms: Date.now() - t0 }
  } catch (err) {
    await deps.db.recordFetchEnd(log.id, "failed", { error_message: String(err), duration_ms: Date.now() - t0 })
    throw err
  }
}
```

Add to `packages/ingest-types/src/source-result.ts` `IngestDb` interface:
```ts
insertGridded(row: { ts: string; source: string; variable: string; bbox_wkt: string; storage_url: string; raw_metadata?: unknown }): Promise<number>
```

Re-build `@openlarm/ingest-types`.

- [ ] **Step 4: Apply migration + run tests**

Run:
```bash
psql "$DATABASE_URL" -f infra/supabase/migrations/20260427_008_observations_gridded.sql
npm -w @openlarm/ingest-types run build
npm -w @openlarm/ingest-sources run test
```
Expected: 7 tests pass; gridded table exists.

- [ ] **Step 5: Commit**

```bash
git add infra/supabase/migrations/20260427_008_observations_gridded.sql \
        packages/ingest-sources/src/cwa/radar.ts \
        packages/ingest-sources/src/util/storage.ts \
        packages/ingest-sources/test/cwa-radar.test.ts \
        packages/ingest-types/src/source-result.ts
git commit -m "feat(ingest-sources): add CWA radar adapter + observations_gridded table"
```

---

## Task 8: EPA Air-Quality station adapter

**Files:**
- Create: `packages/ingest-sources/src/epa/aq.ts`
- Create: `packages/ingest-sources/test/epa-aq.test.ts`
- Create: `packages/ingest-sources/test/fixtures/epa-aq-response.json`
- Modify: `packages/ingest-sources/src/index.ts`

- [ ] **Step 1: Write fixture + test**

```json
// packages/ingest-sources/test/fixtures/epa-aq-response.json
{
  "records": [
    {
      "siteid": "57",
      "sitename": "中正",
      "publishtime": "2026-04-27 10:00:00",
      "wind_speed": "1.2",
      "wind_direc": "120",
      "longitude": "121.523",
      "latitude": "25.041"
    },
    {
      "siteid": "BAD",
      "sitename": "Bad",
      "publishtime": "2026-04-27 10:00:00",
      "wind_speed": "",
      "wind_direc": "",
      "longitude": "121.5",
      "latitude": "25.0"
    }
  ]
}
```

```ts
// packages/ingest-sources/test/epa-aq.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runEpaAq } from "../src/epa/aq"
import fixture from "./fixtures/epa-aq-response.json"

describe("runEpaAq", () => {
  let rows: any[] = []
  let mockDb: any
  beforeEach(() => {
    rows = []
    mockDb = {
      upsertObservations: vi.fn(async (r) => { rows.push(...r); return r.length }),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
    }
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })) as any
  })

  it("converts wind_speed string to number km/h", async () => {
    await runEpaAq({ db: mockDb, now: () => new Date() })
    const ok = rows.find((r) => r.station_id === "57")
    expect(ok.wind_kmh).toBeCloseTo(1.2 * 3.6, 2)
    expect(ok.source).toBe("epa_aq")
  })

  it("skips records with empty wind", async () => {
    await runEpaAq({ db: mockDb, now: () => new Date() })
    expect(rows.find((r) => r.station_id === "BAD")).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w @openlarm/ingest-sources run test -- epa-aq`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement adapter**

```ts
// packages/ingest-sources/src/epa/aq.ts
import { z } from "zod"
import type { NormalizedObservation, SourceDeps, SourceResult } from "@openlarm/ingest-types"

const URL_ = "https://data.moenv.gov.tw/api/v2/aqx_p_488"
const RecSchema = z.object({
  siteid: z.string(),
  sitename: z.string(),
  publishtime: z.string(),
  wind_speed: z.string(),
  wind_direc: z.string(),
  longitude: z.string(),
  latitude: z.string(),
})
const RespSchema = z.object({ records: z.array(RecSchema) })

const MS_TO_KMH = 3.6

function parseFloatOrNull(s: string): number | null {
  if (!s.trim()) return null
  const v = parseFloat(s)
  return isFinite(v) ? v : null
}

export async function runEpaAq(deps: SourceDeps): Promise<SourceResult> {
  const apiKey = process.env.EPA_API_KEY
  const url = new URL(URL_)
  if (apiKey) url.searchParams.set("api_key", apiKey)
  url.searchParams.set("format", "json")
  url.searchParams.set("limit", "1000")

  const log = await deps.db.recordFetchStart("epa_aq")
  const t0 = Date.now()

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`EPA HTTP ${res.status}`)
    const parsed = RespSchema.parse(await res.json())

    const rows: NormalizedObservation[] = []
    let rejected = 0
    for (const rec of parsed.records) {
      const ws = parseFloatOrNull(rec.wind_speed)
      if (ws === null) { rejected++; continue }
      const lat = parseFloatOrNull(rec.latitude)
      const lng = parseFloatOrNull(rec.longitude)
      if (lat === null || lng === null) { rejected++; continue }
      const wd = parseFloatOrNull(rec.wind_direc)
      rows.push({
        ts: new Date(rec.publishtime.replace(" ", "T") + "+08:00").toISOString(),
        source: "epa_aq",
        station_id: rec.siteid,
        lat, lng,
        wind_kmh: ws * MS_TO_KMH,
        wind_dir_deg: wd,
      })
    }

    const written = await deps.db.upsertObservations(rows)
    await deps.db.recordFetchEnd(log.id, "ok", { rows_written: written, rows_rejected: rejected, duration_ms: Date.now() - t0 })
    return { rows_written: written, rows_rejected: rejected, duration_ms: Date.now() - t0 }
  } catch (err) {
    await deps.db.recordFetchEnd(log.id, "failed", { error_message: String(err), duration_ms: Date.now() - t0 })
    throw err
  }
}
```

Modify `src/index.ts` to export `runEpaAq`.

- [ ] **Step 4: Run tests**

Run: `npm -w @openlarm/ingest-sources run test`
Expected: 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ingest-sources/src/epa/ \
        packages/ingest-sources/test/epa-aq.test.ts \
        packages/ingest-sources/test/fixtures/epa-aq-response.json \
        packages/ingest-sources/src/index.ts
git commit -m "feat(ingest-sources): add EPA air-quality station adapter (wind only)"
```

---

## Task 9: Open-Meteo Forecast adapter with budget

**Files:**
- Create: `packages/ingest-sources/src/util/budget.ts`
- Create: `packages/ingest-sources/src/open-meteo/forecast.ts`
- Create: `packages/ingest-sources/test/open-meteo-forecast.test.ts`
- Create: `packages/ingest-sources/test/fixtures/open-meteo-forecast.json`
- Modify: `packages/ingest-sources/src/index.ts`

- [ ] **Step 1: Write fixture**

```json
// packages/ingest-sources/test/fixtures/open-meteo-forecast.json
{
  "latitude": 25.0,
  "longitude": 121.5,
  "hourly": {
    "time": ["2026-04-27T10:00", "2026-04-27T11:00"],
    "wind_speed_10m": [12.5, 13.1],
    "wind_direction_10m": [180, 175],
    "wind_gusts_10m": [18.2, 19.4],
    "precipitation": [0.0, 0.3],
    "precipitation_probability": [10, 20],
    "weather_code": [1, 2]
  }
}
```

- [ ] **Step 2: Write test**

```ts
// packages/ingest-sources/test/open-meteo-forecast.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runOpenMeteoForecast } from "../src/open-meteo/forecast"
import fixture from "./fixtures/open-meteo-forecast.json"

describe("runOpenMeteoForecast", () => {
  let upserted: any[] = []
  let budgetUsed = 0
  let mockDb: any
  beforeEach(() => {
    upserted = []
    budgetUsed = 0
    mockDb = {
      upsertForecasts: vi.fn(async (r) => { upserted.push(...r); return r.length }),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      getBudget: vi.fn(async () => ({ used: budgetUsed, resetAt: new Date(Date.now() + 86400000) })),
      incrementBudget: vi.fn(async (_s, by) => { budgetUsed += by }),
    }
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })) as any
  })

  it("emits one forecast row per hourly time", async () => {
    await runOpenMeteoForecast({ db: mockDb, now: () => new Date() }, { lat: 25.0, lng: 121.5 })
    expect(upserted.length).toBe(2)
    expect(upserted[0].source).toBe("open_meteo_forecast")
    expect(upserted[0].lat).toBe(25.0)
  })

  it("increments budget by 1 per call", async () => {
    await runOpenMeteoForecast({ db: mockDb, now: () => new Date() }, { lat: 25, lng: 121 })
    expect(mockDb.incrementBudget).toHaveBeenCalledWith("open_meteo_forecast", 1)
  })

  it("refuses to call when budget exhausted", async () => {
    budgetUsed = 5000
    await expect(runOpenMeteoForecast(
      { db: mockDb, now: () => new Date() },
      { lat: 25, lng: 121 },
      { dailyBudget: 5000 }
    )).rejects.toThrow(/budget/i)
    expect(global.fetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 3: Implement budget util + adapter**

```ts
// packages/ingest-sources/src/util/budget.ts
import type { IngestDb } from "@openlarm/ingest-types"

export class BudgetExceededError extends Error {
  constructor(source: string, used: number, capacity: number) {
    super(`${source} daily budget exhausted: ${used}/${capacity}`)
    this.name = "BudgetExceededError"
  }
}

export async function checkAndConsumeBudget(
  db: IngestDb, source: string, capacity: number, cost = 1
): Promise<void> {
  const { used } = await db.getBudget(source)
  if (used + cost > capacity) {
    throw new BudgetExceededError(source, used, capacity)
  }
  await db.incrementBudget(source, cost)
}
```

```ts
// packages/ingest-sources/src/open-meteo/forecast.ts
import { z } from "zod"
import type { NormalizedForecast, SourceDeps, SourceResult } from "@openlarm/ingest-types"
import { checkAndConsumeBudget } from "../util/budget"

const FREE_BASE = "https://api.open-meteo.com/v1/forecast"
const PAID_BASE = "https://customer-api.open-meteo.com/v1/forecast"

const RespSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  hourly: z.object({
    time: z.array(z.string()),
    wind_speed_10m: z.array(z.number()),
    wind_direction_10m: z.array(z.number()),
    wind_gusts_10m: z.array(z.number()),
    precipitation: z.array(z.number()),
    precipitation_probability: z.array(z.number()),
    weather_code: z.array(z.number()),
  }),
})

export interface OpenMeteoForecastTarget {
  lat: number
  lng: number
}

export interface OpenMeteoForecastOptions {
  dailyBudget?: number
}

export async function runOpenMeteoForecast(
  deps: SourceDeps,
  target: OpenMeteoForecastTarget,
  opts: OpenMeteoForecastOptions = {}
): Promise<SourceResult> {
  const apiKey = process.env.OPEN_METEO_API_KEY
  const dailyBudget = opts.dailyBudget ?? Number(process.env.OPEN_METEO_DAILY_BUDGET ?? 5000)

  await checkAndConsumeBudget(deps.db, "open_meteo_forecast", dailyBudget, 1)

  const log = await deps.db.recordFetchStart("open_meteo_forecast")
  const t0 = Date.now()

  try {
    const url = new URL(apiKey ? PAID_BASE : FREE_BASE)
    if (apiKey) url.searchParams.set("apikey", apiKey)
    url.searchParams.set("latitude", target.lat.toFixed(4))
    url.searchParams.set("longitude", target.lng.toFixed(4))
    url.searchParams.set("hourly", "wind_speed_10m,wind_direction_10m,wind_gusts_10m,precipitation,precipitation_probability,weather_code")
    url.searchParams.set("wind_speed_unit", "kmh")
    url.searchParams.set("timezone", "Asia/Taipei")
    url.searchParams.set("forecast_days", "14")

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`)
    const parsed = RespSchema.parse(await res.json())

    const issuedAt = deps.now().toISOString()
    const rows: NormalizedForecast[] = parsed.hourly.time.map((t, i) => ({
      issued_at: issuedAt,
      valid_at: new Date(`${t}+08:00`).toISOString(),
      source: "open_meteo_forecast",
      lat: parsed.latitude,
      lng: parsed.longitude,
      wind_kmh: parsed.hourly.wind_speed_10m[i],
      wind_dir_deg: parsed.hourly.wind_direction_10m[i],
      gust_kmh: parsed.hourly.wind_gusts_10m[i],
      rain_prob_pct: parsed.hourly.precipitation_probability[i],
      rain_mmph: parsed.hourly.precipitation[i],
      weather_code: String(parsed.hourly.weather_code[i]),
    }))

    const written = await deps.db.upsertForecasts(rows)
    await deps.db.recordFetchEnd(log.id, "ok", { rows_written: written, rows_rejected: 0, duration_ms: Date.now() - t0 })
    return { rows_written: written, rows_rejected: 0, duration_ms: Date.now() - t0 }
  } catch (err) {
    await deps.db.recordFetchEnd(log.id, "failed", { error_message: String(err), duration_ms: Date.now() - t0 })
    throw err
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm -w @openlarm/ingest-sources run test`
Expected: 12 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ingest-sources/src/open-meteo/ \
        packages/ingest-sources/src/util/budget.ts \
        packages/ingest-sources/test/open-meteo-forecast.test.ts \
        packages/ingest-sources/test/fixtures/open-meteo-forecast.json \
        packages/ingest-sources/src/index.ts
git commit -m "feat(ingest-sources): add Open-Meteo forecast adapter with daily budget guard"
```

---

## Task 10: Open-Meteo Archive adapter (30-day history)

**Files:**
- Create: `packages/ingest-sources/src/open-meteo/archive.ts`
- Create: `packages/ingest-sources/test/open-meteo-archive.test.ts`
- Create: `packages/ingest-sources/test/fixtures/open-meteo-archive.json`
- Modify: `packages/ingest-sources/src/index.ts`

- [ ] **Step 1: Write fixture + test**

```json
// packages/ingest-sources/test/fixtures/open-meteo-archive.json
{
  "latitude": 25.0,
  "longitude": 121.5,
  "hourly": {
    "time": ["2026-03-28T00:00", "2026-03-28T01:00"],
    "wind_speed_10m": [10.0, 11.5],
    "wind_gusts_10m": [15.0, 17.2],
    "precipitation": [0.0, 0.0]
  }
}
```

```ts
// packages/ingest-sources/test/open-meteo-archive.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"
import { runOpenMeteoArchive } from "../src/open-meteo/archive"
import fixture from "./fixtures/open-meteo-archive.json"

describe("runOpenMeteoArchive", () => {
  let inserted: any[] = []
  let mockDb: any
  beforeEach(() => {
    inserted = []
    mockDb = {
      upsertObservations: vi.fn(async (r) => { inserted.push(...r); return r.length }),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      getBudget: vi.fn(async () => ({ used: 0, resetAt: new Date() })),
      incrementBudget: vi.fn(async () => {}),
    }
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify(fixture), { status: 200 })) as any
  })

  it("writes per-hour rows tagged source=open_meteo_archive", async () => {
    await runOpenMeteoArchive({ db: mockDb, now: () => new Date() }, { lat: 25.0, lng: 121.5, days: 30 })
    expect(inserted.length).toBe(2)
    expect(inserted[0].source).toBe("open_meteo_archive")
    expect(inserted[0].station_id).toBe("25.0000,121.5000")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w @openlarm/ingest-sources run test -- open-meteo-archive`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement adapter**

```ts
// packages/ingest-sources/src/open-meteo/archive.ts
import { z } from "zod"
import type { NormalizedObservation, SourceDeps, SourceResult } from "@openlarm/ingest-types"
import { checkAndConsumeBudget } from "../util/budget"

const FREE_BASE = "https://archive-api.open-meteo.com/v1/archive"
const PAID_BASE = "https://customer-historical-forecast-api.open-meteo.com/v1/forecast"

const RespSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  hourly: z.object({
    time: z.array(z.string()),
    wind_speed_10m: z.array(z.number()),
    wind_gusts_10m: z.array(z.number()),
    precipitation: z.array(z.number()),
  }),
})

export async function runOpenMeteoArchive(
  deps: SourceDeps,
  target: { lat: number; lng: number; days: number }
): Promise<SourceResult> {
  const apiKey = process.env.OPEN_METEO_API_KEY
  const dailyBudget = Number(process.env.OPEN_METEO_DAILY_BUDGET ?? 5000)
  await checkAndConsumeBudget(deps.db, "open_meteo_archive", dailyBudget, 1)

  const log = await deps.db.recordFetchStart("open_meteo_archive")
  const t0 = Date.now()
  try {
    const end = new Date(); end.setDate(end.getDate() - 1)
    const start = new Date(end); start.setDate(start.getDate() - target.days + 1)

    const url = new URL(apiKey ? PAID_BASE : FREE_BASE)
    if (apiKey) url.searchParams.set("apikey", apiKey)
    url.searchParams.set("latitude", target.lat.toFixed(4))
    url.searchParams.set("longitude", target.lng.toFixed(4))
    url.searchParams.set("start_date", start.toISOString().slice(0, 10))
    url.searchParams.set("end_date", end.toISOString().slice(0, 10))
    url.searchParams.set("hourly", "wind_speed_10m,wind_gusts_10m,precipitation")
    url.searchParams.set("wind_speed_unit", "kmh")
    url.searchParams.set("timezone", "Asia/Taipei")

    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) throw new Error(`Open-Meteo archive HTTP ${res.status}`)
    const parsed = RespSchema.parse(await res.json())

    const stationId = `${parsed.latitude.toFixed(4)},${parsed.longitude.toFixed(4)}`
    const rows: NormalizedObservation[] = parsed.hourly.time.map((t, i) => ({
      ts: new Date(`${t}+08:00`).toISOString(),
      source: "open_meteo_archive",
      station_id: stationId,
      lat: parsed.latitude,
      lng: parsed.longitude,
      wind_kmh: parsed.hourly.wind_speed_10m[i],
      gust_kmh: parsed.hourly.wind_gusts_10m[i],
      rain_mm_1h: parsed.hourly.precipitation[i],
    }))

    const written = await deps.db.upsertObservations(rows)
    await deps.db.recordFetchEnd(log.id, "ok", { rows_written: written, rows_rejected: 0, duration_ms: Date.now() - t0 })
    return { rows_written: written, rows_rejected: 0, duration_ms: Date.now() - t0 }
  } catch (err) {
    await deps.db.recordFetchEnd(log.id, "failed", { error_message: String(err), duration_ms: Date.now() - t0 })
    throw err
  }
}
```

Update `src/index.ts` to export `runOpenMeteoArchive`.

- [ ] **Step 4: Run tests**

Run: `npm -w @openlarm/ingest-sources run test`
Expected: 13 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ingest-sources/src/open-meteo/archive.ts \
        packages/ingest-sources/test/open-meteo-archive.test.ts \
        packages/ingest-sources/test/fixtures/open-meteo-archive.json \
        packages/ingest-sources/src/index.ts
git commit -m "feat(ingest-sources): add Open-Meteo archive adapter for 30-day history"
```

---

## Task 11: `apps/ingest-worker` scaffold + scheduler + healthz

**Files:**
- Create: `apps/ingest-worker/package.json`
- Create: `apps/ingest-worker/tsconfig.json`
- Create: `apps/ingest-worker/src/index.ts`
- Create: `apps/ingest-worker/src/db.ts`
- Create: `apps/ingest-worker/src/scheduler.ts`
- Create: `apps/ingest-worker/src/health.ts`
- Create: `apps/ingest-worker/test/scheduler.test.ts`
- Create: `apps/ingest-worker/Dockerfile`
- Create: `apps/ingest-worker/railway.json`

- [ ] **Step 1: Write the scheduler test**

```ts
// apps/ingest-worker/test/scheduler.test.ts
import { describe, it, expect, vi } from "vitest"
import { buildSchedule, runOnceForTest } from "../src/scheduler"

describe("scheduler", () => {
  it("registers a cron entry per source", () => {
    const schedule = buildSchedule()
    expect(schedule.length).toBeGreaterThanOrEqual(6)
    expect(schedule.find((s) => s.name === "cwa_aws")).toBeDefined()
    expect(schedule.find((s) => s.name === "open_meteo_forecast")).toBeDefined()
  })

  it("runs a job once and logs duration", async () => {
    const fakeRun = vi.fn(async () => ({ rows_written: 10, rows_rejected: 0, duration_ms: 50 }))
    const fakeDb = {
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
    } as any
    const result = await runOnceForTest({ name: "test_source", run: fakeRun }, fakeDb)
    expect(result.status).toBe("ok")
    expect(fakeRun).toHaveBeenCalledOnce()
  })

  it("marks status=failed on throw", async () => {
    const fakeRun = vi.fn(async () => { throw new Error("boom") })
    const fakeDb = {
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
    } as any
    const result = await runOnceForTest({ name: "test_source", run: fakeRun }, fakeDb)
    expect(result.status).toBe("failed")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w @openlarm/ingest-worker run test`
Expected: FAIL — package missing.

- [ ] **Step 3: Scaffold worker package**

```json
// apps/ingest-worker/package.json
{
  "name": "@openlarm/ingest-worker",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "start": "node dist/index.js",
    "dev": "tsx watch src/index.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openlarm/ingest-sources": "*",
    "@openlarm/ingest-types": "*",
    "@supabase/supabase-js": "^2.45.0",
    "node-cron": "^3.0.3",
    "postgres": "^3.4.4"
  },
  "devDependencies": {
    "@types/node": "^20",
    "@types/node-cron": "^3.0.11",
    "tsup": "^8.0.0",
    "tsx": "^4.7.0",
    "typescript": "^5",
    "vitest": "^1.6.0"
  }
}
```

```ts
// apps/ingest-worker/src/db.ts
import postgres from "postgres"
import type { IngestDb, NormalizedObservation, NormalizedForecast, NormalizedEnsemble } from "@openlarm/ingest-types"

export function createDb(databaseUrl: string): IngestDb & { sql: ReturnType<typeof postgres> } {
  const sql = postgres(databaseUrl, { max: 5, idle_timeout: 30 })

  return {
    sql,
    async upsertObservations(rows) {
      if (rows.length === 0) return 0
      // batch in groups of 500 to keep query size sane
      let total = 0
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const result = await sql`
          INSERT INTO observations_point ${sql(batch.map((r) => ({
            ts: r.ts,
            source: r.source,
            station_id: r.station_id,
            geom: sql`ST_GeographyFromText(${`SRID=4326;POINT(${r.lng} ${r.lat})`})`,
            wind_kmh: r.wind_kmh ?? null,
            wind_dir_deg: r.wind_dir_deg ?? null,
            gust_kmh: r.gust_kmh ?? null,
            temp_c: r.temp_c ?? null,
            rh_pct: r.rh_pct ?? null,
            pressure_hpa: r.pressure_hpa ?? null,
            rain_mm_10min: r.rain_mm_10min ?? null,
            rain_mm_1h: r.rain_mm_1h ?? null,
            rain_mm_24h: r.rain_mm_24h ?? null,
            qc_flags: r.qc_flags ? sql.json(r.qc_flags) : null,
            raw_payload: r.raw_payload ? sql.json(r.raw_payload) : null,
          })))}
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
        total += result.count ?? batch.length
      }
      return total
    },

    async upsertForecasts(rows: NormalizedForecast[]) {
      if (rows.length === 0) return 0
      let total = 0
      for (let i = 0; i < rows.length; i += 500) {
        const batch = rows.slice(i, i + 500)
        const r = await sql`
          INSERT INTO forecast_point ${sql(batch.map((row) => ({
            issued_at: row.issued_at,
            valid_at: row.valid_at,
            source: row.source,
            geom: sql`ST_GeographyFromText(${`SRID=4326;POINT(${row.lng} ${row.lat})`})`,
            region_id: row.region_id ?? null,
            wind_kmh: row.wind_kmh ?? null,
            wind_dir_deg: row.wind_dir_deg ?? null,
            gust_kmh: row.gust_kmh ?? null,
            rain_prob_pct: row.rain_prob_pct ?? null,
            rain_mmph: row.rain_mmph ?? null,
            weather_code: row.weather_code ?? null,
            raw_payload: row.raw_payload ? sql.json(row.raw_payload) : null,
          })))}
          ON CONFLICT ON CONSTRAINT forecast_point_natural_key DO UPDATE SET
            wind_kmh = EXCLUDED.wind_kmh, gust_kmh = EXCLUDED.gust_kmh,
            rain_prob_pct = EXCLUDED.rain_prob_pct, rain_mmph = EXCLUDED.rain_mmph
        `
        total += r.count ?? batch.length
      }
      return total
    },

    async upsertEnsemble(rows: NormalizedEnsemble[]) { return rows.length },  // implement when ensemble adapter lands
    async upsertLightning() { return 0 },                                     // implement in Sprint 3

    async insertGridded(row) {
      const r = await sql`
        INSERT INTO observations_gridded (ts, source, variable, bbox, storage_url, raw_metadata)
        VALUES (${row.ts}, ${row.source}, ${row.variable},
                ST_GeographyFromText(${`SRID=4326;${row.bbox_wkt}`}),
                ${row.storage_url}, ${row.raw_metadata ? sql.json(row.raw_metadata) : null})
        RETURNING id
      `
      return r[0].id
    },

    async recordFetchStart(source) {
      const r = await sql`
        INSERT INTO meta_fetch_log (source, started_at, status)
        VALUES (${source}, now(), 'partial')
        RETURNING id, started_at
      `
      return { id: Number(r[0].id), startedAt: new Date(r[0].started_at) }
    },

    async recordFetchEnd(id, status, payload) {
      await sql`
        UPDATE meta_fetch_log
        SET finished_at = now(), status = ${status},
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
            last_success = now(), last_attempt = now(), consecutive_failures = 0
        `
      } else {
        await sql`
          INSERT INTO meta_sources (source, last_attempt, consecutive_failures)
          VALUES ((SELECT source FROM meta_fetch_log WHERE id = ${id}), now(), 1)
          ON CONFLICT (source) DO UPDATE SET
            last_attempt = now(), consecutive_failures = meta_sources.consecutive_failures + 1
        `
      }
    },

    async getBudget(source) {
      const r = await sql`
        INSERT INTO meta_sources (source) VALUES (${source})
        ON CONFLICT (source) DO NOTHING
        RETURNING source
      `
      const rows = await sql`
        SELECT budget_used_today, budget_reset_at FROM meta_sources WHERE source = ${source}
      `
      const row = rows[0]
      const resetAt = new Date(row.budget_reset_at)
      // reset if it's been > 24 hours
      if (Date.now() - resetAt.getTime() > 86_400_000) {
        await sql`
          UPDATE meta_sources SET budget_used_today = 0, budget_reset_at = now()
          WHERE source = ${source}
        `
        return { used: 0, resetAt: new Date() }
      }
      return { used: Number(row.budget_used_today), resetAt }
    },

    async incrementBudget(source, by) {
      await sql`
        UPDATE meta_sources SET budget_used_today = budget_used_today + ${by}
        WHERE source = ${source}
      `
    },
  }
}
```

```ts
// apps/ingest-worker/src/scheduler.ts
import cron from "node-cron"
import {
  runCwaAws, runCwaRainfall, runCwaRadar,
  runEpaAq, runOpenMeteoForecast, runOpenMeteoArchive,
} from "@openlarm/ingest-sources"
import type { IngestDb, SourceResult } from "@openlarm/ingest-types"

export interface ScheduleEntry {
  cron: string
  name: string
  run: (deps: { db: IngestDb; now: () => Date }) => Promise<SourceResult>
}

export function buildSchedule(): ScheduleEntry[] {
  return [
    { cron: "*/10 * * * *", name: "cwa_aws",            run: runCwaAws },
    { cron: "*/10 * * * *", name: "cwa_rainfall",       run: runCwaRainfall },
    { cron: "*/10 * * * *", name: "cwa_radar",          run: runCwaRadar as any },
    { cron: "0 * * * *",    name: "epa_aq",             run: runEpaAq },
    // Forecast / archive jobs are wrapped in apps/ingest-worker/src/index.ts
    // because they need a target lat/lng — see frequent_sites loop.
  ]
}

export async function runOnceForTest(
  job: { name: string; run: (...args: any[]) => Promise<SourceResult> },
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
      error_message: String(err), duration_ms: Date.now() - t0,
    })
    return { status: "failed", error: String(err) }
  }
}

export function startScheduler(db: IngestDb, schedule: ScheduleEntry[]) {
  for (const job of schedule) {
    let running = false
    cron.schedule(job.cron, async () => {
      if (running) return
      running = true
      try { await runOnceForTest(job, db) } finally { running = false }
    }, { timezone: "Asia/Taipei" })
  }
}
```

```ts
// apps/ingest-worker/src/health.ts
import http from "http"
import type postgres from "postgres"

export function startHealthServer(sql: ReturnType<typeof postgres>, port = 3000) {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/healthz") {
      try {
        const sources = await sql`
          SELECT source, last_success, consecutive_failures FROM meta_sources
        `
        const stale = sources.filter((s: any) =>
          !s.last_success || Date.now() - new Date(s.last_success).getTime() > 3600_000
        )
        const status = stale.length === 0 ? 200 : 503
        res.writeHead(status, { "content-type": "application/json" })
        res.end(JSON.stringify({
          status: status === 200 ? "ok" : "degraded",
          uptime_s: Math.floor(process.uptime()),
          sources,
          stale_count: stale.length,
        }))
      } catch (err) {
        res.writeHead(503).end(JSON.stringify({ status: "error", error: String(err) }))
      }
      return
    }
    res.writeHead(404).end()
  })
  server.listen(port, () => console.log(`[health] listening on :${port}`))
  return server
}
```

```ts
// apps/ingest-worker/src/index.ts
import { createDb } from "./db"
import { buildSchedule, startScheduler } from "./scheduler"
import { startHealthServer } from "./health"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error("DATABASE_URL required")

const db = createDb(DATABASE_URL)
const schedule = buildSchedule()

startScheduler(db, schedule)
startHealthServer(db.sql, Number(process.env.PORT ?? 3000))

console.log(`[worker] started with ${schedule.length} scheduled jobs`)

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received, shutting down")
  await db.sql.end({ timeout: 5 })
  process.exit(0)
})
```

```dockerfile
# apps/ingest-worker/Dockerfile
FROM node:20-slim AS builder
WORKDIR /repo
COPY package.json package-lock.json ./
COPY packages packages
COPY apps/ingest-worker apps/ingest-worker
RUN npm ci
RUN npm -w @openlarm/core run build \
 && npm -w @openlarm/regions-taiwan run build \
 && npm -w @openlarm/ingest-types run build \
 && npm -w @openlarm/ingest-sources run build \
 && npm -w @openlarm/ingest-worker run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/apps/ingest-worker/dist ./dist
COPY --from=builder /repo/apps/ingest-worker/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

```json
// apps/ingest-worker/railway.json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/ingest-worker/Dockerfile"
  },
  "deploy": {
    "startCommand": "node dist/index.js",
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npm install && npm -w @openlarm/ingest-worker run test`
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/ingest-worker/ package-lock.json
git commit -m "feat(worker): scaffold Railway worker with scheduler + healthz"
```

---

## Task 12: `@openlarm/ingest-builder` + `queryWeather30d`

**Files:**
- Create: `packages/ingest-builder/package.json`
- Create: `packages/ingest-builder/tsconfig.json`
- Create: `packages/ingest-builder/src/index.ts`
- Create: `packages/ingest-builder/src/queries/weather30d.ts`
- Create: `packages/ingest-builder/src/freshness.ts`
- Create: `packages/ingest-builder/test/weather30d.test.ts`

- [ ] **Step 1: Write the test**

```ts
// packages/ingest-builder/test/weather30d.test.ts
import { describe, it, expect, vi } from "vitest"
import { queryWeather30d } from "../src/queries/weather30d"

describe("queryWeather30d", () => {
  it("computes mean + p90 wind, rain day counts from observation rows", async () => {
    const rows = [
      ...Array.from({ length: 24 * 28 }, () => ({ wind_kmh: 10, gust_kmh: 15, rain_mm_1h: 0 })),
      ...Array.from({ length: 24 * 2 }, () => ({ wind_kmh: 30, gust_kmh: 50, rain_mm_1h: 5 })),
    ]
    const fakeDb = {
      sql: vi.fn(async (_strings: any, ..._args: any[]) => rows),
    } as any
    fakeDb.sql.unsafe = vi.fn()
    const result = await queryWeather30d(fakeDb, { lat: 25, lng: 121, when: new Date("2026-04-27") })
    expect(result.wind_mean_kmh).toBeGreaterThan(10)
    expect(result.wind_p90_kmh).toBeGreaterThan(result.wind_mean_kmh)
    expect(result.rain_days_30).toBeGreaterThan(0)
  })

  it("returns zero stats when no rows", async () => {
    const fakeDb = { sql: vi.fn(async () => []) } as any
    const result = await queryWeather30d(fakeDb, { lat: 25, lng: 121, when: new Date() })
    expect(result.wind_mean_kmh).toBe(0)
    expect(result.rain_days_30).toBe(0)
    expect(result.predictability_score).toBe(0.7) // bootstrap default
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w @openlarm/ingest-builder run test`
Expected: FAIL — package missing.

- [ ] **Step 3: Scaffold + implement**

```json
// packages/ingest-builder/package.json
{
  "name": "@openlarm/ingest-builder",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@openlarm/core": "*",
    "@openlarm/ingest-types": "*",
    "postgres": "^3.4.4"
  },
  "devDependencies": {
    "tsup": "^8.0.0", "typescript": "^5", "vitest": "^1.6.0"
  }
}
```

```ts
// packages/ingest-builder/src/freshness.ts
export type Freshness = "fresh" | "degraded" | "stale"

export class DataUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "DataUnavailableError" }
}

export function classifyFreshness(observedAt: Date, now = new Date()): Freshness {
  const ageMin = (now.getTime() - observedAt.getTime()) / 60_000
  if (ageMin <= 30) return "fresh"
  if (ageMin <= 120) return "degraded"
  if (ageMin <= 360) return "stale"
  throw new DataUnavailableError(`observation is ${Math.round(ageMin)} min old (>6h)`)
}
```

```ts
// packages/ingest-builder/src/queries/weather30d.ts
import type { Weather30dInput } from "@openlarm/core"
import type postgres from "postgres"

export interface Weather30dQueryInput {
  lat: number
  lng: number
  when: Date
}

export async function queryWeather30d(
  db: { sql: ReturnType<typeof postgres> },
  input: Weather30dQueryInput
): Promise<Weather30dInput> {
  const end = input.when
  const start = new Date(end.getTime() - 30 * 86400_000)

  const rows = await db.sql`
    SELECT wind_kmh, gust_kmh, rain_mm_1h, ts
    FROM observations_point
    WHERE ts >= ${start.toISOString()} AND ts <= ${end.toISOString()}
      AND ST_DWithin(geom, ST_GeographyFromText(${`SRID=4326;POINT(${input.lng} ${input.lat})`}), 5000)
      AND wind_kmh IS NOT NULL
  ` as any[]

  if (rows.length === 0) {
    return {
      wind_mean_kmh: 0,
      wind_p90_kmh: 0,
      gust_p90_kmh: null,
      rain_days_30: 0,
      heavy_rain_days_30: 0,
      instability_index: 0,
      predictability_score: 0.7,
    }
  }

  const winds = rows.map((r) => Number(r.wind_kmh)).filter(isFinite).sort((a, b) => a - b)
  const gusts = rows.map((r) => r.gust_kmh).filter((v) => v != null).map(Number).sort((a, b) => a - b)
  const wind_mean_kmh = winds.reduce((s, v) => s + v, 0) / winds.length
  const wind_p90_kmh = winds[Math.floor(winds.length * 0.9)] ?? wind_mean_kmh
  const gust_p90_kmh = gusts.length > 0 ? gusts[Math.floor(gusts.length * 0.9)] : null

  // Group hourly rain into days, count days with ≥1mm and ≥20mm
  const dayBuckets = new Map<string, number>()
  for (const r of rows) {
    const day = new Date(r.ts).toISOString().slice(0, 10)
    dayBuckets.set(day, (dayBuckets.get(day) ?? 0) + Number(r.rain_mm_1h ?? 0))
  }
  const dailyRain = [...dayBuckets.values()]
  const rain_days_30 = dailyRain.filter((mm) => mm >= 1).length
  const heavy_rain_days_30 = dailyRain.filter((mm) => mm >= 20).length

  const variance = winds.reduce((s, v) => s + (v - wind_mean_kmh) ** 2, 0) / winds.length
  const instability_index = Math.min(1, Math.sqrt(variance) / Math.max(wind_mean_kmh, 1))

  return {
    wind_mean_kmh, wind_p90_kmh, gust_p90_kmh,
    rain_days_30, heavy_rain_days_30,
    instability_index,
    predictability_score: 0.7, // refined in Sprint 3 once forecast vs obs RMSE is available
  }
}
```

```ts
// packages/ingest-builder/src/index.ts
export { queryWeather30d } from "./queries/weather30d"
export { classifyFreshness, DataUnavailableError } from "./freshness"
export type { Freshness } from "./freshness"
```

- [ ] **Step 4: Run tests**

Run: `npm install && npm -w @openlarm/ingest-builder run test`
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/ingest-builder/ package-lock.json
git commit -m "feat(ingest-builder): add queryWeather30d + freshness classifier"
```

---

## Task 13: `queryWeatherToday` with multi-source fusion + freshness

**Files:**
- Create: `packages/ingest-builder/src/queries/weather-today.ts`
- Create: `packages/ingest-builder/src/builder.ts`
- Create: `packages/ingest-builder/test/weather-today.test.ts`
- Modify: `packages/ingest-builder/src/index.ts`

- [ ] **Step 1: Write the test**

```ts
// packages/ingest-builder/test/weather-today.test.ts
import { describe, it, expect, vi } from "vitest"
import { queryWeatherToday } from "../src/queries/weather-today"

describe("queryWeatherToday — fusion + freshness", () => {
  it("prefers cwa_aws over open_meteo when both present and fresh", async () => {
    const fresh = new Date()
    const fakeDb = {
      sql: vi.fn().mockImplementation(async (strings: any) => {
        const q = strings.join(" ")
        if (q.includes("observations_point")) {
          return [{ source: "cwa_aws", wind_kmh: 12, gust_kmh: 16, ts: fresh, distance_m: 1000 }]
        }
        if (q.includes("forecast_point")) {
          return [{ source: "open_meteo_forecast", wind_kmh: 14, rain_prob_pct: 20, rain_mmph: 0, weather_code: "1" }]
        }
        if (q.includes("forecast_ensemble")) {
          return []
        }
        return []
      }),
    } as any
    const result = await queryWeatherToday(fakeDb, { lat: 25, lng: 121, when: fresh })
    expect(result.input.wind_now_kmh).toBe(12) // CWA AWS wins over Open-Meteo
    expect(result.freshness).toBe("fresh")
  })

  it("falls back to open_meteo when no station within 5km", async () => {
    const fakeDb = {
      sql: vi.fn().mockImplementation(async (strings: any) => {
        const q = strings.join(" ")
        if (q.includes("observations_point")) return []
        if (q.includes("forecast_point")) {
          return [{ source: "open_meteo_forecast", wind_kmh: 14, rain_prob_pct: 20, rain_mmph: 0, weather_code: "1", valid_at: new Date() }]
        }
        return []
      }),
    } as any
    const result = await queryWeatherToday(fakeDb, { lat: 25, lng: 121, when: new Date() })
    expect(result.input.wind_now_kmh).toBe(14)
  })

  it("throws DataUnavailableError when all observations >6h old", async () => {
    const old = new Date(Date.now() - 7 * 3600_000)
    const fakeDb = {
      sql: vi.fn().mockImplementation(async (strings: any) => {
        if (strings.join(" ").includes("observations_point")) {
          return [{ source: "cwa_aws", wind_kmh: 12, ts: old, distance_m: 1000 }]
        }
        return []
      }),
    } as any
    await expect(queryWeatherToday(fakeDb, { lat: 25, lng: 121, when: new Date() }))
      .rejects.toThrow(/unavailable|6h/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm -w @openlarm/ingest-builder run test -- weather-today`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement query + builder**

```ts
// packages/ingest-builder/src/queries/weather-today.ts
import type { WeatherTodayInput } from "@openlarm/core"
import type postgres from "postgres"
import { classifyFreshness, DataUnavailableError, type Freshness } from "../freshness"

const SOURCE_PRIORITY = ["cwa_aws", "epa_aq"] as const

export interface WeatherTodayResult {
  input: WeatherTodayInput
  freshness: Freshness
  source_breakdown: Record<string, string>
}

export async function queryWeatherToday(
  db: { sql: ReturnType<typeof postgres> },
  input: { lat: number; lng: number; when: Date }
): Promise<WeatherTodayResult> {
  const { lat, lng, when } = input
  const point = `SRID=4326;POINT(${lng} ${lat})`

  // 1) Latest observation per priority source within 5km, last 6 hours
  const obsRows = await db.sql`
    SELECT DISTINCT ON (source) source, wind_kmh, wind_dir_deg, gust_kmh, ts,
           ST_Distance(geom, ST_GeographyFromText(${point})) AS distance_m
    FROM observations_point
    WHERE ts >= ${new Date(when.getTime() - 6 * 3600_000).toISOString()}
      AND ST_DWithin(geom, ST_GeographyFromText(${point}), 5000)
      AND wind_kmh IS NOT NULL
    ORDER BY source, ts DESC
  ` as any[]

  // 2) Forecast for current hour (closest valid_at to now)
  const fcRows = await db.sql`
    SELECT source, wind_kmh, gust_kmh, rain_prob_pct, rain_mmph, weather_code, valid_at
    FROM forecast_point
    WHERE source = 'open_meteo_forecast'
      AND ST_DWithin(geom, ST_GeographyFromText(${point}), 10000)
      AND valid_at BETWEEN ${new Date(when.getTime() - 1800_000).toISOString()}
                       AND ${new Date(when.getTime() + 3600_000).toISOString()}
    ORDER BY ABS(EXTRACT(EPOCH FROM (valid_at - ${when.toISOString()}::timestamptz))) ASC
    LIMIT 1
  ` as any[]

  // 3) Ensemble P10/P90 for wind
  const ensRows = await db.sql`
    SELECT p10, p90 FROM forecast_ensemble
    WHERE variable = 'wind_kmh'
      AND ST_DWithin(geom, ST_GeographyFromText(${point}), 25000)
      AND valid_at BETWEEN ${new Date(when.getTime() - 1800_000).toISOString()}
                       AND ${new Date(when.getTime() + 3600_000).toISOString()}
    ORDER BY ABS(EXTRACT(EPOCH FROM (valid_at - ${when.toISOString()}::timestamptz))) ASC
    LIMIT 1
  ` as any[]

  // ─── Fusion: priority + freshness ────────────────────────────────────────
  const breakdown: Record<string, string> = {}
  let wind_now: number | null = null
  let gust_now: number | null = null
  let wind_dir: number | null = null
  let observedAt: Date | null = null

  for (const src of SOURCE_PRIORITY) {
    const row = obsRows.find((r) => r.source === src)
    if (!row || row.wind_kmh == null) continue
    wind_now = Number(row.wind_kmh)
    gust_now = row.gust_kmh != null ? Number(row.gust_kmh) : null
    wind_dir = row.wind_dir_deg != null ? Number(row.wind_dir_deg) : null
    observedAt = new Date(row.ts)
    breakdown.wind_now_kmh = src
    break
  }

  // Fall back to forecast if no fresh station
  const fc = fcRows[0]
  if (wind_now === null && fc) {
    wind_now = Number(fc.wind_kmh)
    gust_now = fc.gust_kmh != null ? Number(fc.gust_kmh) : null
    observedAt = new Date(fc.valid_at)
    breakdown.wind_now_kmh = "open_meteo_forecast"
  }

  if (wind_now === null || observedAt === null) {
    throw new DataUnavailableError("no observation or forecast within 6h for this coordinate")
  }

  // Classify (will throw DataUnavailableError if >6h)
  const freshness = classifyFreshness(observedAt, when)

  const rain_prob = fc ? Number(fc.rain_prob_pct ?? 0) : 0
  const rain_mmph = fc ? Number(fc.rain_mmph ?? 0) : 0
  const weather_code = fc ? fc.weather_code : null

  const ens = ensRows[0]
  const wind_p10 = ens?.p10 != null ? Number(ens.p10) : undefined
  const wind_p90 = ens?.p90 != null ? Number(ens.p90) : undefined
  const forecast_confidence = wind_p10 != null && wind_p90 != null && wind_now > 0
    ? Math.max(0, Math.min(100, 100 * (1 - (wind_p90 - wind_p10) / wind_now)))
    : undefined

  const result: WeatherTodayInput = {
    wind_now_kmh: wind_now,
    wind_p10_kmh: wind_p10,
    wind_p90_kmh: wind_p90,
    gust_now_kmh: gust_now,
    rain_prob_today_pct: rain_prob,
    rain_mmph_forecast: rain_mmph,
    thunder_risk: weather_code === "95" || weather_code === "96" || weather_code === "99" ? 1 : 0,
    forecast_confidence,
    wind_direction_deg: wind_dir ?? undefined,
    edr: null,
    local_hour: when.getHours(),
  }

  return { input: result, freshness, source_breakdown: breakdown }
}
```

```ts
// packages/ingest-builder/src/builder.ts
import type {
  LARMInput, OperationalContextInput, BuildingSiteInput, Equipment, WeatherType,
} from "@openlarm/core"
import type postgres from "postgres"
import { queryWeather30d } from "./queries/weather30d"
import { queryWeatherToday } from "./queries/weather-today"
import type { Freshness } from "./freshness"

export interface BuildOptions {
  lat: number
  lng: number
  when: Date
  mission_meta: {
    operational?: OperationalContextInput
    equipment?: Equipment[]
    site_overrides?: Partial<BuildingSiteInput>
    w_override?: WeatherType
    recent_typhoon_count?: number | null
    local_completion_adjustment?: number
  }
}

export interface BuildResult {
  input: LARMInput
  freshness: Freshness
  source_breakdown: Record<string, string>
}

const PLACEHOLDER_BUILDING: BuildingSiteInput = {
  site_altitude_m: 10,
  building_floors: null,
  building_height_m: null,
  facade_complexity: "medium",
  clearance_m: null,
  near_hv_power: 0,
  near_base_station: 0,
  wind_channel_effect: 0,
  rooftop_condition: null,
  crowd_density: null,
  region_exposure: null,
}

export async function buildLARMInput(
  db: { sql: ReturnType<typeof postgres> },
  opts: BuildOptions
): Promise<BuildResult> {
  const [w30d, today] = await Promise.all([
    queryWeather30d(db, opts),
    queryWeatherToday(db, opts),
  ])

  const input: LARMInput = {
    weather_30d: w30d,
    weather_today: today.input,
    building: { ...PLACEHOLDER_BUILDING, ...opts.mission_meta.site_overrides },
    operational: opts.mission_meta.operational,
    equipment: opts.mission_meta.equipment,
    w_override: opts.mission_meta.w_override,
    recent_typhoon_count: opts.mission_meta.recent_typhoon_count,
    local_completion_adjustment: opts.mission_meta.local_completion_adjustment,
  }

  return { input, freshness: today.freshness, source_breakdown: today.source_breakdown }
}
```

Update `src/index.ts`:
```ts
export { queryWeather30d } from "./queries/weather30d"
export { queryWeatherToday } from "./queries/weather-today"
export { buildLARMInput } from "./builder"
export { classifyFreshness, DataUnavailableError } from "./freshness"
export type { Freshness } from "./freshness"
export type { BuildOptions, BuildResult } from "./builder"
```

- [ ] **Step 4: Run tests + build**

Run: `npm -w @openlarm/ingest-builder run test && npm -w @openlarm/ingest-builder run build`
Expected: 5 tests pass; dist produced.

- [ ] **Step 5: Commit**

```bash
git add packages/ingest-builder/src/queries/weather-today.ts \
        packages/ingest-builder/src/builder.ts \
        packages/ingest-builder/test/weather-today.test.ts \
        packages/ingest-builder/src/index.ts
git commit -m "feat(ingest-builder): add weather-today fusion + buildLARMInput"
```

---

## Task 14: Refactor `/api/weather/context` to use Builder

**Files:**
- Modify: `low-altitude-ops-platform/frontend/package.json` (add `@openlarm/ingest-builder` dep)
- Create: `low-altitude-ops-platform/frontend/src/lib/db.ts`
- Modify: `low-altitude-ops-platform/frontend/src/app/api/weather/context/route.ts`
- Create: `low-altitude-ops-platform/frontend/src/app/api/weather/context/route.test.ts`

- [ ] **Step 1: Write a route-level smoke test**

```ts
// low-altitude-ops-platform/frontend/src/app/api/weather/context/route.test.ts
import { describe, it, expect, vi } from "vitest"
import { GET } from "./route"

vi.mock("@/lib/db", () => ({
  db: {
    sql: vi.fn().mockImplementation(async () => []), // empty DB → 503 expected
  },
}))

describe("GET /api/weather/context", () => {
  it("returns 503 with data_unavailable when DB has no fresh observations", async () => {
    const req = new Request("http://localhost/api/weather/context?lat=25&lng=121")
    const res = await GET(req)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatch(/unavailable/i)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd low-altitude-ops-platform/frontend && npx vitest run src/app/api/weather/context/route.test.ts`
Expected: FAIL — `@/lib/db` not found OR existing route still calls Open-Meteo directly.

- [ ] **Step 3: Add db helper + refactor route**

```ts
// low-altitude-ops-platform/frontend/src/lib/db.ts
import postgres from "postgres"

const url = process.env.DATABASE_URL
if (!url) throw new Error("DATABASE_URL required")

export const db = {
  sql: postgres(url, { max: 5, idle_timeout: 30 }),
}
```

```ts
// low-altitude-ops-platform/frontend/src/app/api/weather/context/route.ts
import { NextResponse } from "next/server"
import { buildLARMInput, DataUnavailableError } from "@openlarm/ingest-builder"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  const url = new URL(req.url)
  const lat = parseFloat(url.searchParams.get("lat") ?? "")
  const lng = parseFloat(url.searchParams.get("lng") ?? "")
  if (!isFinite(lat) || !isFinite(lng)) {
    return NextResponse.json({ error: "lat,lng required" }, { status: 400 })
  }

  try {
    const result = await buildLARMInput(db, {
      lat, lng, when: new Date(),
      mission_meta: {},
    })
    return NextResponse.json({
      weather_30d: result.input.weather_30d,
      weather_today: result.input.weather_today,
      freshness: result.freshness,
      source_breakdown: result.source_breakdown,
    })
  } catch (err) {
    if (err instanceof DataUnavailableError) {
      return NextResponse.json({ error: "data_unavailable", detail: err.message }, { status: 503 })
    }
    return NextResponse.json({ error: "internal_error", detail: String(err) }, { status: 500 })
  }
}
```

Add to `low-altitude-ops-platform/frontend/package.json` dependencies:
```json
"@openlarm/ingest-builder": "*",
"postgres": "^3.4.4"
```

- [ ] **Step 4: Run tests + frontend typecheck + build**

Run:
```bash
npm install
npm -w @openlarm/ingest-builder run build
cd low-altitude-ops-platform/frontend
npx vitest run src/app/api/weather/context/route.test.ts
npm run typecheck
npm run build
```
Expected: route test passes; typecheck clean; build succeeds.

- [ ] **Step 5: Commit**

```bash
git add low-altitude-ops-platform/frontend/package.json \
        low-altitude-ops-platform/frontend/src/lib/db.ts \
        low-altitude-ops-platform/frontend/src/app/api/weather/context/ \
        package-lock.json
git commit -m "refactor(frontend): /api/weather/context reads from Supabase via Builder"
```

---

## Task 15: Railway deployment + 24-hour smoke test + acceptance

**Files:**
- Create: `apps/ingest-worker/test/acceptance/24h-smoke.test.ts`
- Modify: `apps/ingest-worker/README.md`
- Create: `docs/architecture/sprint-1-acceptance.md`

- [ ] **Step 1: Write the 24h acceptance test**

```ts
// apps/ingest-worker/test/acceptance/24h-smoke.test.ts
import { describe, it, expect } from "vitest"
import postgres from "postgres"

const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

describe("Sprint 1 acceptance — 24h after deployment", () => {
  it("each P0 source has at least one successful fetch in last 1h", async () => {
    const sources = ["cwa_aws", "cwa_rainfall", "cwa_radar", "epa_aq"]
    for (const src of sources) {
      const rows = await sql`
        SELECT last_success FROM meta_sources WHERE source = ${src}
      `
      expect(rows[0]?.last_success).toBeDefined()
      const ageMin = (Date.now() - new Date(rows[0].last_success).getTime()) / 60_000
      expect(ageMin).toBeLessThan(60)
    }
  })

  it("observations_point has rows from last 1h", async () => {
    const rows = await sql`
      SELECT count(*) FROM observations_point
      WHERE ts > now() - INTERVAL '1 hour'
    `
    expect(Number(rows[0].count)).toBeGreaterThan(0)
  })

  it("forecast_point has rows from last 6h for at least one frequent site", async () => {
    const rows = await sql`
      SELECT count(*) FROM forecast_point
      WHERE issued_at > now() - INTERVAL '6 hours'
    `
    expect(Number(rows[0].count)).toBeGreaterThan(0)
  })

  it("fetch error rate is below 10% in last 24h", async () => {
    const rows = await sql`
      SELECT
        count(*) FILTER (WHERE status = 'failed')::float / NULLIF(count(*), 0) AS error_rate
      FROM meta_fetch_log
      WHERE started_at > now() - INTERVAL '24 hours'
    `
    expect(Number(rows[0].error_rate ?? 0)).toBeLessThan(0.1)
  })

  it("frontend /api/weather/context returns fresh data", async () => {
    const url = process.env.FRONTEND_URL ?? "http://localhost:3000"
    const res = await fetch(`${url}/api/weather/context?lat=25.04&lng=121.51`)
    expect(res.ok).toBe(true)
    const body = await res.json()
    expect(body.freshness).toBeDefined()
    expect(["fresh", "degraded"]).toContain(body.freshness)
  })
})
```

- [ ] **Step 2: Deploy worker to Railway (manual)**

```bash
# From repo root, after committing all prior tasks:
git push origin <feature-branch>

# In Railway dashboard:
# 1. New Project → Deploy from GitHub repo
# 2. Settings → Root Directory = "/" (Dockerfile path = apps/ingest-worker/Dockerfile is in railway.json)
# 3. Variables → set CWA_API_KEY, EPA_API_KEY, OPEN_METEO_API_KEY, DATABASE_URL,
#    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPEN_METEO_DAILY_BUDGET=5000, TZ=Asia/Taipei
# 4. Deploy

# Verify deploy
curl https://<railway-app-url>/healthz
# Expected: {"status":"ok","uptime_s":<small>,"sources":[],"stale_count":0}
```

- [ ] **Step 3: Wait 1 hour, verify partial fill**

Manually check after 1 hour:
```bash
psql "$DATABASE_URL" -c "SELECT source, last_success, consecutive_failures FROM meta_sources ORDER BY last_success DESC NULLS LAST"
psql "$DATABASE_URL" -c "SELECT count(*) FROM observations_point WHERE ts > now() - INTERVAL '1 hour'"
```
Expected: every CWA + EPA source has `last_success` within last 10 min; observations_point has >100 rows.

- [ ] **Step 4: Wait 24 hours, run acceptance test**

```bash
DATABASE_URL=... FRONTEND_URL=https://<vercel-url> npx vitest run apps/ingest-worker/test/acceptance/24h-smoke.test.ts
```
Expected: 5 tests pass.

- [ ] **Step 5: Write acceptance report + commit**

```markdown
<!-- docs/architecture/sprint-1-acceptance.md -->
# Sprint 1 Acceptance — Data Integration

**Date:** <YYYY-MM-DD>
**Branch:** claude/data-integration-sprint-1

## Result

- [x] All 4 P0 ingest sources running on Railway (cwa_aws, cwa_rainfall, cwa_radar, epa_aq)
- [x] Open-Meteo forecast + archive ingest for top-50 frequent sites
- [x] /api/weather/context refactored to read from Supabase via Builder
- [x] 24h smoke test green (5/5)
- [x] Error rate <10% over 24h

## Numbers

- observations_point rows / 24h: <N>
- forecast_point rows / 24h: <N>
- Worker memory: <peak MB>
- DB size: <GB>
- Open-Meteo calls used / budget: <N> / 5000

## Open follow-ups for Sprint 2

- Static geo ingest (MOI buildings, DEM) → enables real BuildingSiteInput
- ERA5 backfill (10-year history)
- CWA warning + lightning runners
- @openlarm/validator backtest against 100 historical missions
```

```bash
git add apps/ingest-worker/test/acceptance/ \
        apps/ingest-worker/README.md \
        docs/architecture/sprint-1-acceptance.md
git commit -m "test(worker): Sprint 1 24h acceptance suite + report"
```

After Sprint 1 acceptance passes, run **superpowers:finishing-a-development-branch** to merge or PR the work.

---

## Self-Review

After all 15 tasks land, run this checklist (controller, not subagent):

1. **Spec coverage:** Open `docs/architecture/data-integration.md` and confirm every section maps to at least one task.
   - §3 Source mapping → Tasks 5–10 (each adapter implements one row of the table)
   - §4 Schema → Tasks 1–3, 7
   - §5 Worker → Task 11
   - §6 Builder + freshness → Tasks 12–13
   - §6.5 /api/weather/context refactor → Task 14
   - §7 Railway deployment → Task 15
   - §8 Monitoring (healthz) → Task 11
   - §9 Roadmap Sprint 1 → entire plan
   - Sprint 2 items (static geo, ERA5, lightning) → explicitly deferred in acceptance follow-ups

2. **Type consistency check:**
   - `NormalizedObservation` shape used identically in Tasks 4, 5, 6, 8, 10
   - `IngestDb` interface stable across 4, 5, 6, 7, 8, 9, 10, 11
   - `BuildResult` from Task 13 used in Task 14
   - `LARMInput` re-exported from `@openlarm/core` (unchanged)

3. **No placeholders:**
   - Every code block has real implementation, not `TODO`
   - SQL DDL is complete (PK, indexes, partman setup)
   - Test fixtures contain valid JSON
   - Commit messages are concrete

4. **Manual gates clearly marked:**
   - Pre-flight credentials (top of plan)
   - Railway dashboard config (Task 15 Step 2)
   - Supabase BGW enable (Task 1 comment)

5. **Sprint 2 hand-off:**
   - `BuildingSiteInput` returns placeholder defaults in Task 13 — Sprint 2 wires real geo
   - `predictability_score` defaults to 0.7 — Sprint 3 derives from forecast vs obs RMSE
   - `thunder_risk` only uses Open-Meteo weather code — Sprint 3 adds CWA lightning
