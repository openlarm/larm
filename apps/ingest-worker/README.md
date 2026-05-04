# ingest-worker — Railway Deployment Runbook

This document is the step-by-step manual guide for deploying the OpenLARM ingest
worker to Railway and verifying it is healthy. **You must follow this manually**;
Railway has no MCP and cannot be automated from this repository.

---

## 1. Prerequisites (assumed already set up)

The following must be in place before you start:

| Item | Notes |
|------|-------|
| **Supabase project `openlarm-ingest`** | Project ID `agpeyhdvvbonxaecndza`, region `ap-northeast-1`. All 8 migrations in `infra/supabase/migrations/` applied. Verify in Supabase Studio → Database → Migrations. |
| **PostGIS extension enabled** | Supabase Dashboard → Database → Extensions → search "postgis" → enable. |
| **pg_partman extension enabled** | Same as above. Note: enable in the `partman` schema (Supabase requirement). SQL: `CREATE EXTENSION IF NOT EXISTS pg_partman SCHEMA partman;` |
| **Railway account** | Free Hobby plan is sufficient for development; Starter plan recommended for production (always-on dyno). |
| **Railway project linked to this GitHub repo** | New Project → Deploy from GitHub repo. The root of the repo is `/`; `railway.json` at the repo root tells Railway to use `apps/ingest-worker/Dockerfile`. |
| **API keys available** | CWA Open Data API key, EPA API key (optional), Open-Meteo Commercial API key. |

---

## 2. Environment variables to set in Railway

In your Railway project, go to **Settings → Variables** and add each variable below.
**Do not skip any required variable** — the worker will fail to start or silently
produce no data if credentials are missing.

### Required variables

#### `DATABASE_URL`
- **Where to get it:** Supabase Dashboard → Project Settings → Database → **Connection string** tab → choose **Transaction pooler** (port 6543). Copy the `postgresql://...` URI.
- **Why transaction pooler:** The worker runs many short-lived queries on a cron schedule. The pooler (pgBouncer) prevents exhausting Postgres connection slots. The direct connection (port 5432) is fine for local psql but not for a long-running process.
- **Format:** `postgresql://postgres.<project-ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres`
- **Required:** Yes

#### `SUPABASE_URL`
- **Where to get it:** Supabase Dashboard → Project Settings → API → **Project URL**.
- **Why:** The worker uses the Supabase JS client for storage bucket operations (uploading raw CWA radar files). The client needs the project URL to route requests.
- **Format:** `https://agpeyhdvvbonxaecndza.supabase.co`
- **Required:** Yes

#### `SUPABASE_SERVICE_ROLE_KEY`
- **Where to get it:** Supabase Dashboard → Project Settings → API → **Project API keys** → `service_role` secret key (the long JWT that starts with `eyJ...`).
- **Why service_role and not anon:** The anon key is subject to Row Level Security (RLS) policies designed for end-user requests. The ingest worker must write to all tables regardless of user context. The service_role key bypasses RLS. **Keep this key secret — never commit it to the repository.**
- **Required:** Yes

#### `CWA_API_KEY`
- **Where to get it:** Your existing CWA Open Data Platform API key (same one in your local `.env.local`).
- **Why:** All CWA adapters (`cwa_aws`, `cwa_rainfall`, `cwa_radar`) require this key for authenticated API access. Without it, CWA returns 401 and no observation data is ingested.
- **Required:** Yes

#### `EPA_API_KEY`
- **Where to get it:** Your existing EPA AQMS API key.
- **Why:** The `epa_aq` adapter uses this key to fetch air quality station data. If omitted, the `epa_aq` source will fail on every fetch cycle, raising the error rate. The rest of the sources will still work.
- **Required:** No (recommended)

#### `OPEN_METEO_API_KEY`
- **Where to get it:** Your Open-Meteo Commercial API key (same one in your local `.env.local`).
- **Why:** Without a commercial key, the Open-Meteo API enforces strict rate limits (600 requests/day). The worker fetches forecasts for up to 50 frequent sites every hour, which exceeds the free tier. The commercial key raises the limit to the configured budget.
- **Required:** Yes (for production; free tier will throttle)

