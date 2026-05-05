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

## [Unreleased] — 2026-05-05

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
