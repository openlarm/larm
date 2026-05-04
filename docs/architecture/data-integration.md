# Data Integration Architecture

> **Status:** Design Draft v0.1 — 2026-04-27
> **Owner:** 段書元
> **Related:** [`data_sources.yaml`](../data/data_sources.yaml) (registry), [`packages/core/src/types/index.ts`](../../packages/core/src/types/index.ts) (LARMInput contract)
> **Scope:** This document describes how external observational + forecast data flows from third-party sources into the LARM v2.0 risk engine via a Railway-hosted ingest worker. It is the source of truth for the "data plumbing" layer that sits between raw APIs and `evaluateRisk()`.

---

## 0. TL;DR

| Layer | Purpose | Tech |
|---|---|---|
| **Sources** (41 listed in `data_sources.yaml`) | Official + commercial weather/geo APIs | CWA, ECMWF, NOAA, Open-Meteo, etc. |
| **Worker** (Railway, 24/7) | Scheduled fetch + QC + normalize + store | Node.js + node-cron + TypeScript |
| **Storage** (Supabase Postgres + PostGIS) | Append-only time-series + spatial joins | Postgres 17 + `pg_partman` monthly partitioning |
| **Builder** (`@openlarm/ingest-builder`) | Transform stored data → `LARMInput` | Pure TS, called from Next.js API routes |
| **Engine** (`@openlarm/core`, unchanged) | Risk evaluation | Already published alpha |

**Core principle:** `@openlarm/core` schema does not change. All new variables are absorbed at the Builder layer. Worker writes, Builder reads, engine consumes — three layers, one direction.

---

## 1. Why This Architecture

### 1.1 Pain points of current setup

The frontend currently fetches weather data on every API request via `/api/weather/context`. This couples five concerns into one request:

1. **Network latency** — Open-Meteo + CWA + ECMWF round-trips per page load
2. **Rate limits** — free-tier APIs cap calls; we burn budget on repeat queries for the same coordinates
3. **No history** — once a request returns, the raw data is lost; we cannot backtest LARM against past observations
4. **No cross-source fusion** — each request hits one source family; combining CWA stations + EPA stations + radar + ensembles requires a different shape
5. **No QC layer** — bad sensor readings flow straight into `LARMInput` without bias correction or outlier rejection

### 1.2 What ingest-then-serve solves

```
On-demand (current):    User request ──▶ fetch APIs ──▶ normalize ──▶ LARMInput ──▶ evaluateRisk
                                         │
                                         └─ slow, brittle, no history, no fusion

Ingest-then-serve:      Worker (24/7) ──▶ fetch APIs ──▶ QC ──▶ Postgres
                                                                  │
                        User request ──▶ Builder reads Postgres ──▶ LARMInput ──▶ evaluateRisk
                                         │
                                         └─ fast, multi-source, full history, validation-ready
```

**Bonus capabilities unlocked:**
- Backtesting `@openlarm/validator` against real historical data (not synthetic)
- Training data accumulation for future ML downscaling
- Multi-tenant: same Postgres serves frontend + future B2B API + research collaborators
- SLO monitoring: alert when a source goes down before users notice

---

## 2. High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          External Data Sources                              │
│                                                                             │
│  CWA APIs    EPA AQ    ECMWF    NOAA GFS    Himawari    Open-Meteo   ...   │
│     │          │         │         │           │            │              │
└─────┼──────────┼─────────┼─────────┼───────────┼────────────┼──────────────┘
      │          │         │         │           │            │
      ▼          ▼         ▼         ▼           ▼            ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              Railway Worker (apps/ingest-worker)                            │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │  Scheduler (node-cron)                                               │  │
│  │  ├─ */10 min  → CWA stations, EPA AQ, CWA radar, lightning           │  │
│  │  ├─ hourly    → Open-Meteo refresh (where unchanged)                 │  │
│  │  ├─ */6 hours → GFS, ECMWF Open-IFS                                  │  │
│  │  └─ daily     → ERA5 batch, building height refresh                  │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                  │                                          │
│  ┌───────────────────────────────▼──────────────────────────────────────┐  │
│  │  Per-source Adapters (packages/ingest-sources)                       │  │
│  │  fetch → schema validate → QC → normalize → upsert                   │  │
│  └───────────────────────────────┬──────────────────────────────────────┘  │
│                                  │                                          │
└──────────────────────────────────┼──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              Supabase Postgres (managed) + PostGIS                          │
│                                                                             │
│  observations_point       — CWA AWS, EPA, Netatmo (10-min cadence)          │
│  observations_gridded     — radar tiles, satellite imagery refs             │
│  forecast_point           — Open-Meteo, CWA township per-coord              │
│  forecast_ensemble        — ECMWF 51-member, P10/P90 spreads                │
│  events_warning           — CWA warnings, NCDR disasters                    │
│  events_lightning         — CWA + (future) Vaisala GLD360                   │
│  static_geo               — building height, DEM, OSM, region polygons      │
│  meta_sources             — fetch logs, last_run, error counts              │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              Builder (packages/ingest-builder)                              │
│                                                                             │
│  buildLARMInput({ lat, lng, when, mission_meta }) → LARMInput               │
│   ├─ queryWeather30d()       → Weather30dInput  (from observations_point)   │
│   ├─ queryWeatherToday()     → WeatherTodayInput (point + ensemble fusion)  │
│   ├─ queryBuildingSite()     → BuildingSiteInput (static_geo spatial join)  │
│   └─ inject mission_meta     → OperationalContextInput + Equipment          │
└──────────────────────────────────┬──────────────────────────────────────────┘
                                   │
                                   ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              @openlarm/core (unchanged, alpha published)                    │
