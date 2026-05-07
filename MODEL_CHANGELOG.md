# Model Changelog

This file tracks **changes to the LARM model itself** — parameter values,
formulas, W-code and R-level boundaries, hard stops, gating rules, and
anything else that can change the output of `evaluateRisk()` for the
same input.

Code-only changes (refactors, type tightening, tooling) belong in
`CHANGELOG.md`. If a PR modifies files under
`src/lib/engines/weather-regime-params.ts`,
`src/lib/engines/risk-engine.ts`, or any `spec/` normative section, it
**must** also add an entry here.

Format: model versions follow `vMAJOR.MINOR` (no patch digit). Bumping
`MAJOR` signals that a previously `GO` input could become `NO_GO` or vice
versa; bumping `MINOR` indicates tightening or new inputs without flipping
existing decisions.

---

## [Unreleased] — 2026-05-07

### Added (v2.1 candidate fields — additive, behaviour-preserving when null)

**`cape_jkg`** (committed earlier this branch):

- `WeatherTodayInput.cape_jkg` (number | null) — Convective Available
  Potential Energy at the mission hour, J/kg. Forward-looking instability
  proxy from Open-Meteo `/v1/forecast hourly=cape`.
- `WeatherRegimeParams.cape_contribution_config` (5 numeric fields:
  `lower_breakpoint`, `mid_breakpoint`, `upper_breakpoint`, `mid_value`,
  `upper_value`). Region adapters MAY override.
- New helper export `capeToInstabilityContribution(cape_jkg, cfg)` from
  `@openlarm/core` (piecewise-linear).

**`lightning_strikes_30min_5km`** (this commit):

- `WeatherTodayInput.lightning_strikes_30min_5km` (number | null) —
  cloud-to-ground (CG) lightning strike count within 5 km radius of the
  mission site, observed in the past 30 minutes. Source: CWA opendata
  O-A0039-001 (KMZ feed, OGDL-Taiwan licence, see
  `docs/superpowers/plans/cwa-lightning-feed-verification.md`).
  Cloud-to-cloud (IC) strikes excluded.
- `WeatherRegimeParams.lightning_observation_config` (7 numeric fields:
  `thunder_force_threshold`, `tier_1_max_exclusive`, `tier_2_max_exclusive`,
  `tier_1_adj`, `tier_2_adj`, `tier_3_adj`, `max_adj`).
- New helper exports `lightningForcesThunderRisk(strikes, cfg)` and
  `lightningTierAdj(strikes, cfg)` from `@openlarm/core`.
- New optional output field `RiskResult.lightning_adj` (only present
  when > 0; mirrors the `edr_adj` pattern).

### Behaviour — `cape_jkg`

Engine integrates CAPE additively into the instability sub-component:
`effective_instability = min(1, weather_30d.instability_index + cape_contrib)`.
When `cape_jkg` is `null` or `undefined`, `cape_contrib = 0` and
`effective_instability` collapses to `instability_index` exactly —
**bit-identical v2.0 behaviour**. Verified by:
- All 10 existing TV-v2.0-001 through TV-v2.0-010 conformance vectors
  (no `cape_jkg` field; engine path unchanged).
- TV-v2.0-013 (`cape_jkg: null` produces same output as v2.0 baseline).
- TV-v2.0-014 (`cape_jkg: 2000` with low `instability_index=0.10` lifts
  `risk_score` by exactly +1; channel weight `wts.instability=0.10`
  attenuates the inner Δ instComp of +12 to a Δ raw of +1.2).

Defaults in `TAIWAN_PARAMS_V2_0` and `TAIWAN_PARAMS_V1_0` are identical:
`{ lower_breakpoint: 500, mid_breakpoint: 1500, upper_breakpoint: 2500,
mid_value: 0.4, upper_value: 0.8 }`.

### Behaviour — `lightning_strikes_30min_5km`

Engine wires lightning observations through **two independent mechanisms**:

1. **Mechanism A — thunder_risk forcing** (inside WeatherNow §5.2.6).
   When `strikes >= thunder_force_threshold`, `effective_thunder_risk` is
   forced to 1 regardless of `today.thunder_risk`. Activates the existing
   `weather_now_weights.thunder_add` bonus (+5 default). Observation
   overrides forecast.

