# LARM v2.1 Data Expansion Study (DRAFT)

> Status: planning doc, NOT a spec change. Pending Spec Editors +
> Model Governance review.
>
> Author: autoresearch agent, 2026-05-05. Scope is discovery only —
> this doc proposes inputs that *might* improve the model, identifies
> the calibration cases each one would help, and sketches an ablation
> plan. No code, schema, params, or test vectors were changed in
> producing it.

---

## 1. Executive summary

- LARM v2.0 already ingests a strong forecast/regime stack (Open-Meteo
  IFS + ensemble, JMA cross-validation, CWA F-D0047/F-C0032/O-A0003,
  ECMWF SEAS5). The marginal gap is **point-in-time atmospheric state
  at mission start**, not more long-range forecasts.
- Three candidate fields are worth piloting for v2.1:
  **(1) `cape_jkg`** (Convective Available Potential Energy at the
  mission hour), **(2) `lightning_strikes_30min_5km`** (observed
  cloud-to-ground strikes within 5 km in the last 30 min), and
  **(3) `visibility_m`** (operational visibility in metres). All three
  are available from already-wired vendors, all three are nullable for
  back-compat, and each maps to a named `autoresearch/calibration/cases.json`
  miss.
- The recommended initial v2.1 shortlist is **CAPE first, then
  lightning observation**. Visibility is a strong secondary candidate
  but arguably belongs to a regulatory/preflight gate rather than the
  R-score sum, and Model Governance should weigh in before it is
  added to the risk math.
- Two structural gaps cannot be closed by data alone: CAL-006
  (`near_hv_power` ceiling under W0 calm conditions) and CAL-015
  (EDR=0.78 just below hard stop on a tall windward tower) are
  engine-shape issues that even unlimited new fields will not solve.
  Spec Editors and Code TSC should treat those separately.
- Ablation against a hard ground-truth incident dataset is not
  possible today (no labelled outcomes). The proposed substitute is
  **agreement with expert post-mission scoring on the existing 28-case
  calibration set**, ideally extended to ~80 cases, plus tracking
  whether `worst_miss` shifts off the structurally-stuck cases.

---

## 2. Current schema inventory

The table below enumerates every field the v2.0 engine consumes, the
source it is fetched from today, and where it is referenced in the
spec / param guide. Nothing here is editable in this study — it is
the baseline that v2.1 candidates extend.

### 2.1 `Weather30dInput` (regime context)

| Field | Source today | Cadence | Resolution | Spec / guide |
|---|---|---|---|---|
| `wind_mean_kmh` | Open-Meteo Historical Forecast (IFS 9 km, paid) or `archive-api` (free) | Daily aggregate | ~9 km | spec §3.1 / PARAM_GUIDE §3-A |
| `wind_p90_kmh` | Same | Daily aggregate | ~9 km | spec §3.1 |
| `gust_p90_kmh` | Same (nullable) | Daily aggregate | ~9 km | spec §3.1 |
| `rain_days_30` | Same | Daily aggregate | ~9 km | spec §3.1 |
| `heavy_rain_days_30` | Same | Daily aggregate | ~9 km | spec §3.1 |
| `instability_index` | Derived from CAPE / convective indices over 30d | Daily aggregate | ~9 km | spec §3.1 (no normative formula) |
| `predictability_score` | Derived from ensemble spread over 30d | Daily aggregate | ~9 km | spec §3.1 (heuristic) |

Known limitation: the 30-day inputs are climate aggregates. They
cannot represent a *single bad afternoon* on top of a quiet month.
That is what `WeatherTodayInput` is for, but today's `WeatherTodayInput`
is itself thin on convective state.

### 2.2 `WeatherTodayInput` (today's forecast / now-cast)