│                                                                             │
│  evaluateRisk(input, { params: TAIWAN_PARAMS_V2_0 }) → RiskResult           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Source → LARM Variable Mapping

This is the core deliverable. Every `LARMInput` field gets a primary source + fallback chain. Sources are graded by **freshness**, **spatial fit**, and **historical depth**.

### 3.1 `Weather30dInput` (rolling 30-day climate context)

| Field | Primary Source | Fallback | QC Notes |
|---|---|---|---|
| `wind_mean_kmh` | **CWA AWS** (10-min × 30d, nearest 3 stations IDW) | Open-Meteo Archive (ERA5, 25km) | Reject readings >120 km/h or <0; sensor bias correction per station |
| `wind_p90_kmh` | CWA AWS sorted percentile | Open-Meteo Archive p90 | Same QC; require ≥80% data completeness |
| `gust_p90_kmh` | CWA AWS gust column (`H_FX`) | Open-Meteo `wind_gusts_10m` | Some stations lack gust sensor → null is acceptable |
| `rain_days_30` | **CWA Rainfall Station** (denser than AWS, 600+ sites) | Open-Meteo Archive `precipitation` | Threshold: day count where 24h sum ≥1mm |
| `heavy_rain_days_30` | CWA Rainfall Station | Open-Meteo Archive | Threshold: 24h sum ≥20mm |
| `instability_index` | Derived: stddev(daily mean wind) / mean(daily mean wind), 0..1 | — | Computed by Builder, not raw |
| `predictability_score` | Derived: 1 − (forecast vs obs RMSE over 30d) / max_RMSE | — | Requires `forecast_point` table; bootstrap with 0.7 default |

### 3.2 `WeatherTodayInput` (today's forecast + nowcast)

| Field | Primary | Fallback | Notes |
|---|---|---|---|
| `wind_now_kmh` | **CWA AWS** latest reading (≤10 min old) | Open-Meteo Forecast hour-0 | If no station within 5km, fall back |
| `wind_p10_kmh` | **ECMWF Ensemble** (51-member, via Open-Meteo paid tier) | Open-Meteo free ensemble | Use day-of percentile across members |
| `wind_p90_kmh` | ECMWF Ensemble | Open-Meteo free ensemble | Same |
| `gust_now_kmh` | CWA AWS `H_FX` | Open-Meteo `wind_gusts_10m` | null acceptable |
| `rain_prob_today_pct` | **CWA F-D0047** (township PoP12h) | Open-Meteo `precipitation_probability` | CWA is normative for Taiwan ops |
| `rain_mmph_forecast` | **CWA Radar nowcast** (0–6h) | Open-Meteo hourly | Radar is best for next 1 hour |
| `thunder_risk` | **CWA Lightning** (10-min) + CWA F-C0032 weather code | Open-Meteo `weather_code` mapping | Binary 0/1; if any strike within 10km in last 30 min → 1 |
| `forecast_confidence` | Derived: 1 − (P90−P10)/wind_now | — | Computed by Builder |
| `wind_direction_deg` | CWA AWS `WDIR` | Open-Meteo `wind_direction_10m` | Degrees, 0=N |
| `edr` | **ECMWF Deterministic** (Open-Meteo paid `eddy_dissipation_rate` if available) / Meteomatics (P1) | null | v2.0 hard-stop variable; null disables EDR rule |
| `local_hour` | Mission timestamp in `Asia/Taipei` | — | Builder injects from mission_meta |
| `cwa_cross` | CWA F-D0047 + AWS divergence | — | Already implemented in current `/api/weather/context` |
| `jma_cross` | Open-Meteo JMA endpoint | — | Already implemented |

### 3.3 `BuildingSiteInput` (static geo)

| Field | Primary | Notes |
|---|---|---|
| `site_altitude_m` | **MOI 20m DEM** (point query) | Resampled to mission lat/lng |
| `building_floors` | MOI building height shapefile | Spatial join to nearest building polygon |
| `building_height_m` | MOI building height | Same |
| `facade_complexity` | Derived from building polygon shape (perimeter/area ratio) + Drone168 internal | Heuristic: rectangle → light, irregular → heavy |
| `clearance_m` | **NOT INGESTED** — site survey only | Mission-time input |
| `near_hv_power` | OSM `power=line` within 50m | Boolean spatial query |
| `near_base_station` | OSM `tower:type=communication` within 100m | Boolean |
| `wind_channel_effect` | Derived from building density + height ratio in 200m radius (Local Climate Zone) | Computed by Builder, requires DEM + buildings |
| `rooftop_condition` | **NOT INGESTED** — site survey only | Mission-time input |
| `crowd_density` | Derived from MOI population grid + time-of-day | "low/medium/high" thresholds per district |
| `region_exposure` | Derived from coastline distance + DEM gradient | Computed once, cached per coordinate |
| `population_density_class` | **MOI population grid** (250m) → SORA 2.5 classes | `assembly` requires real-time event data (P3) |
| `sora_mitigations` | **NOT INGESTED** — operator declares per mission | Mission-time input |