#### `OPEN_METEO_DAILY_BUDGET`
- **Value:** `5000`
- **Why:** The worker respects a daily call budget to avoid unexpected overage on your Open-Meteo plan. The default of 5000 gives ~208 requests/hour, which comfortably covers the top-50 site refresh cadence with headroom.
- **Required:** No (defaults to `5000` in code, but set explicitly to be visible)

#### `TZ`
- **Value:** `Asia/Taipei`
- **Why:** The worker uses `node-cron` schedules defined in local time (e.g., "every 10 minutes between 05:00–22:00 Taiwan time"). Without `TZ`, the Railway container defaults to UTC, shifting all cron windows by +8 hours and causing the worker to fetch during off-peak UTC hours instead of Taiwan business hours.
- **Required:** Yes

#### `NODE_ENV`
- **Value:** `production`
- **Why:** Enables production logging (JSON structured output), disables development-only debug verbosity, and signals to any libraries that check this variable to run in production mode.
- **Required:** Yes

### Auto-set by Railway (do not configure manually)

#### `PORT`
- **Value:** Set automatically by Railway at container start.
- **Why:** The worker's health endpoint (`/healthz`) listens on `process.env.PORT`. Railway's load balancer routes to this port. If you hardcode a port value here, it may conflict with Railway's assignment and cause the health check to fail.

---

## 3. Railway project settings

| Setting | Value |
|---------|-------|
| **Source** | GitHub repo, branch `claude/data-integration-sprint-1` (or `main` after merge) |
| **Build** | Dockerfile — auto-detected from `railway.json` at repo root. No additional build command needed. |
| **Dockerfile path** | `apps/ingest-worker/Dockerfile` (defined in `railway.json`) |
| **Start command** | `node dist/index.js` (defined in `railway.json`) |
| **Healthcheck path** | `/healthz` (defined in `railway.json`) |
| **Healthcheck timeout** | 30 seconds (defined in `railway.json`) |
| **Restart policy** | `ON_FAILURE`, max 5 retries (defined in `railway.json`) |
| **Root directory** | `/` (the Dockerfile is referenced by relative path from the repo root) |

You do not need to change these manually — `railway.json` at the repo root
configures them all. Railway reads `railway.json` automatically on first deploy.

---

## 4. First-deploy verification (within 5 min of green deploy)

After Railway shows the deploy status as **Active**, run:

```bash
curl https://<railway-app-url>/healthz
```

Expected response (sources list is empty because no fetches have completed yet):

```json
{
  "status": "ok",
  "uptime_s": 47,
  "sources": [],
  "stale_count": 0
}
```

Notes:
- `status: "ok"` during the **warmup window** (first 60 minutes) even if sources are empty. This is intentional — the worker does not declare itself healthy until the first successful fetch per source, but it does not fail the health check during warmup.
- If you see `status: "error"` within the first 5 minutes, check the Railway logs: the most common cause is a missing or malformed `DATABASE_URL`.
- `<railway-app-url>` is shown in Railway Dashboard → your service → Settings → Domains.

---

## 5. After 1 hour: partial data check

One hour after deploy, every P0 source should have had at least 6 successful
fetches (cwa_aws runs every 10 minutes). Run these queries in Supabase Studio
(Dashboard → SQL Editor) or via `psql`:

```sql
-- Check each source's last success time and failure streak
SELECT
  source,
  last_success,
  consecutive_failures,
  now() - last_success AS age
FROM meta_sources
ORDER BY last_success DESC NULLS LAST;
```

Expected: `last_success` for `cwa_aws`, `cwa_rainfall`, `cwa_radar`, `epa_aq`
should be within the last 10 minutes. `consecutive_failures` should be 0.

```sql
-- Count recent observation rows
SELECT count(*) FROM observations_point
WHERE ts > now() - INTERVAL '1 hour';
```

Expected: several hundred rows (CWA AWS has ~500+ stations; each 10-minute
fetch writes one row per station per observation type).

```sql
-- Check for fetch errors
SELECT source, status, error_message, started_at
FROM meta_fetch_log
WHERE status = 'failed'
ORDER BY started_at DESC
LIMIT 20;
```