| Field | Source today | Cadence | Resolution | Spec / guide |
|---|---|---|---|---|
| `wind_now_kmh` | Open-Meteo `/v1/forecast`, hour-of-mission | Hourly | ~9 km | spec §3.2 |
| `wind_p10_kmh`, `wind_p90_kmh` | Open-Meteo Ensemble (`ecmwf_ifs025`, 50 members) | Hourly | ~25 km | spec §3.2.1 |
| `gust_now_kmh` | Open-Meteo `/v1/forecast` | Hourly | ~9 km | spec §3.2 |
| `rain_prob_today_pct` | Open-Meteo + CWA F-D0047 PoP12h | 12-hr block | County / township | spec §3.2 |
| `rain_mmph_forecast` | Open-Meteo `/v1/forecast` | Hourly | ~9 km | spec §3.2 |
| `thunder_risk` (`0`/`1`/`null`) | CWA F-C0032-001 county forecast (Wx text → boolean) | ~12-hr | County | spec §3.2 |
| `forecast_confidence` | Computed from ensemble spread (P10/P50/P90 wind agreement) | Hourly | ~25 km | spec §8 |
| `wind_direction_deg` | Open-Meteo `/v1/forecast` | Hourly | ~9 km | spec §3.2 |
| `edr` | Operator-supplied, optional. No autofetch source today | — | — | spec §3.2 (v2.0 addition) |
| `local_hour` | Trivially derivable from mission time | — | — | spec §3.2 |
| `cwa_cross` | CWA F-D0047-091 township forecast | ~12-hr | Township | spec §3.2.2 |
| `jma_cross` | Open-Meteo JMA wrapper (`/v1/jma`, `jma_msm` 5 km / `jma_gsm` 20 km) | Hourly | 5–20 km | spec §3.2.2 |

Known limitations:
- `thunder_risk` is a binary phenomenon flag (`0`/`1`) — it cannot
  distinguish "isolated convective cell" from "synoptic storm" or
  represent how *favourable* the sounding is for thunderstorm
  development at mission hour vs daily peak.
- There is no observed lightning channel — `thunder_risk` is a
  forecast text-derived flag, not a "strikes-in-the-last-30-min"
  count.
- There is no visibility channel even though Open-Meteo
  `/v1/forecast` exposes one (`visibility`, m).
- `edr` has no autofetch source — operators must enter it manually,
  which means in practice it is empty for most missions.

### 2.3 Other inputs (out of scope for this study)

`BuildingSiteInput`, `OperationalContextInput`, `Equipment[]`,
`recent_typhoon_count`, `local_completion_adjustment`. These are
non-weather and not what a *data-expansion* study is meant to cover.

---

## 3. Gap analysis

What follows is the reading of `autoresearch/results.round1.jsonl`
(32 experiments, ending at metric_score 0.9286 with new worst_miss
on `CAL-015`) and `autoresearch/calibration/cases.json` (28 cases),
filtered for misses where new *data* — not new params or new engine
shape — is the plausible fix.