### 3.4 `OperationalContextInput` + `Equipment`

These are mission-time inputs supplied by the operator UI. **Not part of ingest scope.** The Builder only injects them passthrough.

### 3.5 v2.0 extensions

| Field | Source |
|---|---|
| `recent_typhoon_count` | **CWA Typhoon Best-Track** (annual download); count storms within 200km of site over past 3 calendar years |
| `local_completion_adjustment` | **GDS internal flight log** (separate from this ingest pipeline; pulled via internal Data Asset Registry per `data_sources.yaml` v0.2 note) |

### 3.6 What is NOT ingested by this worker

To keep scope contained:

- **Internal GDS flight logs / mission outcomes** — managed via separate `internal_data_assets.yaml` per the v0.2 changelog
- **Site survey fields** (`clearance_m`, `rooftop_condition`, `sora_mitigations`) — operator UI only
- **Real-time crowd events** (concerts, protests for `population_density_class=assembly`) — P3, requires NLP from social media
- **Insurance claims, OpenSky ADS-B, university WRF runs** — partnership tier, ingested via per-partner ETL when MOUs land

---

## 4. Storage Schema (Supabase Postgres + PostGIS)

### 4.1 Why Supabase

- Already in our preferred stack (CLAUDE.md global rules)
- Managed Postgres with PostGIS extension out of the box
- Row-Level Security ready for future multi-tenant (B2B API)
- Realtime subscriptions could power live dashboards later
- Generous free tier covers Sprint 1 ingestion volume (~1M rows/day estimated)

**Alternative considered:** Railway Postgres (cheaper, co-located with worker). Rejected because Supabase's PostGIS + auth + edge functions ecosystem is worth the per-month difference, and we already have it provisioned.

### 4.2 Core tables