2. **Mechanism B — tier adder** (in §6.1, parallel to base components).
   Piecewise tier adjustment added directly to the inner sum *before*
   round/clamp. Defaults: tier 1 (1–2 strikes) +8; tier 2 (3–9 strikes)
   +15; tier 3 (≥ 10 strikes) +20; capped at `max_adj=25`. Bypasses
   `weather_now_cap=42` because lightning is qualitatively a different
   channel (active threat signal, not atmospheric-state assessment).

When `strikes` is `null` or `undefined`, both mechanisms are no-ops and
the engine produces bit-identical v2.0 output. When `today.thunder_risk`
is already 1, Mechanism A is a no-op (no double-count). Verified by:
- All 10 existing TV-v2.0-001 through TV-v2.0-010 unchanged.
- TV-v2.0-013/014 (cape vectors) unchanged — no lightning field.
- TV-v2.0-015 (`strikes: null` produces same output as v2.0 baseline).
- TV-v2.0-016 (`strikes: 5` from `thunder_risk: 0` base lifts
  `risk_score` by exactly +20 = +5 forcing inside weather_now + +15
  tier adder; clear separation of mechanisms).

Defaults in `TAIWAN_PARAMS_V2_0` and `TAIWAN_PARAMS_V1_0` are identical
(7-field block above).

### Why

Round-3 autoresearch saturated at metric 0.7207, with 13 of the top
losses sitting at the R1→R2 score-boundary cliff (no parameter lever
can push them across without over-correcting adjacent cases —
documented in `docs/superpowers/plans/larm-engine-shape-rfc.md` §5).
`data-expansion-v2.1.md` §5.1 ranks `cape_jkg` first as a new-input
disambiguator: the existing 30-day `instability_index` cannot tell a
"stable W4 morning" from a "2500 J/kg W4 afternoon"; CAPE can.

`lightning_strikes_30min_5km` (§5.2 of the same plan) is the second
v2.1 candidate, and is specifically designed to compose additively
with `cape_jkg`. CAPE alone could not move CAL-004 past the R2→R3
boundary at 66 (cape lifted it 52 → 53). With lightning's tier-2
+15, CAL-004 now reaches 53 + 15 = 68 → R3 → COND, matching the
expected case outcome.

### Known limitation (also v2.1 design intent, recorded for future
### Spec Editors review)

The instability channel's outer weight (`wts.instability = 0.10`)
attenuates CAPE's lift to ≤ +1 risk_score per case under the
`min(1, base + cape_contrib)` aggregation. Round-3 hand-traces
(see commit `7bd6e5f`) show CAL-004 saturates effective_instability
to 1.0 but Δ risk_score is only +1, insufficient to cross the
R-level boundary at score 41 or 66. **The wiring is correct; the
metric ceiling at this round comes from channel narrowness, not
implementation error.** Larger lift requires either (a) routing
CAPE through a heavier additive channel parallel to `edr_adj` /
`thunder_add`, or (b) adding the v2.1.x companion fields
`lightning_strikes_30min_5km` and `visibility_m` so multiple
narrow channels combine. Both are deferred for separate RFCs.

### DB ingest pipelines — out of scope here

End-to-end ingestion for both v2.1 candidate fields is deferred:

- **CAPE**: Open-Meteo `hourly=cape` request → `NormalizedForecast`
  schema → DB column → `queryWeatherToday` surfacing. Spans
  `packages/ingest-sources/`, `packages/ingest-types/`, a SQL
  migration, and `packages/ingest-builder/`.
- **Lightning**: CWA O-A0039-001 KMZ feed → KMZ parser →
  `NormalizedLightningEvent` schema (new) → DB table (new) → spatial
  query (within 5 km, last 30 min) → `queryWeatherToday` surfacing.
  Spans the same packages plus a new ingest source and a new spatial
  index. Probably also a tile cache for high-strike-rate days.

Both deferred to follow-up tickets. The engine path is fully unblocked
for both: today's missions see `cape_jkg = null` and
`lightning_strikes_30min_5km = null`, behaving exactly as v2.0; the DB
columns light up in follow-up sprints.

### Spec