| CAL id | Failure mode in round-1 | What new data could plausibly fix it |
|---|---|---|
| **CAL-004** thunderstorm-imminent | Already captured well by `thunder_risk=1` + high `rain_prob` + `instability_index` over 30d. Round 1 `thunder_add 5→8` had no effect (exp 4). | **CAPE at mission hour** would let the engine separate "instability_index 0.85 over 30d but mission at 8am" from "0.85 over 30d AND CAPE 2500 J/kg now". Today these collapse to the same input. |
| **CAL-007** supertall canyon EDR=0.55 | Round 1 needed boundary tightening to push to R3. EDR is in the schema but operator-supplied. | **CAPE + boundary-layer height** would not directly fix CAL-007, but a properly wired `edr` autofetch (out of scope here — see §7) would. CAL-007 is mostly an engine/G-score issue, not a data issue. |
| **CAL-010** W4 afternoon convection / morning mission | Engine has `local_hour` but no time-resolved instability signal. Round 1 did not fix the W4 morning case. | **CAPE at `local_hour`** (e.g. CAPE at 08:00 vs at 15:00) is exactly the disambiguator. The 30-day `instability_index` and the W4 multiplier are blunt instruments compared to a mission-hour CAPE forecast. |
| **CAL-012** rain rate 11 mm/h at 40 % prob | Rain hard stop intentionally does *not* fire (correct). Engine must score it COND-R2. | **CAPE** weakly helps: 11 mm/h driven by frontal stratiform rain (low CAPE) is less spatially convergent than convective 11 mm/h (high CAPE), which has implications for the operational window. Lightning observation is the cleaner disambiguator. |
| **CAL-015** EDR=0.78 just below hard stop | Round 1 worst_miss. Round 2 retains as a structural ceiling — `evaluateRisk()` caps weather_now at 42 and the EDR adjustment at 20, so this case cannot be pushed to NO_GO via params. | **Boundary-layer height + 80 m wind shear** *could* widen the engine's TKE-proxy signal so this case lands in NO_GO, but the round-2 README is explicit: this is an **engine-level** fix, not a data fix. Listed here for transparency. |
| **CAL-023** W5 high `recent_typhoon_count` | v2.0's W5 climate-trend correction handles this. No data gap. | — |
| **CAL-025** low `forecast_confidence` 40 % | Already wired via ensemble. | — |
| **CAL-027** W0 climate, sudden high wind today | `wind_now_kmh` correctly elevates weather_now. | **CAPE + lightning observation** add a "is the sudden wind synoptic or storm-front-driven?" signal. Marginal but real. |

The pattern: round-1 misses cluster on **convective-state** cases
where the model has the regime right but lacks a "right now, at this
hour" sounding/strike signal. Round 2 fixed this for a few cases by
re-wiring decision boundaries; the remaining gaps are either
structural (CAL-006, CAL-015 — engine work) or convective-state
(CAL-004, CAL-010, CAL-012, CAL-027 — data work).

---

## 4. Candidate fields

### 4.1 — `cape_jkg` (Convective Available Potential Energy)

- **What it measures.** CAPE in J/kg — vertically integrated buoyancy
  available to a parcel lifted from the boundary layer. A
  forward-looking instability proxy that updates hourly with the
  forecast model run.
- **Sources for Taiwan.**
  - **Open-Meteo `/v1/forecast` `hourly=cape`** (already wired
    transport for other fields). IFS 9 km globally, GFS 13 km, ICON
    13 km. CAPE is documented as instantaneous in J/kg.
  - **Open-Meteo `lifted_index` / `convective_inhibition`** are
    listed as additional hourly variables alongside CAPE — same
    endpoint, no extra cost.
  - **CWA upper-air sounding** (Bǎnqiáo / Hualien soundings) is
    twice-daily and not delivered as a clean public API; treat as
    informative only.
- **Cadence / resolution / cost / licensing.**
  - Hourly; 9 km (IFS) over Taiwan; updates 4×/day.
  - On the Open-Meteo paid tier already in `.env.local`
    (`OPEN_METEO_API_KEY`), no additional cost beyond existing
    request budget. CC BY 4.0 attribution required.
- **Calibration cases helped.**
  - **CAL-004** (thunderstorm-imminent) — tighter forward signal than
    the 30-day `instability_index`.
  - **CAL-010** (W4 morning mission) — CAPE at 08:00 vs at 15:00 is
    the canonical disambiguator. This is the clearest fit in the
    set.
  - **CAL-012** (rain rate 11 mm/h at 40 %) — distinguishes frontal
    from convective regime.
  - **CAL-027** (W0 climate / sudden wind today) — secondary; small
    contribution.
- **Scores.**
  - Marginal information: **4** — closes a real gap that
    `instability_index` cannot.
  - Schema cost: **2** — single optional `number | null` field on
    `WeatherTodayInput`.
  - API cost: **1** — same Open-Meteo endpoint already in use.
  - Operational fit: **5** — autofetched, no operator burden.