All time-series tables use **PostgreSQL native declarative partitioning** managed by `pg_partman`. Monthly partitions, auto-created 3 months ahead, retained indefinitely (we'll add retention policies once we know LARM training horizons).

```sql
-- One-time setup
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- ─── Time-series observations (point) ──────────────────────────────────────
CREATE TABLE observations_point (
  id            BIGSERIAL,
  ts            TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,            -- e.g. 'cwa_aws', 'epa_aq', 'netatmo'
  station_id    TEXT NOT NULL,
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  -- weather fields (NULL where source doesn't provide)
  wind_kmh      DOUBLE PRECISION,
  wind_dir_deg  DOUBLE PRECISION,
  gust_kmh      DOUBLE PRECISION,
  temp_c        DOUBLE PRECISION,
  rh_pct        DOUBLE PRECISION,
  pressure_hpa  DOUBLE PRECISION,
  rain_mm_10min DOUBLE PRECISION,
  rain_mm_1h    DOUBLE PRECISION,
  rain_mm_24h   DOUBLE PRECISION,
  -- QC metadata
  qc_flags      JSONB,                    -- e.g. {"bias_corrected": true, "outlier": false}
  raw_payload   JSONB,                    -- full original record for audit
  PRIMARY KEY (ts, id)                    -- partition column must be in PK
) PARTITION BY RANGE (ts);

CREATE UNIQUE INDEX observations_point_natural_key ON observations_point (ts, source, station_id);
CREATE INDEX observations_point_geom_idx ON observations_point USING GIST (geom);
CREATE INDEX observations_point_lookup_idx ON observations_point (source, station_id, ts DESC);

SELECT partman.create_parent(
  p_parent_table => 'public.observations_point',
  p_control      => 'ts',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 3
);

-- ─── Forecasts at points ────────────────────────────────────────────────────
CREATE TABLE forecast_point (
  id            BIGSERIAL,
  issued_at     TIMESTAMPTZ NOT NULL,
  valid_at      TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,            -- 'open_meteo_ifs', 'cwa_township', 'gfs'
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

CREATE UNIQUE INDEX forecast_point_natural_key ON forecast_point
  (issued_at, valid_at, source, COALESCE(region_id, ''), ST_AsText(geom::geometry));
CREATE INDEX forecast_point_geom_idx ON forecast_point USING GIST (geom);
CREATE INDEX forecast_point_lookup_idx ON forecast_point (source, valid_at DESC);

SELECT partman.create_parent(
  p_parent_table => 'public.forecast_point',
  p_control      => 'valid_at',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 3
);

-- ─── Ensemble spreads (P10/P90 etc.) ────────────────────────────────────────
CREATE TABLE forecast_ensemble (
  id            BIGSERIAL,
  issued_at     TIMESTAMPTZ NOT NULL,
  valid_at      TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,            -- 'ecmwf_ens_51', 'open_meteo_ens'
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  variable      TEXT NOT NULL,            -- 'wind_kmh', 'rain_mm', etc.
  p10           DOUBLE PRECISION,
  p50           DOUBLE PRECISION,
  p90           DOUBLE PRECISION,
  member_count  INT,
  PRIMARY KEY (valid_at, id)
) PARTITION BY RANGE (valid_at);

CREATE UNIQUE INDEX forecast_ensemble_natural_key ON forecast_ensemble
  (issued_at, valid_at, source, variable, ST_AsText(geom::geometry));

SELECT partman.create_parent(
  p_parent_table => 'public.forecast_ensemble',
  p_control      => 'valid_at',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 3
);

-- ─── Events: warnings, lightning, disasters ─────────────────────────────────
CREATE TABLE events_warning (
  id            BIGSERIAL PRIMARY KEY,
  issued_at     TIMESTAMPTZ NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,            -- 'cwa_warning', 'ncdr'
  warning_type  TEXT NOT NULL,            -- 'typhoon', 'heavy_rain', etc.
  severity      TEXT,
  area_geom     GEOGRAPHY(MULTIPOLYGON, 4326),
  raw_payload   JSONB
);
CREATE INDEX events_warning_geom_idx ON events_warning USING GIST (area_geom);
CREATE INDEX events_warning_time_idx ON events_warning (issued_at DESC);

CREATE TABLE events_lightning (
  id            BIGSERIAL,
  ts            TIMESTAMPTZ NOT NULL,
  source        TEXT NOT NULL,            -- 'cwa_lightning', future 'vaisala_gld360'
  geom          GEOGRAPHY(POINT, 4326) NOT NULL,
  intensity_ka  DOUBLE PRECISION,
  polarity      TEXT,                     -- 'CG+', 'CG-', 'IC'
  PRIMARY KEY (ts, id)
) PARTITION BY RANGE (ts);

CREATE INDEX events_lightning_geom_idx ON events_lightning USING GIST (geom);

SELECT partman.create_parent(
  p_parent_table => 'public.events_lightning',
  p_control      => 'ts',
  p_type         => 'range',
  p_interval     => '1 month',
  p_premake      => 3
);

-- pg_partman BGW maintenance runs daily; ensure background worker enabled in
-- Supabase project settings (Database → Extensions → pg_partman → BGW).

-- ─── Static geo (refreshed daily/yearly) ────────────────────────────────────
CREATE TABLE static_buildings (
  id            TEXT PRIMARY KEY,
  geom          GEOGRAPHY(POLYGON, 4326) NOT NULL,
  height_m      DOUBLE PRECISION,
  floor_count   INT,
  source        TEXT NOT NULL,            -- 'moi', 'osm'
  refreshed_at  TIMESTAMPTZ NOT NULL
);
CREATE INDEX ON static_buildings USING GIST (geom);

CREATE TABLE static_dem (
  -- Stored as raster tiles, one row per tile
  tile_id       TEXT PRIMARY KEY,
  bbox          GEOGRAPHY(POLYGON, 4326) NOT NULL,
  resolution_m  DOUBLE PRECISION NOT NULL,
  storage_url   TEXT NOT NULL,            -- Supabase Storage path to GeoTIFF
  refreshed_at  TIMESTAMPTZ NOT NULL
);

-- ─── Worker telemetry ───────────────────────────────────────────────────────
CREATE TABLE meta_fetch_log (
  id            BIGSERIAL PRIMARY KEY,
  source        TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ,
  status        TEXT NOT NULL,            -- 'ok', 'partial', 'failed'
  rows_written  INT,
  error_message TEXT,
  duration_ms   INT
);
CREATE INDEX ON meta_fetch_log (source, started_at DESC);

CREATE TABLE meta_sources (
  source        TEXT PRIMARY KEY,
  last_success  TIMESTAMPTZ,
  consecutive_failures INT DEFAULT 0,
  enabled       BOOLEAN DEFAULT true
);
```

### 4.3 Volume estimate (Sprint 1 P0 only)

| Source | Rows/run | Cadence | Daily rows |
|---|---|---|---|
| CWA AWS | ~400 | 10 min | 57,600 |
| CWA Rainfall | ~600 | 10 min | 86,400 |
| EPA AQ | ~80 | 1 hour | 1,920 |
| Open-Meteo Forecast (per coord) | 14 days × 24h × N coords | 1 hour | depends on N coords |
| ECMWF Open-IFS (per coord) | 240 hourly × N coords | 12 hour | depends on N coords |
| **Total observations** | | | **~150K rows/day** |

At 150K rows/day with native partitioning + JSONB toast compression, 1 year ≈ 8–15 GB (no built-in chunk compression like TimescaleDB had — we accept the larger footprint in exchange for staying on supported Supabase Postgres 17). Comfortably within Supabase Pro tier (8 GB included, $0.125/GB beyond) for the first 6 months; revisit retention policy at month 6.

---

## 5. Worker Design (Railway)

### 5.1 Why Railway over Vercel

Vercel Cron has hard limits unsuitable for ingest workloads:
- 60s function timeout on Hobby, 300s on Pro (some sources need >5 min for batch fetches)
- 10 cron jobs max on Hobby, 40 on Pro
- Each cron run is a fresh function invocation — no persistent in-memory state for rate-limit budgeting
- Cold starts on every run

Railway gives us a long-running container:
- Persistent process: in-memory rate-limit tokens, connection pooling
- No timeout on scheduled tasks
- Cheaper for sustained workloads ($5/month base)
- Postgres co-location possible (we'll keep Supabase for the reasons above, but the option is there)

**Decision:** Railway for the worker, Supabase for the database, Vercel for the frontend.

### 5.2 Package structure (monorepo)

```
gds-mission-mock/
├── apps/
│   ├── docs/              ← existing
│   ├── playground/        ← existing
│   └── ingest-worker/     ← NEW: Railway entry point
│       ├── src/
│       │   ├── index.ts           — bootstrap, register schedules
│       │   ├── scheduler.ts       — node-cron setup
│       │   ├── runners/
│       │   │   ├── cwa-aws.ts
│       │   │   ├── cwa-rainfall.ts
│       │   │   ├── cwa-radar.ts
│       │   │   ├── cwa-warning.ts
│       │   │   ├── cwa-lightning.ts
│       │   │   ├── epa-aq.ts
│       │   │   ├── open-meteo-forecast.ts
│       │   │   ├── ecmwf-open-ifs.ts
│       │   │   ├── era5-batch.ts
│       │   │   └── static-geo-batch.ts
│       │   ├── db.ts              — Supabase client
│       │   └── health.ts          — /healthz HTTP endpoint
│       ├── Dockerfile
│       ├── railway.json
│       └── package.json
├── packages/
│   ├── core/              ← existing, unchanged
│   ├── regions-taiwan/    ← existing, unchanged
│   ├── validator/         ← existing
│   ├── ingest-types/      ← NEW: shared types (RawObservation, NormalizedObservation, etc.)
│   ├── ingest-sources/    ← NEW: pure adapter functions per source
│   │   ├── src/
│   │   │   ├── cwa/aws.ts        — fetchAndNormalize(): RawCwaResponse → NormalizedObs[]
│   │   │   ├── cwa/rainfall.ts
│   │   │   ├── cwa/radar.ts
│   │   │   ├── cwa/warning.ts
│   │   │   ├── cwa/lightning.ts
│   │   │   ├── cwa/township.ts
│   │   │   ├── epa/aq.ts
│   │   │   ├── open-meteo/forecast.ts
│   │   │   ├── open-meteo/archive.ts
│   │   │   ├── open-meteo/ensemble.ts
│   │   │   ├── ecmwf/open-ifs.ts
│   │   │   ├── noaa/gfs.ts
│   │   │   ├── jma/himawari.ts
│   │   │   └── moi/buildings.ts
│   │   └── package.json
│   └── ingest-builder/    ← NEW: storage → LARMInput
│       ├── src/
│       │   ├── builder.ts         — buildLARMInput(opts): Promise<LARMInput>
│       │   ├── queries/
│       │   │   ├── weather30d.ts
│       │   │   ├── weather-today.ts
│       │   │   └── building-site.ts
│       │   └── qc/
│       │       ├── outlier.ts
│       │       ├── bias.ts
│       │       └── completeness.ts
│       └── package.json
└── low-altitude-ops-platform/frontend/
    └── src/app/api/weather/
        └── (existing routes refactored to call @openlarm/ingest-builder)
```

### 5.3 Per-source pipeline (every runner follows this 5-step contract)

```typescript
// packages/ingest-sources/src/<source>.ts pseudocode

export async function runCwaAws(deps: SourceDeps): Promise<SourceResult> {
  // 1. FETCH — strict timeout, retry with exponential backoff
  const raw = await fetchWithRetry(CWA_AWS_URL, { timeout: 30_000, retries: 3 });

  // 2. SCHEMA VALIDATE — Zod or @standard-schema; reject if shape changed
  const parsed = CwaAwsResponseSchema.parse(raw);

  // 3. QC — sensor bias, range checks, outlier detection, dedup vs last write
  const qcResults = parsed.records.map(applyQc);
  const accepted = qcResults.filter((r) => !r.rejected);

  // 4. NORMALIZE — into observations_point row shape (see schema §4.2)
  const rows = accepted.map(normalizeToObservationsPoint);

  // 5. UPSERT — idempotent on (ts, source, station_id)
  const written = await deps.db.upsert("observations_point", rows);

  return { rows_written: written, rejected: qcResults.length - accepted.length };
}
```

### 5.4 Schedule registry

```typescript
// apps/ingest-worker/src/scheduler.ts
import cron from "node-cron";
import { runners } from "./runners";

const schedule = [
  { cron: "*/10 * * * *", name: "cwa-aws",          run: runners.cwaAws },
  { cron: "*/10 * * * *", name: "cwa-rainfall",     run: runners.cwaRainfall },
  { cron: "*/10 * * * *", name: "cwa-radar",        run: runners.cwaRadar },
  { cron: "*/10 * * * *", name: "cwa-lightning",    run: runners.cwaLightning },
  { cron: "0 * * * *",    name: "epa-aq",           run: runners.epaAq },
  { cron: "0 * * * *",    name: "cwa-warning",      run: runners.cwaWarning },
  { cron: "0 */1 * * *",  name: "open-meteo-fcst",  run: runners.openMeteoForecast },
  { cron: "0 */6 * * *",  name: "ecmwf-open-ifs",   run: runners.ecmwfOpenIfs },
  { cron: "0 */6 * * *",  name: "noaa-gfs",         run: runners.noaaGfs },
  { cron: "0 3 * * *",    name: "era5-batch",       run: runners.era5Batch }, // overnight
  { cron: "0 4 * * 0",    name: "static-geo",       run: runners.staticGeo }, // weekly Sunday
];

for (const job of schedule) {
  cron.schedule(job.cron, async () => {
    const start = Date.now();
    try {
      const result = await job.run({ db });
      await db.logFetch({ source: job.name, status: "ok", ...result, duration_ms: Date.now() - start });
    } catch (err) {
      await db.logFetch({ source: job.name, status: "failed", error_message: String(err), duration_ms: Date.now() - start });
      // alert hook: Sentry or webhook to Slack
    }
  });
}
```

**Concurrency:** node-cron runs each job in a single Node event loop. If a long-running job overlaps its next firing, we use a per-source `runningLock` flag to skip the new fire (and log a warning). For high-throughput sources (radar imagery), we'll evaluate BullMQ + Redis later.

### 5.5 Rate limit + budget management

Each source has a budget tracked in process memory:

```typescript
// packages/ingest-sources/src/util/budget.ts
export class RateBudget {
  constructor(public capacityPerHour: number) {}
  private windowStart = Date.now();
  private used = 0;

  async acquire(cost = 1): Promise<void> {
    const now = Date.now();
    if (now - this.windowStart > 3_600_000) {
      this.windowStart = now;
      this.used = 0;
    }
    if (this.used + cost > this.capacityPerHour) {
      const waitMs = 3_600_000 - (now - this.windowStart);
      await sleep(waitMs);
      return this.acquire(cost);
    }
    this.used += cost;
  }
}
```

Per-source budgets are configured via env (`OPEN_METEO_HOURLY_CALLS=10000`).

---

## 6. Builder: Storage → LARMInput

The `@openlarm/ingest-builder` package is the read-side counterpart of the worker. The current `/api/weather/context` route will be refactored to call this builder instead of fetching raw APIs.

### 6.1 Public API

```typescript
// packages/ingest-builder/src/builder.ts
import type { LARMInput } from "@openlarm/core";

export interface BuildOptions {
  lat: number;
  lng: number;
  when: Date;                      // mission start
  mission_meta: {
    operational: OperationalContextInput;
    equipment: Equipment[];
    site_overrides?: Partial<BuildingSiteInput>;  // operator's site survey
    w_override?: WeatherType;
    recent_typhoon_count?: number | null;
    local_completion_adjustment?: number;
  };
  freshness?: {
    max_obs_age_min?: number;      // default 30
    max_forecast_age_hours?: number; // default 6
  };
}

export async function buildLARMInput(opts: BuildOptions, db: Db): Promise<LARMInput> {
  const [weather30d, weatherToday, buildingSite] = await Promise.all([
    queryWeather30d(opts, db),
    queryWeatherToday(opts, db),
    queryBuildingSite(opts, db),
  ]);

  return {
    weather_30d: weather30d,
    weather_today: weatherToday,
    building: { ...buildingSite, ...opts.mission_meta.site_overrides },
    operational: opts.mission_meta.operational,
    equipment: opts.mission_meta.equipment,
    w_override: opts.mission_meta.w_override,
    recent_typhoon_count: opts.mission_meta.recent_typhoon_count,
    local_completion_adjustment: opts.mission_meta.local_completion_adjustment,
  };
}
```

### 6.2 Cross-source fusion strategy

When multiple sources report the same variable for the same time + location, the Builder picks via **priority + freshness + spatial proximity**:

```typescript
// e.g. wind_now_kmh fusion
const candidates = [
  await queryNearestStation("cwa_aws", lat, lng, 5_000, "30 min"),  // primary
  await queryNearestStation("epa_aq", lat, lng, 5_000, "60 min"),   // backup
  await queryForecastPoint("open_meteo", lat, lng, "1 hour"),       // fallback
];
const value = pickFirstNonNull(candidates);  // first match wins
```

**Tie-breakers:**
1. Source priority (CWA AWS > EPA > Open-Meteo)
2. Freshness (newer wins within priority class)
3. Spatial distance (closer wins within freshness window)
4. QC pass (rejected readings skipped)

### 6.3 Tiered freshness policy (safety-critical)

LARM is a safety-decision system. False GO with stale data is more costly than false NO_GO. The Builder tags every response with a `freshness` enum and the API enforces a hard cutoff:

| Observation age | `freshness` value | Behavior |
|---|---|---|
| ≤ 30 min | `"fresh"` | Serve normally; UI green status |
| 30 min – 2 h | `"degraded"` | Serve with warning; UI yellow banner |
| 2 h – 6 h | `"stale"` | Serve with strong warning; UI red banner; LARM result flagged as low-confidence |
| > 6 h **or** source `last_success > 1 h` ago | n/a | Builder throws `DataUnavailableError`; API returns 503; operator must explicitly override (audit-logged) |

```typescript
// packages/ingest-builder/src/freshness.ts
export type Freshness = "fresh" | "degraded" | "stale";

export function classifyFreshness(observedAt: Date, now = new Date()): Freshness {
  const ageMin = (now.getTime() - observedAt.getTime()) / 60_000;
  if (ageMin <= 30) return "fresh";
  if (ageMin <= 120) return "degraded";
  if (ageMin <= 360) return "stale";
  throw new DataUnavailableError(`observation is ${Math.round(ageMin)} min old`);
}
```

The builder returns `{ input: LARMInput, freshness: Freshness, source_breakdown: {...} }` so callers can decide how to render. Hard rule: never serve `LARMInput` whose constituent observations have `freshness = "unavailable"` without an explicit `force: true` override flag.

### 6.4 Open-Meteo coordinate strategy (budget control)

Forecast calls cost money + count against rate limits. Strategy:

1. **Daily warmup** — table `frequent_sites` ranks customer sites by 90-day mission count; top 50 are pre-fetched hourly into `forecast_point`
2. **Lazy + 1h cache** — first request for a non-warmed coord triggers a fetch; result cached for 1 hour at the (rounded to 0.01°) coord grid
3. **Hard daily cap** — env var `OPEN_METEO_DAILY_BUDGET=5000` calls; at 80% utilization Slack alert; at 100% switch to cache-only mode (return cached or stale, no new calls)

```typescript
// packages/ingest-sources/src/util/budget.ts
export class DailyBudget {
  constructor(public capacity: number, public alertWebhook?: string) {}
  // ...persisted to Postgres meta_sources table for restart safety
}
```

### 6.5 What the existing `/api/weather/context` route becomes

```typescript
// low-altitude-ops-platform/frontend/src/app/api/weather/context/route.ts (after refactor)
import { buildLARMInput } from "@openlarm/ingest-builder";
import { db } from "@/lib/db";

export async function GET(req: Request) {
  const { lat, lng } = parseParams(req);
  const input = await buildLARMInput({ lat, lng, when: new Date(), mission_meta: defaultMeta }, db);
  return Response.json({ weather_30d: input.weather_30d, weather_today: input.weather_today });
}
```

The route shrinks from ~600 lines to ~20 because all the fetch/normalize logic moved to the worker + builder.

---

## 7. Deployment

### 7.1 Railway service config

```json
// apps/ingest-worker/railway.json
{
  "$schema": "https://railway.com/railway.schema.json",
  "build": {
    "builder": "DOCKERFILE",
    "dockerfilePath": "apps/ingest-worker/Dockerfile",
    "buildCommand": "npm install && npm -w @openlarm/core run build && npm -w @openlarm/regions-taiwan run build && npm -w @openlarm/ingest-types run build && npm -w @openlarm/ingest-sources run build && npm -w @openlarm/ingest-worker run build"
  },
  "deploy": {
    "startCommand": "node apps/ingest-worker/dist/index.js",
    "healthcheckPath": "/healthz",
    "healthcheckTimeout": 30,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 5
  }
}
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
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/packages ./packages
COPY --from=builder /repo/apps/ingest-worker/dist ./dist
COPY --from=builder /repo/apps/ingest-worker/package.json ./package.json
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### 7.2 Environment variables

```bash
# Database
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=         # service role (worker has full write access)
DATABASE_URL=                      # direct Postgres for TimescaleDB ops

# Source credentials
CWA_API_KEY=
EPA_API_KEY=
OPEN_METEO_API_KEY=                # commercial tier
COPERNICUS_CDS_API_KEY=            # ERA5
NOAA_S3_REGION=us-east-1           # public bucket, no key

# Operational
LOG_LEVEL=info
SENTRY_DSN=
ALERT_WEBHOOK_URL=                 # Slack incoming webhook for failures
NODE_ENV=production
TZ=Asia/Taipei                     # cron expressions evaluate in Taiwan time

# Budgets
OPEN_METEO_HOURLY_CALLS=10000
CWA_HOURLY_CALLS=600               # CWA limits ~10/min/key
```

### 7.3 Frontend deployment unchanged

Vercel deploys `low-altitude-ops-platform/frontend` exactly as today. The frontend's only new dependency is `@openlarm/ingest-builder`, which connects to Supabase using the same service-role key (or a read-only role we'll create).

---

## 8. Monitoring & Alerting

### 8.1 Health endpoint

`GET /healthz` returns:
```json
{
  "uptime_s": 12345,
  "sources": {
    "cwa_aws": { "last_success": "2026-04-27T10:30:00+08:00", "consecutive_failures": 0 },
    "open_meteo": { "last_success": "2026-04-27T10:00:00+08:00", "consecutive_failures": 0 }
  }
}
```

Railway pings this; if non-200 for >30s the service auto-restarts.

### 8.2 Alerting rules

| Condition | Action |
|---|---|
| Any source `consecutive_failures ≥ 3` | Webhook to Slack `#openlarm-ops` |
| Any source `last_success > 1 hour` for cron freq ≤10min | Same |
| Postgres connection failure | Same + Sentry |
| QC rejection rate > 30% in last hour | Slack warning (data quality) |

### 8.3 Dashboards

- **Supabase Studio** — direct table inspection + simple charts
- **Grafana Cloud** (free tier) — custom dashboards on top of Postgres
- Phase 2: build a `/admin/ingest` page in the frontend showing per-source freshness + recent fetch logs

---

## 9. Roadmap (mapped to `data_sources.yaml` sprints)

### Sprint 1 (Week 1–2): Foundations + Core P0

**Goal:** Worker running on Railway, ingesting 6 P0 sources, frontend reads from Supabase via Builder.

1. Provision Supabase project + enable PostGIS + TimescaleDB extensions
2. Apply schema migrations (table DDL from §4.2)
3. Scaffold `apps/ingest-worker` + `packages/ingest-types|sources|builder`
4. Implement runners: `cwa-aws`, `cwa-rainfall`, `cwa-radar`, `epa-aq`, `open-meteo-forecast`, `open-meteo-archive`
5. Implement Builder queries for `weather_30d` + `weather_today` (no building yet)
6. Refactor `/api/weather/context` to call Builder
7. Deploy worker to Railway, validate 24h of clean ingest data

### Sprint 2 (Week 3–4): Static geo + history

8. Ingest MOI building height + DEM + OSM into `static_buildings` + `static_dem`
9. Implement `queryBuildingSite` in Builder (DEM lookup + nearest building polygon)
10. Bulk-load 10 years of ERA5 via CDS API (one-time backfill)
11. Backfill `observations_point` from CWA archive where available

### Sprint 3 (Week 5–6): Labels & validation

12. Add `cwa-warning`, `cwa-lightning`, `cwa-township` runners
13. Wire `events_lightning` into `thunder_risk` derivation
14. Run `@openlarm/validator` against the new historical data
15. Compare Builder-generated `LARMInput` vs current `/api/weather/context` output on 100 sample missions; expect <5% divergence (mostly due to fresher CWA station data)

### Sprint 4–5 (Month 2–3): Commercial API evaluation

16. Trial Meteomatics 14-day for high-resolution wind at 50/100/150m AGL
17. Tomorrow.io free-tier benchmark vs our pipeline
18. Decision: Spire trial ($5k/quarter) vs Vaisala lightning subscription

### Sprint 6+ (Month 4+): Partnerships

19. OpenSky ADS-B academic account; ingest Mode-S EHS into a separate `derived_ads_b_winds` table
20. NCU/NTU MOU for high-res WRF runs (P2)
21. Insurance PoC: provide LARM scoring API in exchange for 100+ historical claims

---

## 10. Decisions (locked 2026-04-27)

The six original open questions were resolved before Sprint 1 kickoff:

1. **Schema strategy → `pg_partman` monthly partitions.** Supabase deprecated TimescaleDB on Postgres 17 (full removal by May 2026, per [Supabase docs](https://supabase.com/docs/guides/database/extensions/timescaledb)). Native PostgreSQL declarative partitioning + `pg_partman` is the maintained migration path. Compression loss is acceptable for v1; we revisit if storage bill exceeds $50/month.

2. **Radar tile storage → Supabase Storage + metadata-only DB rows.** PNG/GeoTIFF tiles go to S3-compatible Supabase Storage; `observations_gridded` table stores only the storage path + bbox + timestamp. Estimated ~100 MB/day for 1.3km radar at 10-min cadence.

3. **Open-Meteo coordinate strategy → hybrid (warmup + lazy + cap).** Top-50 customer sites pre-fetched hourly; other coords lazy-fetched with 1-hour cache; `OPEN_METEO_DAILY_BUDGET=5000` hard cap with Slack alert at 80% (see §6.4).

4. **Stale-data policy → tiered freshness with hard cutoff.** ≤30min `fresh` / 30–120min `degraded` / 2–6h `stale` / >6h or source-down → 503 unless operator overrides (audit-logged). See §6.3 for the safety rationale and code shape.

5. **Cost guardrails → ~$60–120/month accepted for Sprint 1.** Railway worker $5–20 + Supabase Pro $25 + Open-Meteo Commercial $29–99 + observability free tiers. Revisited at Sprint 4 when commercial APIs (Meteomatics / Spire / Vaisala) enter scope.

6. **Multi-tenant readiness → flat schema now, RLS later.** Single-tenant for the GDS deployment; add `tenant_id` columns + Postgres RLS policies when the first external B2B contract is signed. No upfront partitioning by tenant.

---

## 11. Appendix: Prior Art & References

- **`pg_partman`** — declarative monthly partitioning for Postgres 17; replaces our prior TimescaleDB plan
- **Open-Meteo open-source repo** — their downscaling pipeline is a useful reference for our future ML layer
- **MetPy** (Python) — for any complex meteorological derivations (CAPE, mixing height) we may eventually port to TS or shell out to Python
- **CWA Open Data API docs** — https://opendata.cwa.gov.tw/dist/opendata-swagger.html
- **EPA Air Quality API docs** — https://data.moenv.gov.tw
- **Railway docs** — https://docs.railway.com (cron + persistent services)
- **Supabase + PostGIS guide** — https://supabase.com/docs/guides/database/extensions/postgis

---

**Next steps after this doc is approved:**

1. Create migration plan file at `docs/superpowers/plans/<date>-data-integration-sprint-1.md` per writing-plans conventions
2. Use subagent-driven-development to execute Sprint 1 task-by-task
3. Provision Supabase + Railway projects (manual)
4. First runner deployed within 2 weeks