- §3.2 Appendix A `weather_today` table — `cape_jkg` and
  `lightning_strikes_30min_5km` rows added.
- §5.2.4 instability sub-score pseudo-code — adds CAPE-aware path
  with explicit null-fallback note.
- §5.2.4.1 (NEW, Unreleased banner) — `cape_to_instability_contribution`
  helper definition + Taiwan reference values.
- §5.2.6 thunder add-on — forward-reference paragraph to Mechanism A
  thunder forcing under Unreleased banner.
- §5.6 (NEW top-level, Unreleased banner) — Lightning observation
  contribution: §5.6.1 Mechanism A (thunder forcing), §5.6.2
  Mechanism B (tier adder), §5.6.3 defaults, §5.6.4 hard-stop note.
- §6.1 R-score formula — `lightning_adj` added to inner sum under
  Unreleased banner.

### References

- `docs/superpowers/plans/data-expansion-v2.1.md` §5.1 (cape) + §5.2 (lightning)
- `docs/superpowers/plans/larm-engine-shape-rfc.md` §5
- `docs/superpowers/plans/cwa-lightning-feed-verification.md`
- Round-3 autoresearch findings: commit `7bd6e5f`

---

## [Previous Unreleased] — 2026-05-05

### Added (additive params, behaviour-preserving)

- `WeatherRegimeParams.g_score_config.env_hazards_cap`
- `WeatherRegimeParams.g_score_config.env_hazard_points.near_hv_power`
- `WeatherRegimeParams.g_score_config.env_hazard_points.near_base_station`
- `WeatherRegimeParams.g_score_config.env_hazard_points.narrow_clearance`

### Behaviour

Defaults in `TAIWAN_PARAMS_V2_0` and `TAIWAN_PARAMS_V1_0` match the
v2.0 hardcoded literals exactly (env_hazards_cap=3, near_hv_power=3,
near_base_station=1, narrow_clearance=2). All existing v2.0 inputs
produce bit-identical outputs (verified by spec test vectors
TV-v2.0-001 through TV-v2.0-010 plus the new
TV-v2.0-011-env-hazards-paramized-defaults vector).

### Why

Round-1 autoresearch flagged CAL-006 (near-HV-powerline calm-weather
mission) and similar multi-env-hazard cases as structurally
unreachable above R0 with the previous hardcoded cap of 3. Region
adapters can now calibrate env-hazards without an engine fork.
The g_score interaction sub-block (line ~229, `wind_channel_effect`
gated on `floors > 20`) intentionally remains hardcoded — revisit
in v3.0.

### Spec

- §5.3 cap table updated with `env_hazards_cap` row
- §5.3.4 pseudo-code updated to read from `cfg.env_hazard_points.*`
  and `cfg.env_hazards_cap`
- Appendix A `g_score_config` JSON schema updated

### References

- `docs/superpowers/plans/larm-engine-shape-rfc.md` (RFC source)
- `docs/superpowers/plans/cwa-lightning-feed-verification.md` (related)
- `autoresearch/CALIBRATION_LESSONS.md`
- New calibration case: CAL-029-multi-env-hazards-addressable

### Not bumped

The model version remains **v2.0**. This change is intentionally NOT
labelled v2.1: extracting hardcoded literals into params is a
calibration-surface expansion, not a model behaviour change, and a
version bump for that alone would be cosmetic. The v2.1 label is
reserved for the next round of substantive changes (e.g. `cape_jkg`,
`lightning_strikes_30min_5km`, or any other addition that changes
output for some real input under default params). Bundling those
with this entry keeps version numbers meaningful for downstream
operators.

---

## [v2.0] — LARM v2.0 (current production)

Superset of v1.1. Introduces SORA 2.5 ground-risk integration, EDR
turbulence handling, and component recalibration. Breaking for
operators calibrated against v1.1.

### Added

- **SORA 2.5 GRC integration**: new `population_density_class` input
  (`assembly | high_urban | residential | light | isolated`) feeding the
  `ground_consequence` term inside `G_score`.
- **M1-series mitigations**: new `sora_mitigations: ("M1A" | "M1B" | "M1C")[]`
  input; each applied mitigation reduces ground consequence by a fixed
  amount (exact values in `weather-regime-params.ts`).