- **Risks.**
  - Units consistency: CAPE in J/kg from Open-Meteo IFS may differ
    in magnitude from CWA sounding-derived CAPE; calibration
    thresholds (e.g. >1000 = noteworthy, >2500 = severe) are model-
    dependent and need a Taiwan-specific empirical anchor before any
    numeric threshold is hard-coded.
  - Forecast bias: IFS CAPE over the western Pacific tends to
    under-predict Taiwan-specific orographically-enhanced
    convection; treat as a *direction-of-effect* signal, not a
    precise quantity, in the early v2.1 calibration.

### 4.2 — `lightning_strikes_30min_5km` (observed CG strike count near site)

- **What it measures.** Number of cloud-to-ground lightning strikes
  detected within 5 km of the operation site in the previous 30 min.
  Pure observation, not forecast — answers "is the storm here right
  now?".
- **Sources for Taiwan.**
  - **CWA opendata** publishes a real-time cloud-to-ground
    lightning dataset (the "閃電監測資料" / lightning monitoring
    series, integrated upstream of QPESUMS); published reach and
    licensing of the public-API-exposed version is incompletely
    documented in the public Swagger and would need direct
    confirmation from CWA.
  - **Vaisala GLD360 / Xweather Lightning Network** — global,
    median 1 km accuracy, sub-second latency; commercial. No public
    Taiwan price quote available — must be requested.
  - **Earth Networks ENTLN** — global IC + CG, also commercial.
  - **Open-Meteo `lightning_potential` (J/kg)** — *forecast*, not
    observation; available only on the 15-minutely endpoint. Useful
    as a forward-looking complement, *not* a substitute, for the
    observation-based field proposed here.
- **Cadence / resolution / cost / licensing.**
  - CWA: ~minute-level if the public API exposes the upstream feed;
    licensing is open-data-with-API-key (same `CWA_API_KEY` already
    in `.env.local`) — assuming the lightning dataset is in the
    same family.
  - Vaisala / Earth Networks: real-time, sub-km; quote required;
    typical commercial-API pricing is in the low thousands USD/month
    range (industry context, not a Taiwan-specific quote — flagged
    as an open question in §6).
- **Calibration cases helped.**
  - **CAL-004** thunderstorm-imminent — converts a `thunder_risk=1`
    forecast flag into "active strikes within 5 km, NO-GO is
    obvious".
  - **CAL-027** W0 climate / sudden wind — a strike count of 0
    confirms "synoptic gust, not gust front"; a count >0 says the
    opposite.
  - **CAL-010** W4 morning — a strike count near zero at 08:00
    despite a W4 day reinforces the COND-not-NO_GO recommendation.
- **Scores.**
  - Marginal information: **3** — high *operational* value but in
    the calibration set most cases are pre-mission, so the field is
    sometimes 0 by definition (mission cancelled if non-zero). The
    information primarily improves real-time go/abort reliability
    rather than the 28-case score.
  - Schema cost: **2** — single optional `number | null` (counts).
  - API cost: **2** if CWA opendata path works; **4** if a
    commercial vendor is required.
  - Operational fit: **5** — autofetched from server.
- **Risks.**
  - CWA's public-API exposure of lightning data is not as clearly
    documented as the F-D0047 / O-A0003 datasets. If only QPESUMS
    visualisation is public and the underlying point-strike feed is
    not, this field becomes a commercial-vendor decision.
  - Detection-efficiency variance over coastal vs mountainous
    Taiwan; a "0 strikes in 30 min" reading can be ambiguous near
    the coast.

### 4.3 — `visibility_m` (operational visibility, metres)

- **What it measures.** Horizontal visibility in metres. Drives VLOS
  regulatory limits: most jurisdictions require ≥ 5 000 m for routine
  drone ops, and BVLOS rules separately. Strongly affected by haze,
  PM2.5, low cloud, and rain.
