# Sprint 1 Acceptance — Data Integration

> Fill in this template after the 24-hour acceptance test suite passes.
> Commit it as `docs/architecture/sprint-1-acceptance.md` on the feature branch
> and include it in the merge PR.

**Date:** <!-- YYYY-MM-DD -->
**Branch:** `claude/data-integration-sprint-1`
**Deployed worker URL:** <!-- https://<railway-app>.up.railway.app -->
**Frontend URL:** <!-- https://<vercel-app>.vercel.app -->
**Supabase project:** `agpeyhdvvbonxaecndza` (ap-northeast-1)

---

## Result

Run the acceptance suite and check off each item after it passes:

- [ ] All 4 P0 ingest sources running on Railway (`cwa_aws`, `cwa_rainfall`, `cwa_radar`, `epa_aq`)
- [ ] Open-Meteo forecast + archive ingest for top-50 frequent sites (`open_meteo_forecast`, `open_meteo_archive`)
- [ ] `/api/weather/context` refactored to read from Supabase via Builder (returns `freshness: "fresh"` or `"degraded"`)
- [ ] 24h smoke test green (5/5) — see command below
- [ ] Fetch error rate < 10% over 24 hours

### Acceptance test command

```bash
DATABASE_URL="postgresql://postgres.<ref>:<password>@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres" \
FRONTEND_URL="https://<vercel-app>.vercel.app" \
  npx vitest run apps/ingest-worker/test/acceptance/
```

Paste output here:

```
<!-- paste vitest output -->
```

---

## Numbers (fill in after 24 h)

| Metric | Value |
|--------|-------|
| `observations_point` rows written / 24h | <!-- N --> |
| `forecast_point` rows written / 24h | <!-- N --> |
| Worker peak memory (Railway metrics) | <!-- MB --> |
| Supabase DB size | <!-- GB --> |
| Open-Meteo API calls used / daily budget | <!-- N --> / 5000 |
| `meta_fetch_log` total fetch attempts / 24h | <!-- N --> |
| `meta_fetch_log` failed fetches / 24h | <!-- N --> |
| Measured error rate | <!-- % --> |

SQL to collect numbers:

```sql
-- Rows per table in last 24h
SELECT 'observations_point' AS tbl, count(*) FROM observations_point WHERE ts > now() - INTERVAL '24 hours'
UNION ALL
SELECT 'forecast_point', count(*) FROM forecast_point WHERE issued_at > now() - INTERVAL '24 hours';

-- Fetch log summary
SELECT
  count(*) AS total,
  count(*) FILTER (WHERE status = 'failed') AS failed,
  round(100.0 * count(*) FILTER (WHERE status = 'failed') / NULLIF(count(*), 0), 1) AS error_pct
FROM meta_fetch_log
WHERE started_at > now() - INTERVAL '24 hours';

-- DB size
SELECT pg_size_pretty(pg_database_size(current_database()));
```

---

## Source-level status

After 24 h, snapshot `meta_sources`:

```sql
SELECT
  source,
  last_success,
  consecutive_failures,
  now() - last_success AS last_success_age
FROM meta_sources
ORDER BY source;
```

Paste result here:

```
<!-- paste query output -->
```

---

## Open follow-ups for Sprint 2

These items were explicitly deferred from Sprint 1:

- **Static geo ingest (MOI buildings, DEM):** The Builder currently returns
  placeholder defaults for `BuildingSiteInput` (population density, obstruction
  height). Sprint 2 wires real Ministry of Interior building footprint data and
  a SRTM/ASTER DEM layer. Enables accurate `G_score` without manual overrides.

- **ERA5 historical backfill (10-year):** The `open_meteo_archive` adapter runs
  going forward from deploy date. Sprint 2 schedules a one-time backfill job
  covering 2015–2025 to enable climate-profile statistics without the current
  Open-Meteo ERA5 archive calls on every `/climate` page load.

- **CWA warning + lightning runners:** The `cwa_radar` adapter ingests radar
  images but does not yet parse lightning strike data. Sprint 2 adds a
  dedicated CWA lightning API adapter (`cwa_lightning`) and integrates
  `thunder_risk` derivation beyond the current Open-Meteo weather-code proxy.

- **`@openlarm/validator` backtest against 100 historical missions:** Sprint 3
  will run the LARM v2.0 engine against the mission archive in `meta_sources`
  to validate `R_score` calibration. Requires ERA5 backfill and static geo to
  be complete first.

- **`predictability_score` derivation:** Currently defaults to `0.7` in the
  Builder. Sprint 3 derives this from forecast vs. observation RMSE accumulated
  by the ingest pipeline.