- **EDR turbulence**: new `weather_today.edr` input feeding `edr_adj`
  (0–20), plus a **hard stop at EDR > 0.8**.
- **TKE proxy**: new `tke_proxy` additive term (0–3) for turbulent
  kinetic energy approximation when EDR is unavailable.
- **Internal grade split**: `D` → `D1` (R3 band) / `D2` (R4 lower band)
  to distinguish required supervisor-only vs supervisor + customer signoff.
- **Equipment category schema**: `block_category` (`B1`/`B2`/`B3`) and
  `warn_category` (`W1`…`W6`) on `Equipment`, each carrying explicit
  additive contributions to `E_score`.
- **W5 typhoon-trend correction**: when `recent_typhoon_count` exceeds
  `w5_typhoon_trend_threshold`, adds `w5_typhoon_trend_bonus` to `base_w`.
- **R4 split gating**: `risk_score > r4_nogo_threshold` → hard NO_GO;
  R4 band below threshold → `CONDITIONAL` tier D2.
- **Ensemble confidence in buffer ratio**: `weather_today.forecast_confidence`
  (0–100) now attenuates `buffer_ratio` when member agreement is high.
- **Local hour multiplier (W4)**: `weather_today.local_hour` drives a
  time-of-day multiplier for thunder risk.

### Changed

- **Component ranges recalibrated**:
  - `WeatherNow`: `0..50` → `0..42`
  - `G_score` (replaces `B_score`): `0..25` → `0..20`; keeps `b_score` as
    a backward-compatibility alias.
  - `O_score`: `0..15` → `0..12`
  - `E_score`: `0..10` → `0..8`
- **Buffer ratio range**: `0.05..0.40` → `0.05..0.55` (wider upper bound
  accommodates R3/R4 with low forecast confidence).
- **Ruleset version string**: `larm_v1.1` → `larm_v2.0`.

### Deprecated

- `b_score` alias on `RiskResult` (use `g_score`). Alias retained through
  at least one minor version beyond v0.1 to ease migration.

### Kept (no behaviour change)

- Hard stops: wind ≥ 39 km/h, rain > 10 mm/h AND prob > 60%.
- W-code classification rules (wind/rain/instability thresholds).
- R-level mapping boundaries (R0: 0–20, R1: 21–40, R2: 41–65,
  R3: 66–85, R4: 86–100).
- WR matrix GO/CONDITIONAL/NO-GO decisions for non-R4 cells.

---

## [v1.1] — LARM v1.1 (pre-open-source)

Initial production model used inside the proprietary Next.js application.

### Canonical formula

```
R_score  = Base(W) + WeatherNow + B_score + O_score + E_score      [0..100]
R_level  = mapped via thresholds {R0: 0–20, R1: 21–40, R2: 41–65,
                                  R3: 66–85, R4: 86–100}
Decision = GO | CONDITIONAL (Tier A/B/C) | NO_GO
```

Component upper bounds:

| Component | Upper bound |
|---|---|
| `Base(W)` | 22 (W5) |
| `WeatherNow` | 50 |
| `B_score` | 25 |
| `O_score` | 15 |
| `E_score` | 10 |

Hard stops:

- Wind ≥ 39 km/h → `NO_GO`.
- Rain > 10 mm/h **and** probability > 60% → `NO_GO`.

Inputs tracked: `Weather30dInput`, `WeatherTodayInput` (no EDR / ensemble),
`BuildingSiteInput` (no SORA fields), `OperationalContextInput`,
`Equipment[]`.

---

## Upcoming (planned for spec finalization)

- Normative `spec/LARM-v2.0.md` replacing the ad-hoc v1.1 description in
  `CLAUDE.md` and `LARM_PARAM_GUIDE.md`.
- Split of Taiwan calibration into `@openlarm/regions-taiwan` so
  `@openlarm/core` can ship region-agnostic defaults.
- Documented `params` required argument in `evaluateRisk()` (no implicit
  Taiwan defaults) — **this will be a breaking change versioned as v2.1**.

---

[Unreleased]: https://github.com/openlarm/core/compare/v2.0...HEAD
[v2.0]: https://github.com/openlarm/core/releases/tag/v2.0
[v1.1]: https://github.com/openlarm/core/releases/tag/v1.1