- **Sources for Taiwan.**
  - **Open-Meteo `/v1/forecast` `hourly=visibility`** (m, instant).
    Already-wired endpoint.
  - **NOAA aviation weather METAR** for **RCTP (Taoyuan)** and
    **RCSS (Songshan)** via `aviationweather.gov/data/api/`
    (free, US-government source, ~100 req/min rate limit, 1-min
    cache, observed visibility component of METAR).
  - **CWA O-A0003-001** — already wired; visibility is one of the
    less-prominent station fields and varies by station.
  - **Taiwan EPA / MoEnv `AQX_P_432` PM2.5** — proxy, not direct
    visibility, but well-correlated under haze conditions.
- **Cadence / resolution / cost / licensing.**
  - Open-Meteo: hourly, 9 km, paid plan already covers it, CC BY 4.0.
  - NOAA METAR: ~30 min routine + SPECI on threshold crossings,
    point (airport), free, no commercial-use restriction stated on
    the API page (US government data).
  - CWA: per-station, ~hourly, open-data with API key.
  - EPA: hourly per station, open data.
- **Calibration cases helped.**
  - **CAL-004** thunderstorm-imminent — heavy rain typically drops
    visibility under 1 km, providing a redundant NO-GO signal.
  - **None of the round-1 worst_miss cases turn on visibility.** The
    cleanest justification for adding this field is regulatory /
    operational, not calibration-case-driven.
- **Scores.**
  - Marginal information: **2** — does not close a named round-1
    miss.
  - Schema cost: **2** — single optional `number | null`.
  - API cost: **1** — already-wired transports.
  - Operational fit: **4** — autofetched. Slightly lower than 5
    because near-mountain sites need a station-vs-grid choice.
- **Risks.**
  - Adding it to the *risk score* duplicates regulatory checks the
    operator should be making at the preflight stage. A defensible
    alternative is to add it as a **preflight gate** (binary VLOS
    check), not as a contributor to `R_score`.

### 4.4 — Other candidates considered, *not* recommended for v2.1

| Candidate | Why deferred |
|---|---|
| `lifted_index` (LI), `k_index` | Strongly correlated with CAPE; adding one of CAPE / LI / KI is sufficient. Pick CAPE for v2.1, revisit LI/KI as substitutes only if CAPE underperforms. |
| 0–6 km / 0–1 km bulk vertical wind shear | Not directly available in Open-Meteo `/v1/forecast`; can be computed from `wind_speed_80m` − `wind_speed_10m` on the same endpoint, but that is a 70-m differential — not the meteorologically meaningful 0–6 km shear. Real upper-air shear requires a model-level endpoint (Open-Meteo upper-air or a CWA sounding feed) and adds ingestion complexity. Defer to v2.2. |
| `boundary_layer_height` | Useful for CAL-007/CAL-015 turbulence reasoning, but the round-2 README explicitly flags those cases as engine-level concerns. Adding the field without engine plumbing yields no metric improvement. Defer. |
| Aerosol optical depth (AOD) / dust concentration | Open-Meteo Air Quality API at 0.4° / ~45 km / 3-hourly over Asia is too coarse for site-specific decisions. EPA PM2.5 stations at ~hourly cadence are denser; if the goal is haze impact on visibility, the `visibility_m` field above subsumes it. |
| ECMWF ensemble spread (raw, beyond `forecast_confidence`) | Already wired indirectly via `wind_p10_kmh`/`wind_p90_kmh` on `WeatherTodayInput` and via `forecast_confidence` derivation. Adding more ensemble fields would duplicate. |
| ASOS METAR (RCTP/RCSS, 30-min cadence) | Sparse spatial coverage in Taiwan (two airports). For sites within ~30 km of the airport this is a useful sanity check; CWA O-A0003-001 (already wired) covers similar real-time obs needs at higher density. Marginal info gain. |

---

## 5. Recommended v2.1 shortlist

Ranked by expected metric improvement on the existing 28-case
calibration set, weighted by schema and API cost.