If there are failures, look at `error_message` to diagnose. Common causes:
- `401 Unauthorized` → API key missing or wrong
- `connection refused` → DATABASE_URL wrong or Supabase project paused
- `relation "observations_point" does not exist` → migrations not applied

---

## 6. After 24 hours: run the acceptance test suite

After the worker has been running for 24 hours, run the full acceptance suite:

```bash
# From repo root
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres" \
FRONTEND_URL="https://<your-vercel-app>.vercel.app" \
  npx vitest run apps/ingest-worker/test/acceptance/
```

Expected output: **5 tests pass**.

```
✓ each P0 source has at least one successful fetch in last 1h
✓ observations_point has rows from last 1h
✓ forecast_point has rows from last 6h for at least one frequent site
✓ fetch error rate is below 10% in last 24h
✓ frontend /api/weather/context returns fresh data

Tests  5 passed (5)
```

After all 5 pass, fill in `docs/architecture/sprint-1-acceptance.md` and commit
it to record the Sprint 1 acceptance result.

---

## 7. Troubleshooting

### `DATABASE_URL connection refused` or `ECONNREFUSED`

The most common cause is using the **direct connection** hostname instead of the
**pooler** hostname.

- Direct (do NOT use in Railway): `db.agpeyhdvvbonxaecndza.supabase.co:5432`
- Pooler (use this): `aws-0-ap-northeast-1.pooler.supabase.com:6543`

Also verify the Supabase project is not paused (free-tier projects pause after
1 week of inactivity). Dashboard → your project → Restore if paused.

### `pg_partman extension not found` or `function create_parent does not exist`

Supabase requires `pg_partman` to be installed in the `partman` schema, not
`public`. Verify installation:

```sql
SELECT e.extname, n.nspname AS schema
FROM pg_extension e
JOIN pg_namespace n ON e.extnamespace = n.oid
WHERE e.extname = 'pg_partman';
```

Expected: one row with `schema = partman`.
If missing: Dashboard → Database → Extensions → enable `pg_partman` and set
schema to `partman`. Then re-run migration `20260427_001_extensions.sql`.

### `storage bucket cwa-radar not found`

The first run of the CWA radar adapter creates the bucket automatically using
the `SUPABASE_SERVICE_ROLE_KEY`. If bucket creation fails, it is almost always
because the service_role key was accidentally set to the **anon key** instead.

Verify: the service_role key is the longer of the two JWTs shown in
Supabase → Project Settings → API → Project API keys.

Create the bucket manually if needed:

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('cwa-radar', 'cwa-radar', false)
ON CONFLICT DO NOTHING;
```

### `no rows in observations_point` after 1 hour

The fetch log shows success but no rows were written:

```sql
SELECT source, status, rows_written, rows_rejected, error_message
FROM meta_fetch_log
ORDER BY started_at DESC
LIMIT 20;
```

If `rows_written = 0` and `rows_rejected > 0`, the CWA API response schema has
changed. Check the raw error in `error_message`; it will contain a Zod
validation error showing which field failed.

### Health check flapping between `ok` and `error`

The worker uses a 1-hour warmup grace period at startup. During this window,
`/healthz` returns `status: "ok"` even if no sources have succeeded. After the
warmup window expires, any source with `consecutive_failures > 3` will cause
the endpoint to return HTTP 503.

If the health check flaps after more than 1 hour of uptime, check Railway logs
and `meta_sources.consecutive_failures`:

```sql
SELECT source, consecutive_failures, last_success, last_attempt
FROM meta_sources
WHERE consecutive_failures > 0
ORDER BY consecutive_failures DESC;
```

### `body.freshness = "stale"` in acceptance test 5

This means `/api/weather/context` read from Supabase but the most recent
observation is older than the freshness threshold (typically 2 hours). Either:
1. The worker is running but its writes are failing — check `meta_fetch_log`.
2. The ingest worker has not run for 24 hours yet — wait and re-run the test.
3. The `DATABASE_URL` in the Vercel frontend environment does not point to the
   same Supabase project as the worker — verify both use the same project URL.