### 5.1 (rank 1) — `cape_jkg`

- **Rationale.** Closes the cleanest convective-state gap in v2.0 —
  the inability to distinguish a stable W4 morning from a 2500 J/kg
  W4 afternoon. Same Open-Meteo endpoint that already supplies
  `wind_now_kmh`, `rain_mmph_forecast`, etc., so ingestion adds zero
  new transport. CC BY 4.0 attribution already applies.
- **Spec sections that would change.** §3.2 (`WeatherTodayInput`
  table — add field), §5.2 (WeatherNow component — add a CAPE-driven
  add term to the `instability` channel, OR keep it as a separate
  small additive bounded similarly to `tke_proxy_cap`), §10.2
  (Taiwan calibration — add CAPE thresholds).
- **TypeScript signature.**
  ```ts
  interface WeatherTodayInput {
    // ... existing fields ...
    /** v2.1: Convective Available Potential Energy at mission hour, J/kg.
     *  Forward-looking instability proxy. null when the data source
     *  cannot supply it (e.g. archive forecasts before model run). */
    cape_jkg?: number | null
  }
  ```
- **Default value / null handling.** When absent or `null`, the
  engine MUST fall back to v2.0 behaviour (use `instability_index`
  alone for the WeatherNow instability channel). No v2.0 input MUST
  produce a different output under v2.1 if `cape_jkg` is absent.
- **Calibration cases improved.** CAL-004, CAL-010, CAL-012, CAL-027.
- **Estimated implementation effort.** **S** — single field,
  straightforward Open-Meteo wire-up, additive WeatherNow component
  with a small param record (`cape_thresholds: Array<{min, adj}>`
  in the same shape as `edr_thresholds`).

### 5.2 (rank 2) — `lightning_strikes_30min_5km`

- **Rationale.** Converts the binary `thunder_risk` *forecast* into
  an observed near-real-time hazard signal. Even if it does not move
  the 28-case metric much (most cases are pre-mission), it is a
  high-value *operational* signal that turns "go" mid-mission into
  "abort" when warranted. Pairs well with CAPE — CAPE forecasts the
  potential, strike count confirms realisation.
- **Spec sections that would change.** §3.2 (`WeatherTodayInput`),
  §7.1 (Hard stops — *consider* adding an observed-strike hard stop
  at e.g. ≥ 1 strike within 5 km in last 5 min; **note: a hard-stop
  decision is reserved for spec editors**, this study only proposes
  the field), §10.2 (Taiwan threshold values).
- **TypeScript signature.**
  ```ts
  interface WeatherTodayInput {
    /** v2.1: Cloud-to-ground lightning strike count within
     *  `lightning_radius_m` (default 5000) of operation site,
     *  observed in the last `lightning_window_min` (default 30).
     *  null when the data source is unavailable. */
    lightning_strikes_30min_5km?: number | null
  }
  ```
- **Default value / null handling.** `null` → v2.0 behaviour
  (rely on `thunder_risk` only).
- **Calibration cases improved.** CAL-004 directly; CAL-027 weakly.
  Largest expected gains are *outside* the calibration set, in
  real-mission abort decisions.
- **Estimated implementation effort.** **M** — depends on which
  upstream feed is selected. CWA opendata path is **S** if the
  dataset's public API is confirmed; commercial vendor path adds
  contract/auth/cost work and is **M–L**.

### 5.3 (rank 3) — `visibility_m`

- **Rationale.** Closes a regulatory-compliance gap (VLOS), not a
  calibration-set gap. Recommended to add as a **preflight gate**
  rather than as an `R_score` contributor — i.e. compute and surface
  it in the input and the `RiskResult.controls` array, but do not
  weight it into the 0–100 sum, to avoid double-counting against
  rules the operator already has to satisfy independently.
- **Spec sections that would change.** §3.2 (`WeatherTodayInput`
  table), §7.1 (consider adding a soft "VLOS visibility" preflight
  gate, again a Spec Editor call), no §5 component change.
- **TypeScript signature.**
  ```ts
  interface WeatherTodayInput {
    /** v2.1: Visibility at mission location/hour, metres.
     *  Used for VLOS preflight gating, not for R_score. */
    visibility_m?: number | null
  }
  ```
- **Default value / null handling.** `null` → no preflight gate
  fires; v2.0 behaviour.
- **Calibration cases improved.** None directly. Adds value to
  CAL-004 redundancy and to operational compliance.
- **Estimated implementation effort.** **S** — single field, single
  Open-Meteo variable, optional METAR cross-check for major-airport
  sites.

---

## 6. Ablation plan

**Constraint.** There is no labelled ground-truth incident dataset
for Taiwan low-altitude operations. We cannot compute precision/recall
against actual mission outcomes, because we do not have outcomes.
Any ablation method must work without one.

**Proposed substitute metric.** *Agreement with expert post-mission
scoring on an extended calibration set.* Concretely:

1. **Extend `autoresearch/calibration/cases.json`** from 28 to ≈ 80
   cases. New cases must be authored by the same Model Governance
   reviewers who own the spec, *not* by the autoresearch agent
   alone — the goal is to add cases the agent cannot have seen
   during round-2 calibration. At least 20 of the new cases must be
   "convective-state-sensitive" (W4 morning vs afternoon, frontal
   stratiform 11 mm/h vs convective 11 mm/h, etc.) so they exercise
   `cape_jkg` and `lightning_strikes_30min_5km` specifically.
2. **Three-way comparison.** For each case, score under:
   - **A. v2.0 baseline** — `cape_jkg = null`,
     `lightning_strikes_30min_5km = null`.
   - **B. v2.1 with CAPE only** — `cape_jkg` populated,
     `lightning_strikes_30min_5km = null`.
   - **C. v2.1 with both new fields** populated.
3. **Primary metric** — same `metric_score` already computed in
   `autoresearch/evaluate.mjs`. We expect strict improvement
   B > A and C ≥ B; if C does not improve over B, the lightning
   field is not paying its complexity cost on this metric (revisit
   its operational-only justification).
4. **Secondary metric** — `worst_miss` migration. The success
   criterion is *not* that `worst_miss` becomes zero — it is that
   the worst miss moves *off* CAL-006 / CAL-015 (engine-bound) and
   *off* CAL-004 / CAL-010 / CAL-012 / CAL-027 (data-bound). If
   after wiring the new fields `worst_miss` is still on a
   data-bound case, the new fields are not configured correctly.
5. **Tertiary metric** — invariant pass rate. New fields must not
   reduce the 25/25 invariants pass rate from `invariants.mts`.
6. **Sample-size guidance.** With 80 cases, even a 0.05 metric-score
   improvement is detectable above the noise floor of round-1 /
   round-2 fluctuations (which were ~0.02 per single-param tweak).
   A 0.1+ improvement is the bar for "this change paid for its
   complexity"; below that, treat as informational only.

**Comparison to ECMWF ensemble-spread baseline.** As a sanity-check
control, run the same ablation with `forecast_confidence` randomly
perturbed by ± 15 percentage points. The ablation results for the
new fields (B, C) MUST exceed the noise floor introduced by this
perturbation — otherwise we cannot distinguish "CAPE helps" from
"forecast confidence is just noisy".

**What the ablation cannot tell us.** Whether a field correctly
fires in *real* operations. That requires the post-mission outcome
dataset that doesn't exist yet. The plan to build that dataset
belongs in a separate planning doc (suggested filename
`docs/superpowers/plans/incident-outcome-collection.md`) and is out
of scope here.

---

## 7. What this doc explicitly does NOT do

- **No engine changes.** `evaluateRisk()` and the `risk-engine.ts`
  computation graph are untouched. CAL-006 (calm-day near-HV
  ceiling) and CAL-015 (EDR=0.78 just below hard stop) are
  acknowledged as structurally stuck and are deferred to Code TSC.
- **No new R-levels or W-codes.** §6.1 mapping and §4.1
  classification rules are out of scope.
- **No new regimes.** Taiwan-specific convective-burst regime
  (e.g. "W6 = sea-breeze convergence") is interesting but not on
  the table here.
- **No hard-stop changes.** Both adding a strike-count hard stop
  and tightening the existing ones are Spec Editor + Model
  Governance decisions; this doc only flags the candidate field.
- **No ground-consequence redesign.** SORA 2.5 iGRC integration
  is settled in v2.0 and does not need re-opening.
- **No `edr` autofetch source.** Operators currently supply
  `edr` manually. Wiring an autofetch is a separate sprint —
  recommended path is Open-Meteo upper-air winds → derived TKE
  proxy. Mentioned but not designed here.
- **No commitment that v2.1 will ship.** This is discovery. Spec
  Editors and Model Governance decide whether any of these fields
  proceed to RFC.

---

## 8. References

- Open-Meteo `/v1/forecast` documentation, hourly variables list
  (cape, lifted_index, convective_inhibition, boundary_layer_height,
  visibility, lightning_potential): https://open-meteo.com/en/docs
- Open-Meteo Ensemble API (`ecmwf_ifs025`):
  https://open-meteo.com/en/docs/ensemble-api
- Open-Meteo Air Quality API (Asia coverage at 0.4° / 3-hourly):
  https://open-meteo.com/en/docs/air-quality-api
- Open-Meteo pricing and CC BY 4.0 attribution requirement:
  https://open-meteo.com/en/pricing , https://open-meteo.com/en/terms
- CWA Open Data platform (F-D0047-091, F-C0032-001, O-A0003-001
  already wired; lightning dataset family — public-API exposure to
  be confirmed): https://opendata.cwa.gov.tw/
- CWA Swagger:
  https://opendata.cwa.gov.tw/dist/opendata-swagger.html
- QPESUMS multi-radar / lightning / rain-gauge integration (1 km,
  10-min, used for severe-weather monitoring; not exposed as a
  public point-strike API at the time of this writing — visualisation
  via cwa.gov.tw radar pages):
  https://www.cwa.gov.tw/V8/E/W/OBS_Radar.html ;
  Chen et al., *An Operational Multi-Radar Multi-Sensor QPE System
  in Taiwan*, Bull. Amer. Meteor. Soc., 2021,
  https://journals.ametsoc.org/view/journals/bams/102/3/BAMS-D-20-0043.1.xml
- NOAA Aviation Weather Center Data API (METAR for RCTP/RCSS,
  ~30-min cadence, free, US-government source, 100 req/min):
  https://aviationweather.gov/data/api/
- Vaisala GLD360 / Real-Time Lightning Data Feed (commercial,
  global 1 km accuracy):
  https://www.vaisala.com/en/products/systems/lightning/gld360 ,
  https://www.vaisala.com/en/products/systems/lightning/real-time-data-feed
- Earth Networks Total Lightning Network (ENTLN, IC + CG,
  commercial): https://www.earthnetworks.com/total-lightning/
- Taiwan EPA / MoEnv air quality datasets (AQX_P_432 hourly AQI,
  AQX_P_488 historical AQI, AQX_P_07 station metadata):
  https://data.moenv.gov.tw/en/dataset/detail/aqx_p_432 ,
  https://data.moenv.gov.tw/en/dataset/detail/AQX_P_488
- LARM v2.0 specification (this repo): `spec/LARM-v2.0.md` §3, §4,
  §5, §7, §10.
- LARM v2.0 parameter guide: `low-altitude-ops-platform/LARM_PARAM_GUIDE.md`
- Round-1 / round-2 autoresearch results:
  `autoresearch/results.round1.jsonl`, `autoresearch/calibration/cases.json`,
  `autoresearch/program.md`, `README.md`.
