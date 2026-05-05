---
Title: LARM — Low Altitude Risk Model Specification
Version: 2.0.0
Status: Stable (open-source draft)
License: CC-BY-4.0 (specification) / Apache-2.0 (reference implementation)
Editors: LARM Spec Editors Committee
Last-Updated: 2026-04-20
Supersedes: draft LARM-v1.1.md (never published)
---

# LARM v2.0 Specification

# Low Altitude Risk Model — Formal Specification

## Table of Contents

- §0 Abstract
- §1 Conformance
- §2 Terminology and Notation
- §3 Input Schema
- §4 Weather Regime Classification
- §5 Component Scores
- §6 Risk Score Aggregation
- §7 Decision Gating
- §8 Buffer Ratio
- §9 Completion Probability
- §10 Parameter Registry
- §11 Determinism and Reproducibility
- §12 Conformance Test Vectors
- §13 Non-Goals and Out of Scope
- §14 Known Limitations and Known Inconsistencies
- §15 Changelog
- §16 References
- Appendix A — Full v2.0 Parameter Values (Taiwan reference calibration)
- Appendix B — Reference Implementation Pointer

---

## §0 Abstract

### §0.1 Safety Notice (normative)

> ⚠️ **Safety Notice (mirrored from `README.md`):**
>
> **LARM is a decision-support tool, not a regulatory compliance certification.**
>
> - Does **NOT** guarantee flight safety.
> - Is **NOT** a substitute for Pilot-in-Command (PIC) judgement.
> - Is **NOT** approved by CAA, FAA, EASA, ICAO, or any civil aviation
>   authority.
> - **MUST** be used together with applicable aviation regulations.
> - Operators bear full responsibility for all flight decisions.
>
> The authoritative version of this notice, including disclaimer of
> warranties and limitation of liability, is `LEGAL/DISCLAIMER.md` at
> the root of the source distribution. Any Safety Notice embedded in
> this specification is a **non-binding paraphrase** pointing at that
> authoritative document.

### §0.2 Scope and positioning (informative)

LARM (Low Altitude Risk Model) is a **deterministic numerical model**
that translates a set of structured inputs — rolling 30-day climate
context, today's forecast / real-time weather, building and site
characteristics, operational context, and assigned equipment — into:

- An **R-score** in the closed interval `[0, 100]`;
- An **R-level** label from `{R0, R1, R2, R3, R4}`;
- A **decision** from `{GO, CONDITIONAL, NO_GO}`, with a
  `CONDITIONAL` sub-tier where applicable;
- A **buffer ratio** in `[0.05, 0.55]`, to be applied to time
  estimates by a downstream scheduler; and
- An optional **completion probability** in `[0.05, 0.99]`.

The model targets low-altitude commercial drone operations (building
facade cleaning, inspection, coating, solar-panel maintenance, and
similar tasks) where the combined effect of microclimate, ground
consequence in urban terrain, and equipment reliability is the
dominant risk driver.

LARM is **region-agnostic by construction**: §3 through §9 define the
algorithm purely in terms of a parameter record whose schema is given
in §10.1. §10.2 records a **Taiwan reference calibration** as
informative material only; §10.3 describes the region adapter
specification for producing additional region-specific calibrations.

### §0.3 Relationship to v1.1 and to earlier planning documents (informative)

This specification supersedes the never-published internal draft
`LARM-v1.1.md` that appears in earlier planning documents (notably
`OPEN_SOURCE_TASK_2_PLAN.md` §2). The v1.1 draft was never frozen; it
was overtaken by engine changes that together form the v2.0 revision.
The deliverable filename in the v2 plan is therefore deliberately
`spec/LARM-v2.0.md`, not `spec/LARM-v1.1.md`.

The v2.0 revision is distinguished from v1.1 by:

1. Integration of SORA 2.5 intrinsic Ground Risk Class (iGRC) semantics
   into a new **G_score** component, replacing the earlier B_score.
2. An explicit **Eddy Dissipation Rate (EDR)** turbulence input, with a
   non-overridable hard stop at `EDR > 0.8` and a graded adjustment
   feeding WeatherNow.
3. Recalibration of component ranges (WeatherNow: 0–50 → 0–42;
   G_score: 0–25 → 0–20; O_score: 0–15 → 0–12; E_score: 0–10 → 0–8),
   so that no component can individually dominate the aggregate R-score
   above its design share.
4. An expanded buffer ratio upper bound of `0.55` (was `0.40`) together
   with an explicit ensemble-confidence penalty term.
5. A **split of the R4 band** into a CONDITIONAL tier (D2) and a hard
   NO-GO region governed by `r4_nogo_threshold` (default 92).
6. A **W5 climate-trend correction** based on a recent three-year typhoon
   count, and a **W4 afternoon multiplier** for local hours 14:00–18:00.

A full diff of v1.1 → v2.0 behavioural changes is catalogued in §15
and cross-referenced to `MODEL_CHANGELOG.md`.

### §0.4 How to read this document (informative)

Each clause is tagged either `(normative)` or `(informative)`.

- **Normative** clauses use RFC 2119 keywords (MUST, SHOULD, MAY, MUST NOT,
  SHOULD NOT) and define behaviour that conforming implementations
  MUST reproduce bit-for-bit within the floating-point tolerance of
  §1.2.
- **Informative** clauses explain intent, give examples, or describe
  history. They do not impose conformance requirements.

Tables are plain Markdown throughout; pseudocode blocks are indented
and use a Python-like syntax without being tied to any target
language. Where a constant is taken from the Taiwan reference
calibration, it is tagged `[heuristic, no empirical source]` unless
an external citation is given — readers SHOULD treat such constants
as candidates for local recalibration.

---

## §1 Conformance

### §1.1 Implementation levels (normative)

A conforming implementation of LARM v2.0 MUST declare one of the
following levels:

- **Level 1 (Core).** Implements §3 (Input Schema), §4 (Regime
  Classification), §5 (Component Scores), §6 (Aggregation), and §7
  (Decision Gating) with a caller-supplied parameter record conforming
  to §10.1.
- **Level 2 (Full).** Level 1 plus §8 (Buffer Ratio) and §9
  (Completion Probability).
- **Level 3 (Certified).** Level 2 plus all test vectors in §12 pass
  within the tolerance of §1.2, and the implementation publishes the
  commit hash at which it was last verified.

Downstream region-adapter packages (see §10.3) are **not** required to
declare a conformance level; only the core engine implementing the
algorithm is.

### §1.2 Interoperability requirement (normative)

For any input `I` conforming to §3 and any parameter record `P`
conforming to §10.1, two Level-3 implementations MUST produce outputs
that agree on:

- `w_code`, `risk_level`, `decision`, `internal_grade`, `conditional_tier`,
  `requires_approval` — bitwise equal;
- `base_w`, `weather_now`, `g_score`, `o_score`, `e_score`, `risk_score`,
  `buffer_ratio`, `edr_adj`, `tke_proxy`, `ground_consequence` — equal
  within absolute tolerance `1e-2` (one one-hundredth).

The looser numerical tolerance accounts for permissible
floating-point differences across language runtimes. Labels, decisions,
and grades are categorical and MUST match exactly.

### §1.3 Parameter-record conformance (normative)

An implementation MUST reject a parameter record that fails any of
the §10.1 structural constraints (see §10.1.1). An implementation
SHOULD surface the specific constraint that failed so that downstream
region adapters can self-diagnose.

### §1.4 Backward-compatibility guarantees (informative)

LARM v2.0 retains a `b_score` alias on the result record that equals
`g_score`, so that v1.1 consumers can read the aggregate site term
under its former name. The alias is scheduled for removal no earlier
than v2.2; see §15.

### §1.5 Non-conformance categories (informative)

Implementations that diverge from the specification in any of the
following ways are **not** conforming, regardless of declared level:

- Adding inputs that influence the output without being documented in
  §3 or in a registered §10.3 region-adapter extension.
- Emitting `GO` when any §7.1 hard stop is active.
- Computing `buffer_ratio` outside the closed interval `[0.05, 0.55]`.
- Substituting the R-level bands of §6.1 with other bands without
  declaring an incompatible fork.

---

## §2 Terminology and Notation

### §2.1 Glossary (informative)

| Term | Meaning |
|---|---|
| **W-code** | Rolling 30-day climate regime label, one of `W0..W5`. See §4. |
| **Base(W)** | Fixed base contribution of the regime to the R-score, in the range `[3, 22]`. |
| **R-score** | Aggregate risk score, an integer in `[0, 100]` after rounding and clamping. |
| **R-level** | Band label for the R-score, one of `R0..R4`. Bands are defined in §6.1. |
| **Decision** | One of `GO`, `CONDITIONAL`, `NO_GO`. See §7. |
| **Internal grade** | One of `A`, `B`, `C`, `D1`, `D2`. Informative companion to the decision. See §6.2. |
| **Conditional tier** | Subdivision of `CONDITIONAL` into `A`, `C`, `D1`, `D2`. See §7.2. |
| **WeatherNow** | Today's real-time weather component, in `[0, 42]`. See §5.2. |
| **G_score** | Ground / site component, in `[0, 20]`. Supersedes v1.1's B_score. See §5.3. |
| **O_score** | Operational-context component, in `[0, 12]`. See §5.4. |
| **E_score** | Equipment-reliability component, in `[0, 8]`. See §5.5. |
| **Buffer ratio** | Time buffer to be applied by the scheduler, in `[0.05, 0.55]`. See §8. |
| **Completion probability** | Expected fraction of planned mission completion, in `[0.05, 0.99]`. See §9. |
| **Hard stop** | A non-overridable condition that forces `NO_GO`. See §7.1. |
| **WR matrix** | Decision look-up indexed by (W-code, R-level). See §7.3. |
| **Regime confidence** | Real in `[0, 1]` expressing how decisively the regime classifier chose the primary W-code. See §4.2. |
| **EDR** | Eddy Dissipation Rate, dimensionless turbulence metric in roughly `[0, 1]`. See §5.2.6. |
| **iGRC** | Intrinsic Ground Risk Class; SORA 2.5 term for the consequence side of ground risk. See §5.3.2. |
| **M1A / M1B / M1C** | SORA 2.5 ground-risk mitigations reducing the iGRC. See §5.3.2. |
| **TKE proxy** | Turbulent-kinetic-energy proxy term used when explicit EDR is unavailable. See §5.3.3. |
| **P10 / P50 / P90** | Ensemble forecast percentiles (optimistic / median / conservative). See §3.2. |
| **Ensemble low-confidence substitution** | Replacement of `wind_now_kmh` by `wind_p90_kmh` when ensemble agreement is low. See §5.2.1. |
| **r4_nogo_threshold** | Parameter splitting the R4 band into D2 (conditional) and hard NO-GO. See §7.1 and §10. |

### §2.2 Notation (normative)

Throughout this specification:

- `clamp(x, lo, hi)` denotes `min(hi, max(lo, x))`.
- `round(x)` denotes half-to-even rounding to the nearest integer
  unless a different precision is explicitly given. Implementations MAY
  use half-away-from-zero if the difference never exceeds the §1.2
  tolerance for the quantity being rounded.
- `round1(x)` denotes rounding to one decimal place via
  `round(x * 10) / 10`.
- `round3(x)` denotes rounding to three decimal places via
  `round(x * 1000) / 1000`.
- `round(x * 10) / 10` in pseudocode MUST be interpreted as `round1`.
- Array / table lookups are by **first match** unless otherwise stated.
- Square brackets `[a, b]` denote closed intervals; parentheses denote
  open endpoints.

### §2.3 RFC 2119 usage (normative)

Keywords **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, **MAY**
in this document are to be interpreted as described in RFC 2119 when,
and only when, they appear in uppercase. Lowercase occurrences retain
their ordinary English meaning.

### §2.4 Units (normative)

| Quantity | Unit | Symbol |
|---|---|---|
| Wind speed | kilometres per hour | km/h |
| Rain intensity | millimetres per hour | mm/h |
| Altitude / height | metres | m |
| Rain probability | percent | % |
| EDR | dimensionless | — |
| Confidence | in `[0, 1]` or `[0, 100]` as noted | — |

Implementations MUST convert caller-supplied data into these units
before invoking any algorithm in §4–§9.

### §2.5 Null semantics (normative)

Where a field is declared nullable in §3, a `null` value signals
"information not available" and MUST be treated according to the
explicit rule for that field. In the absence of a rule, an
implementation MUST fall back to the default documented in the
relevant parameter-record field and MUST NOT silently substitute
zero.

---

## §3 Input Schema

### §3.1 `Weather30dInput` (normative)

Rolling 30-day weather statistics provide the regime context.

| Field | Type | Range | Unit | Semantics |
|---|---|---|---|---|
| `wind_mean_kmh` | number | `[0, ∞)` | km/h | Mean hourly wind speed over the preceding 30 days. |
| `wind_p90_kmh` | number | `[0, ∞)` | km/h | 90th-percentile hourly wind speed over the preceding 30 days. |
| `gust_p90_kmh` | number \| null | `[0, ∞)` or null | km/h | 90th-percentile gust speed; `null` if unavailable. |
| `rain_days_30` | integer | `[0, 30]` | days | Number of days with ≥ 1 mm of rain. |
| `heavy_rain_days_30` | integer | `[0, 30]` | days | Number of days with ≥ 20 mm of rain. |
| `instability_index` | number | `[0, 1]` | — | Convective instability index aggregated to `[0, 1]`. |
| `predictability_score` | number | `[0, 1]` | — | Higher is more stable / predictable. |

#### §3.1.1 Validation rules (normative)

An implementation MUST:

- Reject negative values for any numeric field.
- Reject `rain_days_30 > 30` or `heavy_rain_days_30 > 30`.
- Reject `instability_index` or `predictability_score` outside
  `[0, 1]`.
- Accept `gust_p90_kmh == null` (treated per §4.1 rule R-W5-gust).

### §3.2 `WeatherTodayInput` (normative)

Today's forecast or real-time weather.

| Field | Type | Range | Unit | Semantics |
|---|---|---|---|---|
| `wind_now_kmh` | number | `[0, ∞)` | km/h | Current or point-forecast wind speed at operation time. |
| `wind_p10_kmh` | number \| optional | `[0, ∞)` | km/h | Ensemble P10 optimistic wind. |
| `wind_p90_kmh` | number \| optional | `[0, ∞)` | km/h | Ensemble P90 conservative wind. |
| `gust_now_kmh` | number \| null | `[0, ∞)` or null | km/h | Current gust; `null` if unavailable. |
| `rain_prob_today_pct` | number | `[0, 100]` | % | Probability of precipitation for the day. |
| `rain_mmph_forecast` | number | `[0, ∞)` | mm/h | One-hour rain rate forecast. |
| `thunder_risk` | `0 \| 1 \| null` | — | — | Binary thunder risk flag; `null` if unavailable. |
| `forecast_confidence` | number \| optional | `[0, 100]` | % | Ensemble member agreement. |
| `wind_direction_deg` | number \| optional | `[0, 360)` | degrees | 0 = N, 90 = E, etc. |
| `edr` | number \| null \| optional | `[0, ∞)` or null | — | Eddy Dissipation Rate. |
| `local_hour` | integer \| null \| optional | `[0, 23]` | — | Local hour for W4 time-of-day multiplier. |
| `cwa_cross` | object \| optional | — | — | CWA cross-validation payload (opaque; informative). |
| `jma_cross` | object \| optional | — | — | JMA cross-validation payload (opaque; informative). |

#### §3.2.1 Ensemble fields and confidence (informative)

The three wind percentiles (`p10`, `now` ≈ `p50`, `p90`) and the
`forecast_confidence` field allow the engine to apply the ensemble
low-confidence substitution of §5.2.1 and the ensemble-penalty term
of §8.

#### §3.2.2 Cross-validation payloads (informative)

`cwa_cross` and `jma_cross` are opaque to the core algorithm and are
used only by region-specific informative UIs. Conforming
implementations MAY ignore them entirely.

### §3.3 `BuildingSiteInput` (normative)

Building and site characteristics.

| Field | Type | Range | Unit | Semantics |
|---|---|---|---|---|
| `site_altitude_m` | number | `[0, ∞)` | m | Altitude above mean sea level. |
| `building_floors` | integer \| null | `[0, ∞)` | — | Floor count; may be derived from height. |
| `building_height_m` | number \| null | `[0, ∞)` | m | Height in metres. |
| `facade_complexity` | `"light" \| "medium" \| "heavy"` | — | — | Dominant facade complexity. |
| `clearance_m` | number \| null | `[0, ∞)` | m | Available working clearance from wall. |
| `near_hv_power` | `0 \| 1` | — | — | Adjacent high-voltage infrastructure. |
| `near_base_station` | `0 \| 1` | — | — | Adjacent cellular base station. |
| `wind_channel_effect` | `0 \| 1` | — | — | Venturi / channelled-wind corridor. |
| `rooftop_condition` | `"good" \| "limited" \| "not_available" \| null` | — | — | Rooftop accessibility. |
| `crowd_density` | `"low" \| "medium" \| "high" \| null` | — | — | Ground-level crowd density near operation. |
| `region_exposure` | `"windward" \| "leeward" \| "coastal" \| "rooftop_open" \| null` | — | — | Topographic exposure class. |
| `population_density_class` | `"assembly" \| "high_urban" \| "residential" \| "light" \| "isolated"` \| optional | — | — | SORA 2.5 iGRC input. |
| `sora_mitigations` | `Array<"M1A" \| "M1B" \| "M1C">` \| optional | — | — | Applied SORA 2.5 M1-series mitigations. |

#### §3.3.1 Derivation (normative)

When `building_floors` is `null` but `building_height_m` is provided,
implementations MUST derive the floor count as
`round(building_height_m / 3.2)`. Lower-bounded by 0.

#### §3.3.2 Default for `population_density_class` (normative)

If `population_density_class` is absent, implementations MUST treat
it as `"residential"` for the purpose of §5.3.2.

### §3.4 `OperationalContextInput` (normative)

| Field | Type | Range | Unit | Semantics |
|---|---|---|---|---|
| `time_window` | `"day" \| "night"` | — | — | Scheduled operation time window. |
| `weekend` | `0 \| 1` | — | — | Whether the operation falls on a weekend. |
| `urgent_days` | integer \| null | `[0, ∞)` or null | days | Days until deadline; `null` if not urgent. |
| `road_closure_needed` | `0 \| 1` | — | — | Whether the operation requires a road closure. |
| `multi_day_split` | `0 \| 1` \| null | — | — | Whether operation is split across days. |
| `operator_experience_level` | `"junior" \| "mid" \| "senior" \| null` | — | — | PIC experience tier. |
| `mission_days` | integer \| optional | `[1, ∞)` | days | Total calendar days of the mission for fatigue scoring. |

### §3.5 `Equipment` item (normative)

| Field | Type | Range | Semantics |
|---|---|---|---|
| `id` | string | — | Opaque identifier. |
| `name` | string | — | Human-readable name. |
| `type` | `"drone" \| "module" \| "pump" \| "hose" \| "battery"` | — | Equipment kind. |
| `serial` | string | — | Serial number. |
| `health_status` | `"ok" \| "warn" \| "block"` | — | Health classification. |
| `last_calibrated` | ISO date | — | Last calibration date. |
| `calibration_expires` | ISO date | — | Calibration expiry. |
| `last_maintenance` | ISO date | — | Last maintenance date. |
| `notes` | string \| optional | — | Free-text notes. |
| `block_category` | `"B1" \| "B2" \| "B3"` \| optional | — | Block-level subcategory. |
| `warn_category` | `"W1".."W6"` \| optional | — | Warn-level subcategory. |

### §3.6 `LARMInput` (normative)

The full input record passed to `evaluateRisk`.

```
LARMInput = {
  weather_30d                   : Weather30dInput
  weather_today                 : WeatherTodayInput
  building                      : BuildingSiteInput
  operational                   : OperationalContextInput | absent
  w_override                    : ("W0".."W5") | absent
  equipment                     : Array<Equipment> = []
  recent_typhoon_count          : integer | null | absent
  local_completion_adjustment   : number | absent   (default 1.0)
}
```

#### §3.6.1 Operational defaulting (normative)

When `operational` is absent, implementations MUST substitute:

```
{
  time_window: "day",
  weekend: 0,
  urgent_days: null,
  road_closure_needed: 0,
  multi_day_split: null,
  operator_experience_level: null
}
```

and MUST NOT treat this as an error.

#### §3.6.2 `w_override` (normative)

`w_override`, when present, bypasses §4.1 classification. The
regime-classifier output in that case has `confidence = 1.0` and
`secondary_w = null`.

---

## §4 Weather Regime Classification

### §4.1 W-code assignment (normative)

Given `w30 : Weather30dInput`, `today : WeatherTodayInput`, and the
parameter record `P`, the classifier computes a primary W-code by
evaluating the following rules in order, appending each satisfying
rule to a `matches` list. The **first** rule that matches becomes the
primary code; the **second**, if any, becomes `secondary_w`.

```
matches = []

if w30.wind_p90_kmh >= 39
   or (w30.gust_p90_kmh != null and w30.gust_p90_kmh >= 50):
    matches.push("W5")                                  # rule R-W5

if w30.rain_days_30 >= 15 and w30.heavy_rain_days_30 >= 3:
    matches.push("W3")                                  # rule R-W3

if w30.instability_index >= 0.70 and w30.heavy_rain_days_30 >= 2:
    matches.push("W4")                                  # rule R-W4

if w30.wind_p90_kmh >= 33 and w30.predictability_score >= 0.60:
    matches.push("W1")                                  # rule R-W1

if 8 <= w30.rain_days_30 <= 14 and w30.predictability_score < 0.55:
    matches.push("W2")                                  # rule R-W2

w_code       = matches[0] if matches else "W0"
secondary_w  = matches[1] if len(matches) >= 2 else null
```

Rule R-W5 covers both the 39 km/h mean-wind branch and the 50 km/h
gust branch; either triggers W5.

### §4.2 Regime confidence (normative)

```
confidence =
    1.00  if len(matches) <= 1
    0.78  if len(matches) == 2
    0.62  if len(matches) == 3
    0.50  otherwise
```

The confidence feeds the buffer ratio via §8. It has no direct effect
on the R-score.

### §4.3 W5 climate-trend correction (normative)

If `w_code == "W5"` and `recent_typhoon_count != null` and
`recent_typhoon_count > P.w5_typhoon_trend_threshold`, the regime's
base score is adjusted by `P.w5_typhoon_trend_bonus`:

```
adjusted_base =
    P.regimes[w_code].base_score + P.w5_typhoon_trend_bonus
    if the conditions above hold, else P.regimes[w_code].base_score
```

The Taiwan reference values are
`w5_typhoon_trend_threshold = 3.6` [heuristic, no empirical source]
and `w5_typhoon_trend_bonus = 2` [heuristic, no empirical source].

### §4.4 Override (normative)

If `input.w_override` is present, the classifier returns

```
{ w_code: override, confidence: 1.0, secondary_w: null,
  adjusted_base: P.regimes[override].base_score }
```

without evaluating the rules of §4.1.

### §4.5 Worked examples (informative)

#### §4.5.1 Single-match W2

Given

```
w30 = { wind_p90_kmh: 35, gust_p90_kmh: 42,
        rain_days_30: 10, heavy_rain_days_30: 1,
        instability_index: 0.55, predictability_score: 0.45 }
```

- R-W5: `35 < 39` and `42 < 50` ⇒ no match.
- R-W3: `10 < 15` ⇒ no match.
- R-W4: `0.55 < 0.70` ⇒ no match.
- R-W1: `35 >= 33` but `0.45 < 0.60` ⇒ no match.
- R-W2: `8 <= 10 <= 14` and `0.45 < 0.55` ⇒ **W2**.

Result: `w_code = "W2"`, `secondary_w = null`, `confidence = 1.0`.

#### §4.5.2 Two-match with W5 primary

Given

```
w30 = { wind_p90_kmh: 42, gust_p90_kmh: 55,
        rain_days_30: 16, heavy_rain_days_30: 4,
        instability_index: 0.40, predictability_score: 0.55 }
```

- R-W5: `42 >= 39` ⇒ **W5** (first in list).
- R-W3: `16 >= 15` and `4 >= 3` ⇒ W3 (second).
- R-W4: `0.40 < 0.70` ⇒ no match.
- R-W1: `42 >= 33` but `0.55 < 0.60` ⇒ no match.
- R-W2: `16 > 14` ⇒ no match.

Result: `w_code = "W5"`, `secondary_w = "W3"`, `confidence = 0.78`.

#### §4.5.3 Baseline W0 (no matches)

Given

```
w30 = { wind_p90_kmh: 20, gust_p90_kmh: 28,
        rain_days_30: 5, heavy_rain_days_30: 0,
        instability_index: 0.30, predictability_score: 0.80 }
```

No rule matches. Result: `w_code = "W0"`, `secondary_w = null`,
`confidence = 1.0`.

#### §4.5.4 W5 with recent-typhoon-count correction

Given a W5 classification with `recent_typhoon_count = 5`
(> the default threshold of 3.6):

```
base_score[W5] = 20
adjusted_base  = 20 + w5_typhoon_trend_bonus = 20 + 2 = 22
```

The reported `base_w` for this operation is 22. Had the recent
typhoon count been 3 (≤ 3.6), no correction would apply and
`base_w = 20`.

---

## §5 Component Scores

### §5.1 Base(W) (normative)

```
base_w = adjusted_base   # from §4.3 / §4.4
```

`base_w` lies in `[3, 22]` under the Taiwan reference calibration, or
in whatever range the provided parameter record permits. Implementations
MUST NOT round `base_w` before aggregation in §6.

### §5.2 WeatherNow — range `[0, 42]` (normative)

`WeatherNow` aggregates today's weather risk. All sub-scores feed a
weighted sum that is then multiplied by a region-exposure factor, an
optional W4 time-of-day multiplier, and finally clamped to
`P.weather_now_weights.weather_now_cap` (default `42`).

#### §5.2.1 Effective wind speed (normative)

```
conf_threshold = P.weather_now_weights.ensemble_low_conf_threshold   # default 55
low_confidence = today.forecast_confidence != null
                 and today.forecast_confidence < conf_threshold

effective_wind_kmh = (today.wind_p90_kmh
                      if low_confidence and today.wind_p90_kmh != null
                      else today.wind_now_kmh)
```

Rationale (informative): when the ensemble agrees less than
`conf_threshold` percent of the time, the engine conservatively uses
the P90 upper-bound wind rather than the median.

#### §5.2.2 Wind sub-score (normative)

The wind score table is a sorted array of disjoint closed
intervals; each row `(min_kmh, max_kmh, score)` means
`min_kmh <= kmh <= max_kmh → score`. Look-up is by first match.

```
function get_wind_score(kmh, P):
    for row in P.thresholds.wind_score_table:
        if row.min_kmh <= kmh <= row.max_kmh:
            return row.score
    return 80   # fallback for the highest band; see §5.2.10
```

The Taiwan reference table is:

| min_kmh | max_kmh | score |
|---:|---:|---:|
| 0 | 10 | 0 |
| 11 | 18 | 10 |
| 19 | 25 | 20 |
| 26 | 32 | 35 |
| 33 | 38 | 55 |
| 39 | 999 | 80 |

All six rows are [heuristic, no empirical source].

The wind contribution to WeatherNow is

```
wind_score = get_wind_score(effective_wind_kmh, P)
wind_comp  = min(50, wind_score * P.thresholds.wind_weight_scale)
```

with default `wind_weight_scale = 0.8` [heuristic, no empirical source].

#### §5.2.3 Rain sub-score (normative)

Four rules evaluated **in order**:

```
function get_rain_score(prob, mmph, P):
    r = P.thresholds.rain_score_rules
    if prob < r.rule_0.rain_prob_lt_pct
       and mmph < r.rule_0.rain_mmph_lt:
        return r.rule_0.score      # dry
    if prob > r.rule_3.rain_prob_gt_pct
       or  mmph > r.rule_3.or_mmph_gt:
        return r.rule_3.score      # heavy
    if (r.rule_2.rain_prob_gte_pct <= prob <= r.rule_2.rain_prob_lte_pct)
       or (r.rule_2.or_mmph_gte    <= mmph <= r.rule_2.or_mmph_lte):
        return r.rule_2.score      # moderate
    if (r.rule_1.rain_prob_gte_pct <= prob <= r.rule_1.rain_prob_lte_pct)
       or (r.rule_1.or_mmph_gte    <= mmph <= r.rule_1.or_mmph_lte):
        return r.rule_1.score      # light
    return 0
```

The Taiwan reference thresholds and scores are:

| Rule | prob % | rate mm/h | Score |
|---|---|---|---|
| rule_0 (dry)      | < 20 AND      | < 1         | 0  |
| rule_1 (light)    | 20 – 40 OR    | 1 – 3       | 10 |
| rule_2 (moderate) | 40 – 60 OR    | 3 – 10      | 25 |
| rule_3 (heavy)    | > 60 OR       | > 10        | 45 |

All thresholds and scores are [heuristic, no empirical source].

Note (informative): rule_0 uses logical AND (both conditions must
be dry); rule_1 through rule_3 use logical OR.

#### §5.2.4 Instability sub-score (normative)

```
inst_scale =
    P.weather_now_weights.instability_scale_w4  if w_code == "W4"
    else P.weather_now_weights.instability_scale

inst_comp = w30.instability_index * inst_scale
```

Taiwan reference values: `instability_scale = 20`,
`instability_scale_w4 = 28`. Both are [heuristic, no empirical source].

#### §5.2.5 Predictability discount (normative)

```
pred_disc = -(w30.predictability_score * P.weather_now_weights.predictability_discount)
```

Taiwan reference: `predictability_discount = 10` [heuristic, no empirical source].

Because `predictability_score` is in `[0, 1]`, `pred_disc` lies in
`[-10, 0]`.

#### §5.2.6 Thunder add-on (normative)

```
thunder = P.weather_now_weights.thunder_add  if today.thunder_risk == 1 else 0
```

Taiwan reference: `thunder_add = 5` [heuristic, no empirical source].

#### §5.2.7 EDR turbulence adjustment (normative)

```
function compute_edr_adj(edr, P):
    if edr is None:
        return 0
    adj = 0
    for t in P.edr_thresholds:                  # cumulative min-EDR lookup
        if edr >= t.min_edr:
            adj = t.adj
    return adj
```

The loop MUST be executed over the table in its declared order and
MUST overwrite `adj` on every matching row; the returned value is
therefore the `adj` of the **last matching row**, not of the smallest
matching row. (See §14 for discussion; a naive bucket lookup would
disagree.)

The Taiwan reference table is:

| min_edr | adj |
|---:|---:|
| 0.10 | 3  |
| 0.30 | 7  |
| 0.50 | 12 |
| 0.80 | 20 |

Values [heuristic, no empirical source]; derived from ICAO-style EDR
severity bands (see §16).

#### §5.2.8 Region-exposure factor (normative)

```
region_weight = 1.0
if building.region_exposure is not null:
    region_weight = P.region_weight_table[w_code][building.region_exposure]
                    or 1.0
```

The default weight when a key is missing is `1.0`. The Taiwan
reference table (6×4) appears in Appendix A; all entries are
[heuristic, no empirical source].

#### §5.2.9 W4 time-of-day multiplier (normative)

```
time_mult = 1.0
if w_code == "W4"
   and today.local_hour is not null
   and 14 <= today.local_hour < 18:
    time_mult = P.weather_now_weights.w4_time_multiplier
```

Taiwan reference: `w4_time_multiplier = 1.5` [heuristic, no empirical source].

#### §5.2.10 Aggregation and clamp (normative)

```
wts = P.weather_now_weights
raw = wts.wind * wind_comp
    + wts.rain * rain_score
    + wts.instability * inst_comp
    + pred_disc
    + thunder
    + edr_adj

weather_now = round1(clamp(raw * region_weight * time_mult,
                           0, wts.weather_now_cap))
```

Taiwan reference weights: `wind = 0.55`, `rain = 0.35`,
`instability = 0.10`. These sum to `1.00` exactly; this is a
deliberate v2.0 recalibration (v1.1 used `0.55 + 0.35 + 0.15 = 1.05`).
`weather_now_cap = 42`.

### §5.2.11 WeatherNow worked example — clear day, coastal W0 (informative)

Given:

```
today = {
  wind_now_kmh: 15, wind_p90_kmh: 22,
  rain_prob_today_pct: 10, rain_mmph_forecast: 0,
  thunder_risk: 0, forecast_confidence: 85, edr: 0.05,
  local_hour: 10
}
w30 = { instability_index: 0.25, predictability_score: 0.80, ... }
w_code = "W0"
building.region_exposure = "coastal"
```

Effective wind: `85 >= 55` ⇒ `wind_now_kmh = 15`.
Wind score: row 2 (11–18) ⇒ 10. `wind_comp = min(50, 10 * 0.8) = 8`.
Rain: `10 < 20` AND `0 < 1` ⇒ rule_0, `rain_score = 0`.
Instability: `inst_scale = 20` (not W4); `inst_comp = 0.25 * 20 = 5`.
Predictability discount: `-(0.80 * 10) = -8`.
Thunder: 0.
EDR adj: `0.05 < 0.10` ⇒ 0.

```
raw = 0.55 * 8 + 0.35 * 0 + 0.10 * 5 + (-8) + 0 + 0
    = 4.4 + 0 + 0.5 - 8
    = -3.1
region_weight = 1.00 (W0/coastal)
time_mult     = 1.0  (not W4)
product       = -3.1 * 1.00 * 1.0 = -3.1
weather_now   = round1(clamp(-3.1, 0, 42)) = 0.0
```

The negative sum is clamped to zero; WeatherNow for a clear, dry,
low-wind day is zero.

### §5.2.12 WeatherNow worked example — W5 coastal with P90 substitution (informative)

Given:

```
today = {
  wind_now_kmh: 25, wind_p90_kmh: 40,
  rain_prob_today_pct: 55, rain_mmph_forecast: 6,
  thunder_risk: 0, forecast_confidence: 45, edr: 0.35,
  local_hour: 9
}
w30 = { instability_index: 0.50, predictability_score: 0.30, ... }
w_code = "W5"
building.region_exposure = "coastal"
```

Effective wind: `45 < 55` ⇒ low-confidence path; `wind_p90_kmh = 40`.
Wind score: row 6 (39–999) ⇒ 80. `wind_comp = min(50, 80 * 0.8 = 64) = 50`.
Rain: `55 >= 40 AND 55 <= 60` ⇒ rule_2; `rain_score = 25`.
Instability: `inst_scale = 20`; `inst_comp = 0.50 * 20 = 10`.
Predictability discount: `-(0.30 * 10) = -3`.
Thunder: 0.
EDR adj: last-matching row with `min_edr <= 0.35` is `{0.30, 7}` ⇒ 7.

```
raw = 0.55 * 50 + 0.35 * 25 + 0.10 * 10 + (-3) + 0 + 7
    = 27.5 + 8.75 + 1.0 - 3 + 0 + 7
    = 41.25
region_weight = 1.18 (W5/coastal)
time_mult     = 1.0
product       = 41.25 * 1.18 * 1.0 = 48.675
weather_now   = round1(clamp(48.675, 0, 42)) = 42.0
```

WeatherNow saturates at the cap.

### §5.2.13 WeatherNow worked example — W4 afternoon convection (informative)

Given:

```
today = {
  wind_now_kmh: 20, wind_p90_kmh: 25,
  rain_prob_today_pct: 65, rain_mmph_forecast: 12,
  thunder_risk: 1, forecast_confidence: 70, edr: 0.15,
  local_hour: 15
}
w30 = { instability_index: 0.80, predictability_score: 0.25, ... }
w_code = "W4"
building.region_exposure = "rooftop_open"
```

Effective wind: `70 >= 55` ⇒ `wind_now_kmh = 20`.
Wind score: row 3 (19–25) ⇒ 20. `wind_comp = min(50, 16) = 16`.
Rain: `65 > 60` ⇒ rule_3; `rain_score = 45`.
Instability: W4 ⇒ `inst_scale = 28`; `inst_comp = 0.80 * 28 = 22.4`.
Predictability discount: `-(0.25 * 10) = -2.5`.
Thunder: `thunder_risk == 1` ⇒ +5.
EDR adj: `0.15 >= 0.10` ⇒ 3 (`0.15 < 0.30`, no overwrite).

```
raw = 0.55 * 16 + 0.35 * 45 + 0.10 * 22.4 + (-2.5) + 5 + 3
    = 8.8 + 15.75 + 2.24 - 2.5 + 5 + 3
    = 32.29
region_weight = 1.05 (W4/rooftop_open)
time_mult     = 1.5  (W4 AND 14 <= 15 < 18)
product       = 32.29 * 1.05 * 1.5 = 50.856
weather_now   = round1(clamp(50.856, 0, 42)) = 42.0
```

The W4 afternoon multiplier drives the pre-clamp value above the
cap; WeatherNow saturates.

### §5.3 G_score — range `[0, 20]` (normative)

G_score (ground / site) replaces the v1.1 B_score. It aggregates
four sub-dimensions: structural, ground consequence (SORA iGRC),
TKE proxy, and environment + interaction.

```
cfg = P.g_score_config
```

The Taiwan reference caps are:

| Sub-dim | Cap |
|---|---:|
| `structural_cap`         | 10 |
| `ground_consequence_cap` | 6  |
| `tke_proxy_cap`          | 3  |
| `env_interaction_cap`    | 4  |
| `env_hazards_cap`        | 3  |
| `total_cap`              | 20 |

The four sub-dim caps sum to 23, which exceeds `total_cap = 20` by
design: a single site cannot simultaneously max all four, and the
outer `total_cap` enforces the overall bound.

#### §5.3.1 Structural sub-dimension (normative)

```
floors = building.building_floors
         or (round(building.building_height_m / 3.2) if building.building_height_m else 0)

height_score =
    8 if floors > 30
    6 if floors > 20
    3 if floors > 10
    0 otherwise

alt_score =
    5 if building.site_altitude_m > 800
    3 if building.site_altitude_m > 300
    1 if building.site_altitude_m > 100
    0 otherwise

complexity_score =
    2 if building.facade_complexity == "light"
    4 if building.facade_complexity == "medium"
    6 if building.facade_complexity == "heavy"
    0 otherwise

structural = min(cfg.structural_cap,
                 height_score + alt_score + complexity_score)
```

All three sub-scores are [heuristic, no empirical source].

#### §5.3.2 Ground-consequence sub-dimension (SORA 2.5 iGRC) (normative)

```
pop_density = building.population_density_class or "residential"

pop_map = {
    "assembly"    : 6,
    "high_urban"  : 4,
    "residential" : 2,
    "light"       : 1,
    "isolated"    : 0,
}
base_grc = pop_map[pop_density]

m1_reduction = count of entries in building.sora_mitigations
               that are in {"M1A", "M1B", "M1C"}

ground_consequence = clamp(base_grc - m1_reduction,
                           0, cfg.ground_consequence_cap)
```

The mapping from population-density class to base GRC is aligned with
SORA 2.5 iGRC tabulation (see §16); the exact integer values are
[heuristic, no empirical source] with respect to the precise
operation-type combinations targeted by LARM.

Each applied M1 mitigation reduces the ground consequence by 1. Order
of application does not matter; duplicates in the input array MUST
be counted only once (implementations SHOULD deduplicate the array
before counting).

#### §5.3.3 TKE proxy sub-dimension (normative)

When EDR is unavailable, a proxy term estimates turbulent kinetic
energy from floor count, current wind, and corridor flag:

```
floor_factor =
    0.8 if floors > 30
    1.2 if floors > 20
    1.0 if floors > 10
    0.5 otherwise

wind_factor     = sqrt(max(0, today.wind_now_kmh) / 10)
corridor_factor = 1.4 if building.wind_channel_effect == 1 else 1.0

tke_proxy = min(cfg.tke_proxy_cap,
                floor(floor_factor * wind_factor * corridor_factor))
```

The `floor_factor` is non-monotonic (higher for 21–30 floors than for
>30 floors) by design, approximating the mid-rise turbulence regime;
values are [heuristic, no empirical source].

#### §5.3.4 Environment and interaction sub-dimension (normative)

```
env_raw = 0
if building.near_hv_power     == 1:  env_raw += cfg.env_hazard_points.near_hv_power
if building.near_base_station == 1:  env_raw += cfg.env_hazard_points.near_base_station
if building.clearance_m is not null
   and building.clearance_m < 5:     env_raw += cfg.env_hazard_points.narrow_clearance
env_score = min(cfg.env_hazards_cap, env_raw)   # sub-cap before interaction

interaction = 0
if floors > 20 and building.wind_channel_effect == 1:
    interaction += 2
if (building.site_altitude_m or 0) > 300
   and building.clearance_m is not null
   and building.clearance_m < 5:
    interaction += 2
interaction_capped = min(2, interaction)

env_interaction = min(cfg.env_interaction_cap,
                      env_score + interaction_capped)
```

Values are [heuristic, no empirical source]. The four env-hazards
constants — `env_hazard_points.near_hv_power`,
`env_hazard_points.near_base_station`,
`env_hazard_points.narrow_clearance`, and `env_hazards_cap` — are
parameterised in `WeatherRegimeParams.g_score_config` (added in
v2.1; defaults 3, 1, 2, 3 respectively preserve v2.0 behaviour
exactly). Region adapters MAY override these values; they remain
part of the normative output computation. The interaction sub-block
literals (`+2 / +2` per term and `min(2, …)`) remain hardcoded under
v2.0 / v2.1 and are tracked separately for a future v3.0 review.

#### §5.3.5 Aggregation (normative)

```
g_score = min(cfg.total_cap,
              structural + ground_consequence + tke_proxy + env_interaction)
```

The outer `total_cap` applies last. The result record also exposes
`ground_consequence` and `tke_proxy` separately (see §3.6 output
spec, covered in §6.3 output schema).

### §5.3.6 Worked example — urban assembly, mid-rise, wind corridor (informative)

Given:

```
building = {
  site_altitude_m: 20,
  building_floors: 18,
  building_height_m: null,
  facade_complexity: "medium",
  clearance_m: 4,
  near_hv_power: 0,
  near_base_station: 1,
  wind_channel_effect: 1,
  rooftop_condition: "limited",
  crowd_density: "high",
  region_exposure: "windward",
  population_density_class: "assembly",
  sora_mitigations: ["M1A"]
}
today.wind_now_kmh = 24
```

Structural:

```
floors = 18
height_score      = 3    (floors > 10)
alt_score         = 0    (site_altitude_m <= 100)
complexity_score  = 4    ("medium")
structural        = min(10, 7) = 7
```

Ground consequence:

```
base_grc         = 6    ("assembly")
m1_reduction     = 1    (one M1A entry)
ground_consequence = clamp(5, 0, 6) = 5
```

TKE proxy:

```
floor_factor     = 1.0  (floors > 10)
wind_factor      = sqrt(24/10) ≈ 1.549
corridor_factor  = 1.4
tke_proxy_raw    = floor(1.0 * 1.549 * 1.4) = floor(2.169) = 2
tke_proxy        = min(3, 2) = 2
```

Environment + interaction:

```
env_raw         = 0 + 1 + 2 = 3   (base station + narrow clearance)
env_score       = min(3, 3) = 3
interaction     = 0 + 0 = 0       (floors 18 ≤ 20; altitude 20 ≤ 300)
interaction_capped = 0
env_interaction = min(4, 3 + 0) = 3
```

G_score total:

```
g_score = min(20, 7 + 5 + 2 + 3) = 17
```

The result record surfaces `g_score = 17`, `ground_consequence = 5`,
and `tke_proxy = 2`.

### §5.3.7 Worked example — isolated rural site (informative)

Given:

```
building = {
  site_altitude_m: 420,
  building_floors: 4,
  building_height_m: null,
  facade_complexity: "light",
  clearance_m: 12,
  near_hv_power: 0,
  near_base_station: 0,
  wind_channel_effect: 0,
  rooftop_condition: "good",
  crowd_density: "low",
  region_exposure: null,
  population_density_class: "isolated",
  sora_mitigations: []
}
today.wind_now_kmh = 12
```

Structural:

```
height_score      = 0    (floors <= 10)
alt_score         = 3    (300 < 420 <= 800)
complexity_score  = 2    ("light")
structural        = min(10, 5) = 5
```

Ground consequence:

```
base_grc         = 0    ("isolated")
m1_reduction     = 0
ground_consequence = 0
```

TKE proxy:

```
floor_factor     = 0.5  (floors <= 10)
wind_factor      = sqrt(12/10) ≈ 1.095
corridor_factor  = 1.0
tke_proxy_raw    = floor(0.5 * 1.095 * 1.0) = 0
tke_proxy        = 0
```

Environment + interaction: all zero.

G_score total: `min(20, 5 + 0 + 0 + 0) = 5`.

### §5.4 O_score — range `[0, 12]` (normative)

Operational-context additive score.

```
fp = P.o_score_flag_points
score = 0
parts = []

if ops.time_window == "night":
    score += fp.night;  parts.push("night")
if ops.weekend == 1:
    score += fp.weekend;  parts.push("weekend")
if ops.road_closure_needed == 1:
    score += fp.road_closure;  parts.push("road_closure")
if ops.urgent_days != null:
    if ops.urgent_days <= fp.urgent_critical_max_days:
        score += fp.urgent_critical
    elif ops.urgent_days <= fp.urgent_warn_max_days:
        score += fp.urgent_warn
if crowd_density == "high":
    score += fp.crowd_high
elif crowd_density == "medium":
    score += fp.crowd_medium
if ops.operator_experience_level == "junior":
    score += fp.operator_junior
elif ops.operator_experience_level == "mid":
    score += fp.operator_mid
elif ops.operator_experience_level == "senior":
    score += fp.operator_senior
if ops.mission_days != null:
    if ops.mission_days >= fp.long_mission_critical_min_days:
        score += fp.long_mission_critical
    elif ops.mission_days >= fp.long_mission_warn_min_days:
        score += fp.long_mission_warn

o_score = min(P.o_score_cap, score)
```

v2.1 update: per-flag points and the urgent / long-mission thresholds
are now read from `P.o_score_flag_points` rather than being hardcoded
literals. Default Taiwan values preserve v2.0 behaviour exactly (see
§5.4.2 below). Region adapters MAY tune any of these values; the
`o_score_cap` invariant is unchanged.

#### §5.4.1 Raw-sum behaviour (normative)

The raw sum of the additive contributions above can reach `23` under
default Taiwan values in the most extreme case (all sub-flags
simultaneously active). The documented `0..12` upper bound is the
**post-cap** value via `min(P.o_score_cap, ...)`. Implementations MUST
apply the cap and MUST NOT return the uncapped raw sum.

Taiwan reference: `o_score_cap = 12` [heuristic, no empirical source].

Point values are [heuristic, no empirical source].

### §5.4.2 Point-value summary table — Taiwan defaults (informative)

| Condition | Param field | Default contribution |
|---|---|---:|
| `time_window == "night"` | `o_score_flag_points.night` | +5 |
| `weekend == 1` | `o_score_flag_points.weekend` | +2 |
| `road_closure_needed == 1` | `o_score_flag_points.road_closure` | +3 |
| `urgent_days <= 3` (`urgent_critical_max_days`) | `o_score_flag_points.urgent_critical` | +5 |
| `4 <= urgent_days <= 7` (`urgent_warn_max_days`) | `o_score_flag_points.urgent_warn` | +3 |
| `urgent_days > 7` or null | — | 0 |
| `crowd_density == "high"` | `o_score_flag_points.crowd_high` | +3 |
| `crowd_density == "medium"` | `o_score_flag_points.crowd_medium` | +2 |
| `crowd_density == "low"` or null | — | 0 |
| `operator_experience_level == "junior"` | `o_score_flag_points.operator_junior` | +2 |
| `operator_experience_level == "mid"` | `o_score_flag_points.operator_mid` | 0 |
| `operator_experience_level == "senior"` | `o_score_flag_points.operator_senior` | 0 |
| `mission_days >= 7` (`long_mission_critical_min_days`) | `o_score_flag_points.long_mission_critical` | +3 |
| `4 <= mission_days <= 6` (`long_mission_warn_min_days`) | `o_score_flag_points.long_mission_warn` | +2 |
| `mission_days <= 3` or null | — | 0 |

The theoretical maximum raw sum under default Taiwan values is
`5 + 2 + 3 + 5 + 3 + 2 + 3 = 23`, of which only the post-cap
`o_score_cap` (default `12`) propagates downstream.

### §5.4.3 Worked example — urgent weekend night (informative)

Given:

```
operational = {
  time_window: "night",
  weekend: 1,
  urgent_days: 2,
  road_closure_needed: 1,
  operator_experience_level: "junior",
  mission_days: 3
}
crowd_density = "high"
```

```
5 (night) + 2 (weekend) + 3 (road_closure)
+ 5 (urgent <= 3d) + 3 (high crowd) + 2 (junior) + 0 (mission_days < 4)
= 20 raw
o_score = min(12, 20) = 12
```

### §5.5 E_score — range `[0, 8]` (normative)

Equipment-reliability additive score.

```
score = 0
parts = []
for eq in equipment:
    if eq.health_status == "block":
        score += P.e_score_config.block_points
        parts.push(eq.name + ":block")
    elif eq.health_status == "warn":
        score += P.e_score_config.warn_points
        parts.push(eq.name + ":warn")

e_score = min(P.e_score_config.cap, score)
```

Taiwan reference: `block_points = 3`, `warn_points = 1.5`,
`cap = 8`. All three are [heuristic, no empirical source].

### §5.5.1 Worked example — three-item fleet (informative)

Given equipment list:

```
equipment = [
  { health_status: "ok",    name: "Drone A" },
  { health_status: "warn",  name: "Battery 2" },
  { health_status: "warn",  name: "Pump 1" },
  { health_status: "block", name: "Module X" }
]
```

Raw:

```
0 + 1.5 + 1.5 + 3 = 6.0
```

Post-cap: `e_score = min(8, 6.0) = 6.0`.

Because `e_score >= 6` but `e_score < 8`, the decision-gating routine
of §7.6 will escalate to `CONDITIONAL-C` unless an earlier §7 clause
applies first.

### §5.5.2 Worked example — two blocks saturating cap (informative)

Given:

```
equipment = [
  { health_status: "block", name: "Drone A" },
  { health_status: "block", name: "Pump 1" },
  { health_status: "warn",  name: "Module X" }
]
```

Raw: `3 + 3 + 1.5 = 7.5`; post-cap `e_score = 7.5`. Still below the
hard cap of `8`, so §7.4 does not fire, but §7.6 does once control
reaches that clause.

### §5.5.3 Worked example — single block does not saturate (informative)

Given a single Block-status item (raw = 3), `e_score = 3`. No
E-score-specific gating applies; the item's presence is reflected
in the score but not in the decision tier.

---

## §6 Risk Score Aggregation

### §6.1 R-score and R-level (normative)

```
risk_score = clamp(round(base_w + weather_now + g_score + o_score + e_score),
                   0, 100)

risk_level = first row r in P.thresholds.mapping_r_level
             such that r.min <= risk_score <= r.max
             (fallback: "R4")
```

The Taiwan reference mapping is:

| R-level | min | max |
|---|---:|---:|
| R0 | 0  | 20  |
| R1 | 21 | 40  |
| R2 | 41 | 65  |
| R3 | 66 | 85  |
| R4 | 86 | 100 |

Rows are evaluated in order; an implementation MUST require rows to
be disjoint and non-overlapping.

### §6.2 Internal grade (normative)

```
internal_grade = ({R0: "A", R1: "B", R2: "C",
                    R3: "D1", R4: "D2"})[risk_level]
```

The grade is an informative companion label; downstream logic
SHOULD consume `decision` and `conditional_tier` instead.

### §6.3 Output record (normative)

Conforming implementations MUST return a `RiskResult` with at least
the following fields:

| Field | Type |
|---|---|
| `weather_type` | `"W0".."W5"` (alias of `w_code`) |
| `risk_level` | `"R0".."R4"` |
| `internal_grade` | `"A" \| "B" \| "C" \| "D1" \| "D2"` |
| `decision` | `"GO" \| "CONDITIONAL" \| "NO_GO"` |
| `requires_approval` | boolean |
| `controls` | array of strings |
| `ruleset_version` | string (e.g. `"larm_v2.0"`) |
| `evaluated_at` | ISO timestamp |
| `w_code` | `"W0".."W5"` |
| `base_w` | number |
| `weather_now` | number |
| `g_score` | number |
| `b_score` | number (backward-compat alias of `g_score`) |
| `o_score` | number |
| `e_score` | number |
| `risk_score` | integer |
| `buffer_ratio` | number |
| `explanations` | array of per-factor breakdown records |
| `versions` | `{larm_version, weather_regime_params_version, thresholds_version}` |
| `regime_confidence` | number in `[0, 1]` |
| `secondary_w` | `"W0".."W5" \| null` |
| `conditional_tier` | `"A" \| "C" \| "D1" \| "D2" \| null` |
| `edr_adj` | number (optional) |
| `tke_proxy` | number (optional) |
| `ground_consequence` | number (optional) |

---

## §7 Decision Gating

### §7.1 Hard stops (normative)

Hard stops have the highest priority and MUST be evaluated before
any band-based or matrix-based logic. When any hard stop fires,
the result is:

```
decision         = "NO_GO"
requires_approval = false
conditional_tier  = null
```

with a `controls` entry naming the hard stop that fired. The
hard-stop rules, in the order an implementation MUST evaluate them,
are:

1. **Wind hard stop.**
   `today.wind_now_kmh >= P.thresholds.hard_stop.wind_kmh`.
   Default `wind_kmh = 39`.
2. **Rain hard stop.**
   `today.rain_mmph_forecast > P.thresholds.hard_stop.rain_mmph`
   **AND** `today.rain_prob_today_pct > P.thresholds.hard_stop.rain_prob_pct`.
   Defaults: `rain_mmph = 10`, `rain_prob_pct = 60`.
3. **EDR hard stop.**
   `today.edr != null`
   **AND** `today.edr > P.thresholds.hard_stop.edr_threshold`.
   Default `edr_threshold = 0.8`.
4. **R4 hard-NO-GO threshold.**
   `risk_score > P.r4_nogo_threshold`.
   Default `r4_nogo_threshold = 92`.

**Exact boundary semantics for rule 4.** The comparison is strictly
greater-than. A `risk_score` of exactly `92` does **not** trigger
the hard stop and MUST be handled by the R4 CONDITIONAL-D2 branch
of §7.2. Conversely, any `risk_score >= 93` under the default
parameters triggers the hard NO-GO, regardless of `risk_level`.

All four hard stops are **non-overridable**: no WR-matrix entry,
conditional-tier, or tier-A downgrade can convert them into any
other decision.

### §7.2 Band-based gating (normative)

After the hard stops, the engine evaluates:

1. **R4 band, below hard-NO-GO threshold.**
   If `risk_level == "R4"` (i.e. `86 <= risk_score <= 92` under
   default parameters), the decision is `CONDITIONAL` with
   `conditional_tier = "D2"`, `requires_approval = true`, and a
   control set including supervisor-and-customer written confirmation,
   safety briefing, operation-window compression to ≤ 2 h, and full-
   time safety observer.
2. **R3 band.**
   If `risk_level == "R3"`, the decision is `CONDITIONAL` with
   `conditional_tier = "D1"`, `requires_approval = true`, and
   controls including a written safety plan, supervisor sign-off,
   operation-window compression to ≤ 4 h, and an additional safety
   observer.

**Consequence of the short-circuit (normative).** Because branches
(1) and (2) return before any WR-matrix lookup, the `wr_matrix` cells
at columns R3 and R4 are consulted **only** by informative helpers
(see §7.3 and §14). Implementations MUST short-circuit at R3/R4 to
preserve v2.0 behaviour.

### §7.3 WR-matrix lookup (normative for R0–R2)

For `risk_level in {"R0", "R1", "R2"}`, the engine queries the
parameter record:

```
wr = P.wr_matrix[w_code][risk_level]     # "go" | "cond" | "nogo"
```

The Taiwan reference matrix is:

| | R0 | R1 | R2 | R3 | R4 |
|---|---|---|---|---|---|
| **W0** | go   | go   | cond | (nogo) | (nogo) |
| **W1** | cond | go   | cond | (cond) | (nogo) |
| **W2** | nogo | cond | cond | (cond) | (nogo) |
| **W3** | nogo | nogo | cond | (cond) | (nogo) |
| **W4** | nogo | cond | cond | (cond) | (nogo) |
| **W5** | nogo | nogo | cond | (cond) | (nogo) |

The **parenthesised cells** in columns R3 and R4 are retained in the
parameter record for informative use by the standalone helper
`getWRDecision()` (non-normative UI support). They do **not**
participate in the normative decision path, because §7.2 short-
circuits before this lookup is reached.

Rule R4 of the matrix in §14.1 documents this inconsistency
explicitly.

### §7.4 E-score hard gate (normative)

If `e_score >= P.e_score_config.cap` (default `8`), regardless of
R-level (subject to the §7.1–§7.2 precedence), the engine returns
`CONDITIONAL` with `conditional_tier = "C"`,
`requires_approval = true`, and controls recommending equipment
replacement.

### §7.5 R2 CONDITIONAL tiers (normative)

For `risk_level == "R2"` the engine evaluates contextual conditions:

```
conds = []
if ops.time_window == "night":                    conds.push("night work amplifies risk")
if building.wind_channel_effect == 1:             conds.push("wind-corridor site — wind monitoring required")
if building.near_hv_power == 1:                   conds.push("adjacent HV power — strict path control required")
if building.region_exposure in {"windward", "coastal"}
   and w_code in {"W1", "W5"}:                    conds.push("windward/coastal under W1/W5 — conservative assessment")

if conds is empty:
    decision = "GO"
    controls = ["monitor environment", "confirm safety observer on site"]
else:
    tier = "C" if (e_score >= 6 or ops.time_window == "night") else "A"
    decision = "CONDITIONAL"
    conditional_tier = tier
    requires_approval = (tier == "C")
    controls = tier-label + conds
```

### §7.6 E-score warn gate (normative)

If no earlier branch has returned and `e_score >= 6` (even if
`e_score < P.e_score_config.cap`), the engine returns `CONDITIONAL`
with `conditional_tier = "C"`, `requires_approval = true`, and a
control recommending inspection of warn-status equipment.

### §7.7 WR-matrix CONDITIONAL at R0/R1 (normative)

If the WR-matrix cell for `(w_code, risk_level)` is `"cond"` and no
earlier branch has returned, the engine returns `CONDITIONAL` with
`conditional_tier = "A"`, `requires_approval = false`, and a single
environmental-monitoring control.

### §7.8 WR-matrix NO-GO at R0/R1 (normative)

If the WR-matrix cell is `"nogo"` and no earlier branch has returned,
the engine returns `NO_GO` with `requires_approval = false` and a
control citing the matrix cell.

### §7.9 Default GO (normative)

Otherwise the engine returns `GO` with `requires_approval = false`.
Controls for R0 are `["normal procedure"]`; for R1 they are
`["monitor wind continuously", "confirm site safety"]`.

### §7.10 Decision-gating flow summary (informative)

```
Inputs: risk_level, risk_score, today, building, ops,
        w_code, e_score, P

┌──────────────────────────────────────────────────┐
│ 1. wind hard stop?        → NO_GO                │
│ 2. rain hard stop?        → NO_GO                │
│ 3. edr hard stop?         → NO_GO                │
│ 4. risk_score > r4_nogo?  → NO_GO                │
│ 5. risk_level == "R4"?    → COND-D2              │
│ 6. risk_level == "R3"?    → COND-D1              │
│ 7. wr_matrix == "nogo"?   → NO_GO                │
│ 8. e_score >= cap?        → COND-C               │
│ 9. risk_level == "R2"?    → GO or COND-A/C       │
│10. e_score >= 6?          → COND-C               │
│11. wr_matrix == "cond"?   → COND-A               │
│12. default                → GO                   │
└──────────────────────────────────────────────────┘
```

Note that steps 5 and 6 execute **before** the matrix is consulted;
this is the short-circuit described in §7.2 and §14.1.

### §7.11 Precedence table (informative)

The precedence between clauses is total. The following table
cross-references each clause to the "decision event" it produces
when it fires first:

| Clause | Firing condition | Decision | Tier |
|---|---|---|---|
| §7.1 (1) | wind hard stop | NO_GO | — |
| §7.1 (2) | rain hard stop | NO_GO | — |
| §7.1 (3) | EDR hard stop | NO_GO | — |
| §7.1 (4) | `risk_score > r4_nogo_threshold` | NO_GO | — |
| §7.2 (R4) | `risk_level == "R4"` and earlier did not fire | CONDITIONAL | D2 |
| §7.2 (R3) | `risk_level == "R3"` | CONDITIONAL | D1 |
| §7.3 nogo | WR-matrix cell at R0–R2 is `"nogo"` | NO_GO | — |
| §7.4 | `e_score >= cap` | CONDITIONAL | C |
| §7.5 GO | `risk_level == "R2"` no contextual flags | GO | — |
| §7.5 COND-C | R2 with flags and (night or e_score ≥ 6) | CONDITIONAL | C |
| §7.5 COND-A | R2 with flags and no escalation | CONDITIONAL | A |
| §7.6 | `e_score >= 6` | CONDITIONAL | C |
| §7.7 | WR-matrix cell is `"cond"` (R0/R1) | CONDITIONAL | A |
| §7.9 | default | GO | — |

### §7.12 Worked example — E-score hard gate (informative)

Input:

```
risk_level = "R1"
risk_score = 38
e_score    = 8       (at the cap)
today.wind_now_kmh = 10
today.edr = 0.2
```

Hard-stop ladder:

- §7.1 (1) wind: `10 < 39` ⇒ skip.
- §7.1 (2) rain: skip (assume dry).
- §7.1 (3) EDR: `0.2 <= 0.8` ⇒ skip.
- §7.1 (4) R4 threshold: `38 <= 92` ⇒ skip.
- §7.2 R4: `risk_level != "R4"` ⇒ skip.
- §7.2 R3: `risk_level != "R3"` ⇒ skip.
- §7.3: lookup `wr_matrix[w_code]["R1"]`; assume `"go"` ⇒ no NO_GO.
- §7.4: `e_score == 8 >= 8` ⇒ fires. Decision: CONDITIONAL-C.

### §7.13 Worked example — R2 with night flag (informative)

Input:

```
risk_level = "R2"
risk_score = 55
e_score    = 5
ops.time_window = "night"
```

Hard stops: none fire. §7.2: not R3/R4. §7.3: assume WR-matrix at
R2 returns `"cond"`, but §7.5 is evaluated first and returns before
§7.7 is reached. §7.4: `e_score < cap` ⇒ skip.

§7.5: night flag added to `conds`. Because `ops.time_window == "night"`,
tier is escalated to `"C"`. Decision: CONDITIONAL-C.

### §7.14 Worked example — boundary at `risk_score = 92` (informative)

Input:

```
risk_score = 92   (exactly at r4_nogo_threshold)
risk_level = "R4" (since 86 <= 92 <= 100)
```

§7.1 (4): `92 > 92` is **false**; does not fire. §7.2 R4: fires with
tier `"D2"`. Decision: CONDITIONAL-D2.

Compare to `risk_score = 93`:

§7.1 (4): `93 > 92` is true. Decision: NO_GO.

This boundary is TV-05 and TV-06 in the conformance suite (§12.1).

---

## §8 Buffer Ratio

### §8.1 Formula (normative)

```
bc  = P.buffer_coefficients
vol = P.volatility_buffer_add[w_code] or 0
conf_penalty     = (1 - regime_confidence) * bc.regime_conf_penalty
ensemble_penalty = (1 - today.forecast_confidence / 100) * bc.ensemble_penalty
                   if today.forecast_confidence is not null else 0

buffer = bc.base
       + risk_score / bc.score_divisor
       + vol
       + conf_penalty
       + ensemble_penalty

buffer_ratio = round3(clamp(buffer, bc.min, bc.max))
```

### §8.2 Taiwan reference coefficients (informative)

| Coefficient | Value |
|---|---:|
| `base`                | 0.05 |
| `score_divisor`       | 400  |
| `regime_conf_penalty` | 0.05 |
| `ensemble_penalty`    | 0.10 |
| `min`                 | 0.05 |
| `max`                 | 0.55 |

Values [heuristic, no empirical source]. The v1.1 values were
`score_divisor = 250`, `regime_conf_penalty = 0.04`,
`ensemble_penalty = 0.08`, `max = 0.40`.

### §8.3 Volatility add-ons (informative)

| W-code | `volatility_buffer_add` |
|---|---:|
| W0 | 0.00 |
| W1 | 0.02 |
| W2 | 0.03 |
| W3 | 0.04 |
| W4 | 0.05 |
| W5 | 0.06 |

All six values [heuristic, no empirical source]. Note that under v2.0
the `W5` add-on of `0.06` is largely swallowed by the upper bound
`bc.max = 0.55` when other penalty terms are already near-maximum;
see §14.4.

### §8.4 Worked examples (informative)

#### §8.4.1 Mid-band W2 example

Given W2, `risk_score = 41`, `regime_confidence = 0.78`,
`forecast_confidence = 70`:

```
base     = 0.05
scaled   = 41 / 400                = 0.1025
vol      = 0.03
conf_pen = (1 - 0.78) * 0.05        = 0.011
ens_pen  = (1 - 0.70) * 0.10        = 0.030
─────────────────────────────────────────
sum      = 0.2235
buffer_ratio = round3(clamp(0.2235, 0.05, 0.55)) = 0.224
```

#### §8.4.2 Low-R W0 example

Given W0, `risk_score = 12`, `regime_confidence = 1.0`,
`forecast_confidence = 90`:

```
base     = 0.05
scaled   = 12 / 400                = 0.030
vol      = 0.00
conf_pen = (1 - 1.00) * 0.05        = 0.000
ens_pen  = (1 - 0.90) * 0.10        = 0.010
─────────────────────────────────────────
sum      = 0.090
buffer_ratio = round3(clamp(0.090, 0.05, 0.55)) = 0.090
```

#### §8.4.3 High-R W5 example demonstrating upper clamp

Given W5, `risk_score = 92`, `regime_confidence = 0.62`,
`forecast_confidence = 30`:

```
base     = 0.05
scaled   = 92 / 400                = 0.230
vol      = 0.06
conf_pen = (1 - 0.62) * 0.05        = 0.019
ens_pen  = (1 - 0.30) * 0.10        = 0.070
─────────────────────────────────────────
sum      = 0.429
buffer_ratio = round3(clamp(0.429, 0.05, 0.55)) = 0.429
```

This example does **not** saturate the clamp; §14.4's note about
saturation applies to higher-risk, lower-confidence combinations
where penalties push the sum above `0.55`.

#### §8.4.4 No-forecast-confidence example

Given W3, `risk_score = 55`, `regime_confidence = 0.50`,
`forecast_confidence = null`:

```
base     = 0.05
scaled   = 55 / 400                = 0.1375
vol      = 0.04
conf_pen = (1 - 0.50) * 0.05        = 0.025
ens_pen  = 0  (forecast_confidence is null)
─────────────────────────────────────────
sum      = 0.2525
buffer_ratio = round3(clamp(0.2525, 0.05, 0.55)) = 0.253
```

The ensemble-penalty term drops to 0 when
`today.forecast_confidence` is absent; conforming implementations
MUST NOT impute a default value for it in this formula.

---

## §9 Completion Probability

### §9.1 Formula (normative)

```
function completion_for_rl(rl, w, local_adjustment = 1.0):
    r_idx = integer-part(rl[1])     # "R3" → 3
    w_idx = integer-part(w[1])      # "W2" → 2
    base  = [97, 82, 60, 35, 10][r_idx] - w_idx * 3
    return clamp(round(base * local_adjustment), 5, 99)
```

The base array `[97, 82, 60, 35, 10]` is [heuristic, no empirical source];
the `-3% per W-level index` slope is [heuristic, no empirical source];
the clamp to `[5, 99]` is normative.

### §9.2 Completion table (informative)

|     | W0 | W1 | W2 | W3 | W4 | W5 |
|-----|---:|---:|---:|---:|---:|---:|
| R0  | 97 | 94 | 91 | 88 | 85 | 82 |
| R1  | 82 | 79 | 76 | 73 | 70 | 67 |
| R2  | 60 | 57 | 54 | 51 | 48 | 45 |
| R3  | 35 | 32 | 29 | 26 | 23 | 20 |
| R4  | 10 |  7 |  5 |  5 |  5 |  5 |

### §9.3 Regional adjustment (informative)

The `local_adjustment` multiplier is exposed in §3.6 via
`LARMInput.local_completion_adjustment`; it allows region adapters
(§10.3) to rescale the table without altering core calibration.

### §9.4 Relationship to `simpleRiskFromW` (informative)

The helper `simpleRiskFromW(w)` that some UI code paths use to
derive an R-level purely from a W-code is **informative only** and
MUST NOT be used to compute the normative `risk_level` of §6.1.

The helper's mapping is:

| W-code | UI-only `simpleRiskFromW(w)` |
|---|---|
| W0 | R0 |
| W1 | R1 |
| W2 | R1 |
| W3 | R2 |
| W4 | R2 |
| W5 | R3 |

This mapping is a coarse visual aid; it does not incorporate
G_score, O_score, E_score, or any operational context. Conforming
implementations MUST NOT use it in place of §6.1.

### §9.5 Worked completion examples (informative)

#### §9.5.1 Clear-day R0 (W0)

```
r_idx = 0
w_idx = 0
base  = 97 - 0 * 3 = 97
completion = clamp(round(97 * 1.0), 5, 99) = 97
```

#### §9.5.2 Typhoon-adjacent R3 (W5)

```
r_idx = 3
w_idx = 5
base  = 35 - 5 * 3 = 20
completion = clamp(round(20 * 1.0), 5, 99) = 20
```

#### §9.5.3 Extreme R4 W5 with clamp

```
r_idx = 4
w_idx = 5
base  = 10 - 5 * 3 = -5
completion = clamp(round(-5 * 1.0), 5, 99) = 5
```

#### §9.5.4 Regional adjustment example

For a region with `local_completion_adjustment = 0.9` at R2, W2:

```
base_raw = 60 - 2 * 3 = 54
adjusted = round(54 * 0.9) = round(48.6) = 49
completion = clamp(49, 5, 99) = 49
```

The rounding step applies **after** the multiplication, not before.

---

## §10 Parameter Registry

### §10.1 Core parameter schema (normative)

The parameter record is a single immutable object. Its top-level
shape is:

```
WeatherRegimeParams = {
  version            : string          # e.g. "v2.0"
  units              : {wind: string, rain_daily_heavy_threshold_mm: number}
  regimes            : {W0..W5: RegimeEntry}
  region_weight_table: {W0..W5: {windward, leeward, coastal, rooftop_open: number}}
  volatility_buffer_add: {W0..W5: number}
  thresholds         : {
    wind_score_table : Array<{min_kmh, max_kmh, score: number}>
    wind_weight_scale: number
    rain_score_rules : {rule_0..rule_3: RainRule}
    hard_stop        : {wind_kmh, rain_mmph, rain_prob_pct, edr_threshold: number}
    mapping_r_level  : Array<{min, max: number, r_level: string}>
  }
  wr_matrix          : {W0..W5: {R0..R4: "go"|"cond"|"nogo"}}
  weather_now_weights: WeatherNowWeights
  buffer_coefficients: BufferCoefficients
  ui_infer_thresholds: UIInferThresholds
  edr_thresholds     : Array<{min_edr, adj: number}>
  g_score_config     : GScoreConfig
  e_score_config     : EScoreConfig
  o_score_cap        : number
  quote_max_multiplier: number
  w5_typhoon_trend_threshold: number
  w5_typhoon_trend_bonus: number
  r4_nogo_threshold  : number
  pricing            : PricingParams
}
```

Each nested record has the shape given in §3–§8. The full
authoritative JSON of `WEATHER_REGIME_PARAMS_V2` appears in
Appendix A.

#### §10.1.1 Structural constraints (normative)

A conforming implementation MUST validate the parameter record as
follows:

1. `regimes` MUST include all six keys `W0..W5`.
2. `region_weight_table` MUST include all six W-codes and all four
   exposure classes.
3. `volatility_buffer_add` MUST include all six W-codes.
4. `thresholds.wind_score_table` MUST be non-empty and MUST cover
   `[0, wind_kmh_max]` without gaps among its `min_kmh..max_kmh`
   intervals, and scores SHOULD be monotonically non-decreasing in
   `min_kmh` (implementations MAY warn otherwise).
5. `thresholds.mapping_r_level` MUST be non-empty, disjoint, and
   collectively cover `[0, 100]`.
6. `wr_matrix` MUST include all six W-codes, each with all five
   R-levels.
7. `weather_now_weights.wind + .rain + .instability` SHOULD equal
   `1.00` within `1e-6`. An implementation MAY warn if the sum
   differs.
8. `buffer_coefficients.min <= buffer_coefficients.max`.
9. `e_score_config.cap >= e_score_config.block_points` and
   `e_score_config.cap >= e_score_config.warn_points`.
10. `edr_thresholds` SHOULD be sorted ascending by `min_edr`.
    If unsorted, the §5.2.7 last-wins semantics still apply but
    the effective mapping becomes harder to audit.

### §10.2 Taiwan reference calibration (informative)

This clause **describes** rather than **prescribes** the Taiwan
calibration. Implementations MUST NOT treat the numbers in §10.2 as
the only valid calibration; they are the reference values for the
`@openlarm/regions-taiwan` region adapter at the time of the v2.0
specification freeze.

#### §10.2.1 Regime base scores (Taiwan)

| W-code | Name (zh) | Taiwan `base_score` | Candidate range (heuristic) |
|---|---|---:|---|
| W0 | 穩定高壓晴朗型  | 3  | 1 – 8  |
| W1 | 東北季風型     | 9  | 6 – 15 |
| W2 | 鋒面掃過型     | 11 | 8 – 18 |
| W3 | 梅雨滯留型     | 16 | 14 – 25 |
| W4 | 午後熱對流型   | 15 | 12 – 22 |
| W5 | 颱風外圍環流型  | 20 | 18 – 30 |

Note (informative): the value for W1 in the v2.0 engine is `9`,
while the pre-v2.0 companion guide `LARM_CONCEPT_GUIDE.md` still
shows `W1 = 10`. The specification authoritatively cites the engine
value of `9`; the guide is informative and has drifted (see §14.7).

All values [heuristic, no empirical source].

#### §10.2.2 Region weights (Taiwan)

| W | windward | leeward | coastal | rooftop_open |
|---|---:|---:|---:|---:|
| W0 | 1.00 | 0.98 | 1.00 | 1.02 |
| W1 | 1.10 | 0.98 | 1.12 | 1.08 |
| W2 | 1.05 | 1.00 | 1.06 | 1.05 |
| W3 | 1.03 | 1.00 | 1.02 | 1.03 |
| W4 | 1.04 | 1.00 | 1.03 | 1.05 |
| W5 | 1.15 | 1.05 | 1.18 | 1.12 |

All values [heuristic, no empirical source].

#### §10.2.3 Hard-stop defaults (Taiwan)

| Constant | Value |
|---|---:|
| `wind_kmh`       | 39  |
| `rain_mmph`      | 10  |
| `rain_prob_pct`  | 60  |
| `edr_threshold`  | 0.8 |
| `r4_nogo_threshold` | 92 |

The wind threshold is chosen to align with the Beaufort `> 7`
boundary (see §16); the rain threshold follows from Taiwan's CWA
"heavy rain" definition. Both are [heuristic, no empirical source]
in the sense that the calibration for LARM-specific accept/reject
outcomes was not derived from a published dataset.

#### §10.2.4 Pricing link (informative)

The `pricing` field on the parameter record embeds the reference
pricing calibration. LARM core does **not** normatively specify
pricing; the field is present in the v2.0 engine for operational
convenience but is out of scope for conformance purposes. See §14.5
for the cross-coupling this introduces between risk and pricing
engines.

### §10.3 Region adapter specification (normative)

A region adapter is an immutable `WeatherRegimeParams` record
published as a separate artefact (e.g. `@openlarm/regions-taiwan`).
A region adapter MUST:

1. Declare a `version` string following the schema
   `"{region_slug}-{core_version}-{revision}"`, e.g.
   `"taiwan-v2.0-r0"`.
2. Provide a complete `WeatherRegimeParams` record conforming to
   §10.1.1.
3. Publish alongside it a written rationale document
   (`calibration.md`) stating, for each numeric value that differs
   from the spec reference, the evidence source or, where no
   empirical source exists, the tag `[heuristic, no empirical source]`.
4. Provide at least three conformance test vectors of its own that
   exercise region-specific behaviour (e.g. coastal W5, high-altitude
   windward, typhoon-trend correction).

A region adapter SHOULD NOT:

- Redefine the R-level mapping of §6.1 (such a change is a fork,
  not an adapter).
- Add fields to `WeatherRegimeParams` beyond those enumerated in
  §10.1. If genuinely needed, such additions SHOULD be proposed as
  a core specification change through the RFC process documented in
  `CONTRIBUTING.md`.

### §10.4 Override mechanism (normative)

The reference implementation supports a `localStorage`-based
parameter override keyed by `"larm_params_override"`, loaded only on
the client side. This override mechanism is:

- **Informative** with respect to the specification: it is a
  convenience for UI development and operator experimentation.
- **Not permitted** to violate §10.1.1 constraints.
- **Required** to be absent or empty for all §12 conformance tests.

Implementations MAY omit the override mechanism entirely.

A region adapter MUST NOT rely on the override mechanism to supply
fields that are required by §10.1. The override is strictly
supplementary.

---

## §11 Determinism and Reproducibility

### §11.1 Determinism (normative)

`evaluateRisk` MUST be a **pure function** of its inputs: given
identical `LARMInput` and `WeatherRegimeParams`, it MUST produce
identical outputs (within the §1.2 tolerance). Implementations MUST
NOT rely on any of:

- System wall-clock time (except for populating `evaluated_at`).
- Pseudo-random number generation (except for non-core identifier
  fields such as quotation codes outside the §6.3 output contract).
- Environment variables read at evaluation time.
- Locale-dependent number formatting during the computation.

### §11.2 Clock injection (normative)

The `evaluated_at` field MAY be populated from the system clock or
from a caller-supplied clock. When reproducibility is required for
test-vector validation (§12), implementations MUST accept an
injected clock (for example via a `now()` parameter or a dependency-
injection pattern).

### §11.3 Floating-point precision (normative)

The conventions of §2.2 define all rounding in the specification:

- `risk_score` is rounded to an integer via §6.1.
- `weather_now`, `g_score` sub-terms, and `e_score` are rounded to
  one decimal place via `round1` when exposed in explanations.
- `buffer_ratio` is rounded to three decimal places via `round3`.

Implementations MUST preserve at least these precisions. Excess
precision in internal intermediate values is permitted as long as
the final result satisfies §1.2.

### §11.4 Determinism in v2.0 vs earlier versions (informative)

The v1.1 engine did not specify rounding semantics for
`buffer_ratio`; v2.0 normatively requires `round3`. Implementations
porting v1.1 data MUST re-round when producing v2.0 outputs.

### §11.5 Ordering of map iteration (normative)

Where the algorithm iterates over a keyed map (e.g.
`region_weight_table[w_code]`), implementations MUST use direct key
lookup and MUST NOT depend on iteration order. Where the algorithm
iterates over a sequence (e.g. `wind_score_table`,
`mapping_r_level`, `edr_thresholds`), implementations MUST preserve
the sequence's declared order (first-match or last-wins as specified
in §5.2).

### §11.6 Reproducibility across language runtimes (informative)

LARM v2.0 uses only IEEE 754 double-precision floating-point
arithmetic for its intermediate values. The §1.2 tolerance of
`1e-2` absolute is chosen to accommodate:

- Differences in `sqrt` implementations (libm vs CRT) that
  contribute a last-bit discrepancy in the TKE proxy (§5.3.3).
- Language-specific rounding defaults (banker's rounding in
  Python's `round`, half-away-from-zero in some C runtimes,
  half-to-even in TypeScript with `Math.round` rounding half to
  the higher magnitude for positives).
- Small accumulation-order differences in the sum
  `wts.wind * wind_comp + wts.rain * rain_score + ...`.

Where bit-exact reproducibility across languages is required,
implementations MAY normalise to a canonical evaluation order:

```
raw_wind = wts.wind * wind_comp
raw_rain = wts.rain * rain_score
raw_inst = wts.instability * inst_comp
raw      = raw_wind + raw_rain + raw_inst + pred_disc + thunder + edr_adj
```

and round intermediate sub-totals to `round1` precision before the
outer clamp. This is not a conformance requirement; §1.2 tolerances
accommodate normal implementation variation.

### §11.7 Thread safety (informative)

`evaluateRisk` is referentially transparent and has no mutable
state; it is inherently thread-safe provided the supplied `input`
and `params` records are not mutated concurrently. Implementations
MAY memoise results at the caller's discretion.

### §11.8 Side-effect-free evaluation (normative)

A conforming implementation MUST NOT:

- Write to the filesystem during evaluation.
- Perform network I/O during evaluation.
- Emit logs that alter test-vector comparison (e.g. logs embedded
  in the returned `explanations` array that include timestamps).

Implementations MAY log to an external sink via a caller-supplied
logger so long as the sink is not part of the returned result.

---

## §12 Conformance Test Vectors

### §12.1 Basic suite (normative)

A Level-3 conforming implementation MUST pass the ten test vectors
published under
`spec/test-vectors/v2.0/basic/*.json`, each of which encodes a
complete `LARMInput` together with the expected `RiskResult`.

The ten vectors SHALL cover the following decision surfaces:

1. **TV-01 Clear-day baseline.** W0, low wind, no rain, no EDR →
   GO at R0/R1.
2. **TV-02 Heavy rain hard stop.** Rain hard stop fires
   (`rain_mmph > 10` AND `rain_prob > 60`) → NO_GO.
3. **TV-03 Wind hard stop.** `wind_now_kmh = 40` → NO_GO.
4. **TV-04 EDR hard stop.** `edr = 0.85` → NO_GO.
5. **TV-05 R4 CONDITIONAL-D2 boundary.** `risk_score = 92` → R4
   CONDITIONAL-D2 (not NO_GO).
6. **TV-06 R4 hard NO-GO.** `risk_score = 93` → NO_GO by §7.1 rule 4.
7. **TV-07 W4 afternoon multiplier.** W4, `local_hour = 15`,
   thunder risk = 1 → `time_mult = 1.5` applied to WeatherNow.
8. **TV-08 SORA mitigation.** `population_density_class = "assembly"`,
   `sora_mitigations = ["M1A","M1C"]` → `ground_consequence` reduced
   by 2.
9. **TV-09 W5 typhoon-trend bonus.** W5 classification with
   `recent_typhoon_count = 5` (> 3.6) → `adjusted_base = 22`.
10. **TV-10 Low ensemble confidence substitution.**
    `forecast_confidence = 40`, `wind_now_kmh = 18`,
    `wind_p90_kmh = 32` → effective wind = 32 and associated
    buffer-ratio ensemble-penalty accrues.

### §12.2 Edge-case coverage (normative)

At least one vector MUST cover each of:

- Both hard-stop boundaries (`rain_mmph = 10` not triggering; `= 11`
  triggering).
- The precise boundary `risk_score == r4_nogo_threshold` (default 92).
- The WR-matrix short-circuit behaviour (R3/R4 branch taken regardless
  of matrix cell).
- The ensemble low-confidence path (P90 substitution).
- The `building.building_floors == null` → derivation from
  `building_height_m` path of §3.3.1.

### §12.3 Machine-readable fixtures (normative)

Each fixture SHALL be a JSON document of the shape:

```json
{
  "id": "TV-05",
  "description": "R4 CONDITIONAL-D2 boundary at risk_score = 92",
  "params_version": "v2.0",
  "input": { "weather_30d": { ... }, "weather_today": { ... }, ... },
  "expected": {
    "w_code": "W5",
    "risk_level": "R4",
    "decision": "CONDITIONAL",
    "conditional_tier": "D2",
    "risk_score": 92,
    "buffer_ratio": 0.550
  }
}
```

Implementations MUST validate every field present in `expected`;
fields absent from `expected` are unconstrained.

### §12.4 Tolerance (normative)

Numeric comparisons MUST follow §1.2: categorical fields bit-equal,
numeric fields within `1e-2`.

### §12.5 Publication (normative)

The fixture corpus is published under
`spec/test-vectors/v2.0/`. The index file
`spec/test-vectors/v2.0/README.md` gives a one-line summary of each
fixture. Subsequent revisions of v2.0 (e.g. v2.0.1) MAY extend the
corpus but MUST NOT remove or change an existing fixture's
`expected` block without a MINOR version bump.

### §12.6 Self-description of a fixture (normative)

Every fixture MUST include a `params_version` field. A conforming
implementation MUST apply the parameter record referenced by that
string (via the §10 registry) before running the fixture. If the
implementation does not ship the referenced parameter version, it
MUST surface that as a verification failure rather than silently
run against a different version.

### §12.7 Fixture ID stability (normative)

Each fixture's `id` is permanent. Once published, a fixture file
MAY be moved between subdirectories (e.g. `basic/` to `edge/`) but
its `id` MUST persist. A verifier reporting success per fixture
MUST cite the `id`.

### §12.8 Suggested verifier output (informative)

Verifiers SHOULD produce output of the form:

```
LARM v2.0 conformance verifier
  Specification commit: <hash>
  Implementation     : <package>@<version>
  Parameter version  : v2.0
  Fixtures executed  : 10
  Fixtures passed    : 10
  Fixtures failed    : 0

  TV-01 ... PASS
  TV-02 ... PASS
  ...
  TV-10 ... PASS
```

A failing fixture's report SHOULD identify which field diverged and
by how much (for numeric fields) or between which values (for
categorical fields).

### §12.9 Extension vectors (informative)

Region adapters SHOULD publish additional vectors under
`spec/test-vectors/v2.0/regions/<slug>/` exercising region-specific
calibration behaviour. These vectors are informative with respect to
core conformance but are normative for the region adapter itself.

---

## §13 Non-Goals and Out of Scope

The following are explicitly **out of scope** for LARM v2.0:

1. **Airspace coordination.** LARM does not consult NOTAMs, TFRs,
   airspace classes, or ATC instructions. A companion package
   (`@openlarm/airspace`, planned) is intended for that role.
2. **Route planning.** LARM scores a single proposed operation; it
   does not plan routes or waypoints.
3. **Weather forecasting.** LARM consumes forecasts produced
   elsewhere; it does not produce forecasts.
4. **U-space / UTM integration.** LARM does not speak U-space or
   UTM protocols; integration is deferred to downstream systems.
5. **Battery / payload / airframe modelling.** LARM trusts caller-
   supplied equipment health flags; it does not simulate battery
   state, payload dynamics, or airframe-specific tolerances.
6. **Regulatory certification.** LARM is not an airworthiness,
   operational-approval, or SORA-replacement certification. See
   §0.1.
7. **Real-time monitoring.** LARM is a pre-flight decision-support
   computation. Continuous or in-flight re-evaluation is out of
   scope for the core spec (a region adapter or companion package
   MAY build on top of LARM for that purpose).
8. **Pricing.** Although `WeatherRegimeParams.pricing` exists on the
   v2.0 parameter record, pricing is not normatively specified by
   LARM. See §10.2.4 and §14.5.
9. **Cost / schedule optimisation.** LARM outputs a buffer ratio;
   interpreting it into a schedule or cost estimate is the caller's
   responsibility.

---

## §14 Known Limitations and Known Inconsistencies

This clause is informative but its identification of inconsistencies
is binding: a conforming implementation MUST reproduce the documented
behaviour, even where that behaviour is inconsistent with other
documentation or with intuition.

### §14.1 WR-matrix R3/R4 dead cells (inconsistency)

The decision-gating routine of §7 short-circuits on
`risk_level in {"R3", "R4"}` **before** the WR-matrix is consulted.
The cells `wr_matrix[*][R3]` and `wr_matrix[*][R4]` in
`weather-regime-params.ts` are therefore **dead code on the normative
path**. They are consumed only by the informative UI helper
`getWRDecision(w, r)` to display a consistent 6×5 matrix in
administration screens.

The legacy operator guide `LARM_PARAM_GUIDE.md` §5 still presents the
full 6×5 matrix as if it governed the decision; for v2.0 this is
incorrect on the R3/R4 columns. Implementations MUST follow §7.1–§7.2
and treat those cells as informative only.

A future minor version MAY either:

- Remove the R3/R4 columns from the parameter schema, or
- Invert the short-circuit logic so that the matrix cells govern and
  the band-based rules are the fallback.

Either path is a §10.1 schema change and requires an RFC.

### §14.2 O_score raw cap (normative clarification)

The raw sum inside `computeOperationalScore` can reach `23` in the
most adverse case (night + weekend + road-closure + urgent ≤ 3d +
high crowd + junior operator + fatigue ≥ 7d). The documented
`[0, 12]` upper bound is the **post-cap** value via
`min(P.o_score_cap, ...)`. Implementations MUST apply the cap; they
MUST NOT publish the uncapped raw sum as the O_score. §5.4.1 is
normative.

### §14.3 Vestigial per-regime weights (inconsistency)

Each `RegimeEntry` in the parameter record carries
`instability_weight` and `predictability_weight` fields that are not
read by `computeWeatherNow`. The code consumes the global
`weather_now_weights.instability` and `weather_now_weights.predictability_discount`
instead. The per-regime fields are therefore vestigial; they are
retained in the schema for backward compatibility with v1.x
serialised parameter records but have no effect on the v2.0
computation.

Implementations MAY ignore these fields; a future MAJOR version
SHOULD remove them.

### §14.4 W5 volatility buffer add-on saturates (normative clarification)

`volatility_buffer_add["W5"] = 0.06` is often absorbed by the
`bc.max = 0.55` clamp in high-R scenarios. For example, at
`risk_score = 90, regime_confidence = 0.50, forecast_confidence = 20`:

```
base + scaled + vol + conf_pen + ens_pen
= 0.05 + 0.225 + 0.06 + 0.025 + 0.08
= 0.44
```

Above that, with additional penalties, the sum easily exceeds `0.55`
and the clamp fires. Implementations MUST still apply the W5 add-on
(it matters in mid-band scenarios) but SHOULD warn operators that the
add-on's marginal effect above R3 is effectively zero.

### §14.5 Pricing cross-coupling (inconsistency)

`WeatherRegimeParams.quote_max_multiplier` is embedded in the risk
engine's parameter record but is consumed exclusively by the pricing
engine. This cross-couples risk and pricing calibration and
complicates region-adapter authorship (a region adapter intending to
recalibrate only risk values must still either forward-set or
forward-copy the pricing value). Source comments flag this as
`[Bug 8]`.

A future MAJOR version SHOULD move `quote_max_multiplier` into a
separate `PricingParams` artefact. Until then, implementations MUST
preserve the field on the record.

### §14.6 `r4_nogo_threshold` boundary semantics (normative clarification)

The v2.0 engine uses a strict greater-than comparison:

```
if risk_score > P.r4_nogo_threshold:
    # hard NO-GO
```

Therefore, at the default `r4_nogo_threshold = 92`:

- `risk_score = 91` → R4 CONDITIONAL-D2.
- `risk_score = 92` → R4 CONDITIONAL-D2 (still strict-less-equal to
  92 from the comparison's viewpoint).
- `risk_score = 93` → hard NO-GO.

§7.1 rule 4 is normative; the test vector TV-05 pins the boundary.

### §14.7 W1 base_score drift between guide and code (inconsistency)

The companion guide `LARM_CONCEPT_GUIDE.md` displays `W1 = 10`,
but the v2.0 engine (authoritative) uses `W1 = 9`. The specification
authoritatively cites the engine value of `9` (see §10.2.1 and
Appendix A). The guide is informative and has drifted relative to
v2.0; the guide SHOULD be updated in a follow-up PR.

### §14.8 EDR cumulative min-EDR lookup (normative clarification)

The EDR table lookup of §5.2.7 uses a **cumulative last-wins**
iteration, not a bucket lookup. A naive port that implemented

```
for t in P.edr_thresholds:
    if edr >= t.min_edr:
        return t.adj     # ← WRONG: returns on first match
```

would return `3` for `edr = 0.85`, but the correct answer is `20`
because the table is sorted ascending by `min_edr` and each
subsequent matching row overwrites `adj`. Implementations MUST
preserve the last-wins semantics for bit-compatibility.

### §14.9 Calibration is regional (limitation)

LARM v2.0 is calibrated against subtropical Taiwan conditions.
Other climates (polar, arid, tropical rainforest), other
topographies (extreme mountain, open ocean), and other operation
types (large-scale photogrammetry, BVLOS delivery) may require
recalibration before the model's outputs are meaningful. See
`LEGAL/DISCLAIMER.md` §3 for the authoritative articulation.

### §14.10 Weather-input dependency (limitation)

LARM's output quality is bounded above by the quality of the weather
inputs. Errors, unavailability, or latency in upstream forecast APIs
(Open-Meteo, ECMWF, CWA, JMA) propagate directly to the R-score and
decision. Implementations SHOULD surface upstream data-quality
warnings to operators.

### §14.11 Hard stops are necessary but not sufficient (limitation)

The four §7.1 hard stops are lower bounds on the unsafety surface;
being below a hard stop does not imply safety. The broader R-score
and PIC judgement remain required.

### §14.12 Night-operation coverage (limitation)

Night-operation data points in the calibration corpus are sparse.
The `+5` additive in §5.4 (`ops.time_window == "night"`) is
[heuristic, no empirical source] and may be conservative relative
to well-illuminated infrastructure or overly aggressive relative to
undisclosed airspace-density risks.

### §14.13 High-altitude coverage (limitation)

Sites above 1,500 m elevation are not represented in the calibration
corpus. The §5.3.1 `alt_score` tiering is [heuristic, no empirical source].

### §14.14 `building_floors`/`building_height_m` reconciliation (limitation)

When both `building_floors` and `building_height_m` are provided,
the engine prefers `building_floors` as the authoritative source.
The §3.3.1 derivation `floors = round(height / 3.2)` applies only
when `building_floors` is `null`. If the two fields disagree,
downstream explainers MAY surface the discrepancy but the
normative path uses the explicitly stated floor count.

### §14.15 First-match semantics for the wind score table (limitation)

The wind-score table of §5.2.2 uses **first-match** lookup. If a
region adapter supplies overlapping intervals by mistake, only the
first matching row's score is returned. Implementations SHOULD
validate at parameter-load time that the intervals are disjoint.
The current reference implementation does not enforce this
invariant.

### §14.16 EDR table silent permissiveness (limitation)

If `edr_thresholds` is empty (`[]`), `compute_edr_adj` returns `0`
for every input, effectively disabling the EDR adjustment. The
§7.1 (3) hard stop at `edr > 0.8` still applies because it uses
`P.thresholds.hard_stop.edr_threshold`, not the table. Thus an
empty table silently softens WeatherNow but preserves the safety
ceiling. Region adapters MUST explicitly publish their chosen
`edr_thresholds`; omission has observable semantics.

### §14.17 `thunder_risk = null` semantics (limitation)

A `null` value for `today.thunder_risk` is treated identically to
`0` (no thunder add-on applies). There is no separate signalling
mechanism for "thunder status unknown". A region adapter that
needs to distinguish "unknown" from "absent" MUST wrap the core
with its own pre-processing.

---

## §15 Changelog

### §15.1 v2.0 (this document) — superset of v1.1

This document supersedes the never-published draft `LARM-v1.1.md`.
The behavioural transition from v1.1 to v2.0 is summarised below;
for a line-by-line accounting, see `MODEL_CHANGELOG.md` v2.0 entry.

#### §15.1.1 Added

- **SORA 2.5 GRC integration (§5.3.2).** New
  `population_density_class` input and `sora_mitigations` array
  feed the `ground_consequence` sub-dimension of G_score.
- **EDR turbulence (§5.2.7, §7.1).** New `weather_today.edr` input
  feeds `edr_adj` in `[0, 20]` and triggers a non-overridable hard
  stop at `edr > 0.8`.
- **TKE proxy (§5.3.3).** New `tke_proxy` additive term (0–3) for
  turbulence approximation when explicit EDR is unavailable.
- **Internal grade split (§6.2).** Single `D` grade replaced by
  `D1` (R3) and `D2` (R4-below-threshold).
- **Equipment category schema (§3.5).** Optional `block_category`
  and `warn_category` fields allow downstream explainability.
- **W5 typhoon-trend correction (§4.3).** Adds
  `w5_typhoon_trend_bonus` to Base(W5) when
  `recent_typhoon_count > w5_typhoon_trend_threshold`.
- **R4 split gating (§7.1, §7.2).** R4 band above
  `r4_nogo_threshold` is hard NO-GO; R4 below it is
  CONDITIONAL-D2.
- **Ensemble confidence in buffer ratio (§8.1).** New
  `forecast_confidence` penalty term.
- **W4 afternoon multiplier (§5.2.9).** `local_hour ∈ [14, 18)`
  amplifies WeatherNow for `w_code == "W4"`.

#### §15.1.2 Changed

- **Component ranges recalibrated:**

| Component | v1.1 | v2.0 |
|---|---|---|
| `WeatherNow` | `0..50` | `0..42` |
| `G_score` (née `B_score`) | `0..25` | `0..20` |
| `O_score` | `0..15` | `0..12` |
| `E_score` | `0..10` | `0..8` |

- **WeatherNow weights now sum to 1.00:**
  `wind + rain + instability = 0.55 + 0.35 + 0.10 = 1.00`.
  (v1.1 summed to 1.05.)
- **Buffer ratio upper bound widened:** `0.40` → `0.55`.
- **Buffer score divisor widened:** `250` → `400` (flattens
  buffer growth with R-score).
- **Ensemble penalty raised:** `0.08` → `0.10`.
- **Regime-confidence penalty raised:** `0.04` → `0.05`.
- **Instability scale raised:** `15` → `20` (general) / `28` (W4).
- **W4 time multiplier introduced:** `1.0` → `1.5` (14:00–18:00).
- **W-regime base scores reduced** to make room for the new
  ground-consequence and EDR contributions (see §10.2.1).
- **Ruleset string:** `"larm_v1.1"` → `"larm_v2.0"`.

#### §15.1.3 Deprecated

- `b_score` field on `RiskResult`: alias of `g_score`, retained for
  v1.1 consumers. Scheduled for removal no earlier than v2.2.

#### §15.1.4 Kept (no behaviour change)

- Wind hard stop at 39 km/h.
- Rain hard stop at > 10 mm/h AND > 60% probability.
- W-code classification rules (§4.1).
- R-level band boundaries (§6.1).
- WR-matrix cells for R0/R1/R2 (§7.3).

### §15.2 v1.1 (historical, never published as spec)

The v1.1 engine was an internal production model used inside the
proprietary Next.js application before the open-source decoupling
plan. It is documented here solely for traceability.

Canonical v1.1 formula:

```
R_score = Base(W) + WeatherNow + B_score + O_score + E_score
```

Component upper bounds (v1.1):

| Component | Upper bound |
|---|---:|
| `Base(W)` | 22 (W5) |
| `WeatherNow` | 50 |
| `B_score` | 25 |
| `O_score` | 15 |
| `E_score` | 10 |

Hard stops (v1.1): wind ≥ 39 km/h; rain > 10 mm/h AND probability
> 60%.

No SORA fields, no EDR input, no ensemble penalty, no W5 trend
correction, no W4 time multiplier, no R4 split.

### §15.3 v1.0 (historical)

Pre-v1.1 prototype used during the proprietary-application early
phase. Not externally documented. Retained in the parameter registry
as `v1.0` solely for regression testing.

### §15.4 Upcoming

- **v2.1.** Move to `evaluateRisk(input, { params })` with `params`
  required (no implicit Taiwan defaults). This is a breaking change
  versioned as v2.1.
- **v2.2.** Remove `b_score` alias (deprecated in v2.0).
- **v3.0 (speculative).** Potential reinstatement of the WR-matrix
  R3/R4 cells as the governing decision surface, depending on
  committee resolution of §14.1.

---

## §16 References

### §16.1 Standards and frameworks

- **SORA 2.5 — Specific Operations Risk Assessment**, JARUS
  (Joint Authorities for Rulemaking on Unmanned Systems), 2024.
  Source of the iGRC, M1A/M1B/M1C mitigation semantics adopted in
  §5.3.2.
- **ICAO Doc 10082 — Manual on the Operational Implementation of
  Turbulence Reporting Based on Eddy Dissipation Rate (EDR)**,
  International Civil Aviation Organization, 2019. Source of the
  EDR severity bands referenced in §5.2.7.
- **RFC 2119 — Key words for use in RFCs to Indicate Requirement
  Levels**, S. Bradner, IETF, March 1997.

### §16.2 External data sources

- **Open-Meteo Archive API** — rolling 30-day climate context inputs.
- **ECMWF IFS Ensemble Forecast (via Open-Meteo)** — P10/P50/P90
  wind and precipitation.
- **CWA F-D0047 / O-A0003** — Taiwan Central Weather Administration
  township-level forecast and real-time observation.
- **JMA MSM / GSM** — Japan Meteorological Agency mesoscale and
  global spectral models, consumed for cross-validation.

### §16.3 Related work

- The COCO dataset / cocodataset.org brand-split pattern (cited in
  `OPEN_SOURCE_DECISIONS.md` §7) informed the LARM /
  `@openlarm/` organisational split.
- The FDA "Software as a Medical Device" disclaimer pattern (cited
  in `OPEN_SOURCE_DECISIONS.md` §1) informed the Safety Notice
  wording.

### §16.4 Meteorological references (informative)

- **Beaufort Wind Force Scale.** International scale relating wind
  speed to observed conditions. The `39 km/h` wind hard stop aligns
  with the Beaufort 6/7 boundary (strong breeze / near gale).
- **CWA 豪雨特報標準** (Central Weather Administration heavy-rain
  advisory criteria). The `10 mm/h` rain hard stop is consistent
  with hourly-scaled CWA heavy-rain criteria for northern Taiwan.
- **ECMWF IFS ensemble metadata.** Member agreement fraction is
  exposed via Open-Meteo as an integer percentage; LARM consumes
  this as `forecast_confidence`.

### §16.5 SORA integration references (informative)

- **SORA 2.5 Annex E — M-series Mitigations.** Defines M1A (low
  population density in proximity), M1B (ground-risk buffer),
  M1C (emergency-response plan) and their aggregate effect on the
  iGRC.
- **JARUS Working Group 6.** Harmonisation of operational risk
  assessment for unmanned systems; LARM's §5.3.2 is positioned
  as an adaptation rather than a full SORA implementation.

### §16.6 Reference implementation references (informative)

- `src/lib/engines/risk-engine.ts` — canonical TypeScript engine.
- `src/lib/engines/weather-regime-params.ts` — parameter registry.
- `src/lib/engines/model-helpers.ts` — helpers
  (`inferWCode`, `completionForRL`, `getWRDecision`, `simpleRiskFromW`).
- `src/lib/engines/pricing-engine.ts` — pricing engine (out of core
  spec scope per §13 clause 8 and §14.5).

### §16.7 In-repository cross-references

- `README.md` — project overview and safety notice.
- `LEGAL/DISCLAIMER.md` — authoritative safety notice,
  disclaimer of warranties, limitation of liability.
- `MODEL_CHANGELOG.md` — per-version model changes.
- `CHANGELOG.md` — code-only changes.
- `low-altitude-ops-platform/LARM_CONCEPT_GUIDE.md` — narrative
  explanation of the model (informative).
- `low-altitude-ops-platform/LARM_PARAM_GUIDE.md` — operator-facing
  parameter guide (informative; see §14.1, §14.7 for known drifts).
- `OPEN_SOURCE_TASK_2_PLAN.md` — planning document for this
  specification.
- `OPEN_SOURCE_DECISIONS.md` — the seven governance decisions
  implemented throughout this specification.

---

## Appendix A — Full v2.0 Parameter Values (Taiwan reference calibration)

### A.1 Provenance (informative)

The JSON below is the authoritative v2.0 Taiwan reference
calibration at the time of specification freeze. It is a
serialisation of `WEATHER_REGIME_PARAMS_V2` in
`low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts`.
All constants marked `[heuristic, no empirical source]` throughout
this specification refer to values in this JSON.

### A.2 JSON

```json
{
  "version": "v2.0",
  "units": {
    "wind": "km/h",
    "rain_daily_heavy_threshold_mm": 20
  },
  "regimes": {
    "W0": {
      "name": "穩定高壓晴朗型",
      "base_score": 3,
      "volatility_profile": "stable",
      "instability_weight": 0.8,
      "predictability_weight": -1.0,
      "notes": "Most stable background; typically low rain and low wind."
    },
    "W1": {
      "name": "東北季風型",
      "base_score": 9,
      "volatility_profile": "windy_stable",
      "instability_weight": 1.0,
      "predictability_weight": -0.8,
      "notes": "Sustained winter winds; windward and coastal sites stricter."
    },
    "W2": {
      "name": "鋒面掃過型",
      "base_score": 11,
      "volatility_profile": "moving_rain",
      "instability_weight": 1.1,
      "predictability_weight": -0.6,
      "notes": "Moving rain system with elevated variability."
    },
    "W3": {
      "name": "梅雨滯留型",
      "base_score": 16,
      "volatility_profile": "persistent_rain",
      "instability_weight": 1.2,
      "predictability_weight": -0.3,
      "notes": "Persistent multi-day rain; low operational flexibility."
    },
    "W4": {
      "name": "午後熱對流型",
      "base_score": 15,
      "volatility_profile": "convective",
      "instability_weight": 1.3,
      "predictability_weight": -0.2,
      "notes": "Localised afternoon convection; fast transitions."
    },
    "W5": {
      "name": "颱風外圍環流型",
      "base_score": 20,
      "volatility_profile": "typhoon_outer",
      "instability_weight": 1.4,
      "predictability_weight": 0.0,
      "notes": "High uncertainty under typhoon outer circulation; conservative."
    }
  },
  "region_weight_table": {
    "W0": { "windward": 1.00, "leeward": 0.98, "coastal": 1.00, "rooftop_open": 1.02 },
    "W1": { "windward": 1.10, "leeward": 0.98, "coastal": 1.12, "rooftop_open": 1.08 },
    "W2": { "windward": 1.05, "leeward": 1.00, "coastal": 1.06, "rooftop_open": 1.05 },
    "W3": { "windward": 1.03, "leeward": 1.00, "coastal": 1.02, "rooftop_open": 1.03 },
    "W4": { "windward": 1.04, "leeward": 1.00, "coastal": 1.03, "rooftop_open": 1.05 },
    "W5": { "windward": 1.15, "leeward": 1.05, "coastal": 1.18, "rooftop_open": 1.12 }
  },
  "volatility_buffer_add": {
    "W0": 0.00, "W1": 0.02, "W2": 0.03, "W3": 0.04, "W4": 0.05, "W5": 0.06
  },
  "wr_matrix": {
    "W0": { "R0": "go",   "R1": "go",   "R2": "cond", "R3": "nogo", "R4": "nogo" },
    "W1": { "R0": "cond", "R1": "go",   "R2": "cond", "R3": "cond", "R4": "nogo" },
    "W2": { "R0": "nogo", "R1": "cond", "R2": "cond", "R3": "cond", "R4": "nogo" },
    "W3": { "R0": "nogo", "R1": "nogo", "R2": "cond", "R3": "cond", "R4": "nogo" },
    "W4": { "R0": "nogo", "R1": "cond", "R2": "cond", "R3": "cond", "R4": "nogo" },
    "W5": { "R0": "nogo", "R1": "nogo", "R2": "cond", "R3": "cond", "R4": "nogo" }
  },
  "weather_now_weights": {
    "wind": 0.55,
    "rain": 0.35,
    "instability": 0.10,
    "instability_scale": 20,
    "instability_scale_w4": 28,
    "predictability_discount": 10,
    "thunder_add": 5,
    "ensemble_low_conf_threshold": 55,
    "weather_now_cap": 42,
    "w4_time_multiplier": 1.5
  },
  "buffer_coefficients": {
    "base": 0.05,
    "score_divisor": 400,
    "regime_conf_penalty": 0.05,
    "ensemble_penalty": 0.10,
    "min": 0.05,
    "max": 0.55
  },
  "ui_infer_thresholds": {
    "W5_wind_now_kmh": 28,
    "W5_gust_p90_kmh": 39,
    "W4_rain_prob_pct": 40,
    "W3_rain_days": 15,
    "W3_rain_prob_pct": 60,
    "W2_rain_days": 10,
    "W2_rain_prob_pct": 40,
    "W1_wind_now_kmh": 20,
    "W1_wind_p90_kmh": 28
  },
  "thresholds": {
    "wind_score_table": [
      { "min_kmh": 0,  "max_kmh": 10,  "score": 0  },
      { "min_kmh": 11, "max_kmh": 18,  "score": 10 },
      { "min_kmh": 19, "max_kmh": 25,  "score": 20 },
      { "min_kmh": 26, "max_kmh": 32,  "score": 35 },
      { "min_kmh": 33, "max_kmh": 38,  "score": 55 },
      { "min_kmh": 39, "max_kmh": 999, "score": 80 }
    ],
    "wind_weight_scale": 0.8,
    "rain_score_rules": {
      "rule_0": { "rain_prob_lt_pct": 20, "rain_mmph_lt": 1, "score": 0 },
      "rule_1": { "rain_prob_gte_pct": 20, "rain_prob_lte_pct": 40, "or_mmph_gte": 1, "or_mmph_lte": 3, "score": 10 },
      "rule_2": { "rain_prob_gte_pct": 40, "rain_prob_lte_pct": 60, "or_mmph_gte": 3, "or_mmph_lte": 10, "score": 25 },
      "rule_3": { "rain_prob_gt_pct": 60, "or_mmph_gt": 10, "score": 45 }
    },
    "hard_stop": {
      "wind_kmh": 39,
      "rain_mmph": 10,
      "rain_prob_pct": 60,
      "edr_threshold": 0.8
    },
    "mapping_r_level": [
      { "min": 0,  "max": 20,  "r_level": "R0" },
      { "min": 21, "max": 40,  "r_level": "R1" },
      { "min": 41, "max": 65,  "r_level": "R2" },
      { "min": 66, "max": 85,  "r_level": "R3" },
      { "min": 86, "max": 100, "r_level": "R4" }
    ]
  },
  "edr_thresholds": [
    { "min_edr": 0.1, "adj": 3  },
    { "min_edr": 0.3, "adj": 7  },
    { "min_edr": 0.5, "adj": 12 },
    { "min_edr": 0.8, "adj": 20 }
  ],
  "g_score_config": {
    "structural_cap": 10,
    "ground_consequence_cap": 6,
    "tke_proxy_cap": 3,
    "env_interaction_cap": 4,
    "env_hazards_cap": 3,
    "env_hazard_points": {
      "near_hv_power": 3,
      "near_base_station": 1,
      "narrow_clearance": 2
    },
    "total_cap": 20
  },
  "e_score_config": {
    "cap": 8,
    "block_points": 3,
    "warn_points": 1.5
  },
  "o_score_cap": 12,
  "o_score_flag_points": {
    "night": 5,
    "weekend": 2,
    "road_closure": 3,
    "urgent_critical": 5,
    "urgent_warn": 3,
    "urgent_critical_max_days": 3,
    "urgent_warn_max_days": 7,
    "crowd_high": 3,
    "crowd_medium": 2,
    "operator_junior": 2,
    "operator_mid": 0,
    "operator_senior": 0,
    "long_mission_critical": 3,
    "long_mission_warn": 2,
    "long_mission_critical_min_days": 7,
    "long_mission_warn_min_days": 4
  },
  "quote_max_multiplier": 4.5,
  "w5_typhoon_trend_threshold": 3.6,
  "w5_typhoon_trend_bonus": 2,
  "r4_nogo_threshold": 92,
  "pricing": {
    "__comment": "Out of scope for LARM core conformance; see §10.2.4 and §14.5. The embedded pricing record mirrors PRICING_PARAMS_DEFAULT at the time of specification freeze."
  }
}
```

### A.3 Derivation notes (informative)

The following values are flagged `[heuristic, no empirical source]`
in the main specification and collectively form the calibration
surface that region adapters are most likely to tune:

- `wind_score_table` (all six rows) — §5.2.2.
- `rain_score_rules` (all thresholds and scores) — §5.2.3.
- `region_weight_table` (all 24 entries) — §5.2.8.
- `volatility_buffer_add` (all six entries) — §8.3.
- `w5_typhoon_trend_threshold = 3.6` — §4.3.
- `w5_typhoon_trend_bonus = 2` — §4.3.
- `w4_time_multiplier = 1.5` — §5.2.9.
- `completion` base array `[97, 82, 60, 35, 10]` and `-3% per W-level`
  slope — §9.1.
- `e_score_config.block_points = 3`, `warn_points = 1.5`, `cap = 8` —
  §5.5.
- G_score structural sub-scores: `height_score` steps `{0, 3, 6, 8}`,
  `alt_score` steps `{0, 1, 3, 5}`, `complexity_score` steps
  `{2, 4, 6}` — §5.3.1.
- G_score ground-consequence mapping: assembly=6, high_urban=4,
  residential=2, light=1, isolated=0 — §5.3.2.
- G_score TKE proxy factors: `floor_factor ∈ {0.5, 1.0, 1.2, 0.8}`,
  `corridor_factor ∈ {1.0, 1.4}` — §5.3.3.
- G_score environment-interaction point values: HV=+3, base
  station=+1, narrow clearance=+2, high×corridor=+2,
  mountain×narrow=+2 — §5.3.4.
- O_score point values: night=+5, weekend=+2, road-closure=+3,
  urgent≤3d=+5, urgent 4–7d=+3, high crowd=+3, medium crowd=+2,
  junior=+2, fatigue ≥7d=+3, fatigue 4–6d=+2 — §5.4.
- Buffer-coefficient values `base=0.05`, `score_divisor=400`,
  `regime_conf_penalty=0.05`, `ensemble_penalty=0.10`, `min=0.05`,
  `max=0.55` — §8.2.

### A.4 Non-heuristic values (informative)

The following values have external derivations:

- Wind hard stop at 39 km/h — aligned with Beaufort 7/8 boundary.
- Rain hard stop at 10 mm/h — aligned with CWA "heavy rain"
  threshold scaling to hourly rate.
- EDR threshold at 0.8 — aligned with ICAO Doc 10082 severity
  band for "severe" turbulence at light-aircraft weight class.
- SORA iGRC base mapping shape — aligned with JARUS SORA 2.5
  iGRC tabulation (integer values within that shape are heuristic).

All other values in the parameter record SHOULD be assumed heuristic
unless a specific citation is provided by a region adapter in its
`calibration.md`.

---

## Appendix B — Reference Implementation Pointer

### B.1 Canonical reference

The canonical TypeScript reference implementation of LARM v2.0 is
the `evaluateRisk` function at
`low-altitude-ops-platform/frontend/src/lib/engines/risk-engine.ts`
in the `openlarm/core` repository (planned; currently in this
monorepo).

The commit hash at which this specification was frozen MUST be
published alongside the specification in the release notes.

- Specification-frozen commit: `<TBD at release>`
- Release: `v2.0.0`
- Repository: `https://github.com/openlarm/core` (planned)

### B.2 Reference region adapter

The canonical Taiwan region adapter MUST ship in the package
`@openlarm/regions-taiwan` and export the full
`WeatherRegimeParams` record of Appendix A.2 as the exported
constant `TAIWAN_PARAMS_V2_0`.

- Region-adapter-frozen commit: `<TBD at release>`
- Release: `taiwan-v2.0-r0`
- Package: `@openlarm/regions-taiwan` (planned)

### B.3 Conformance verification

A reference verifier is published at
`spec/test-vectors/v2.0/README.md` (index) and
`spec/test-vectors/v2.0/*.json` (fixtures). Implementations claiming
Level-3 conformance MUST publish the commit hash of the verifier
that produced their test results.

- Verifier-frozen commit: `<TBD at release>`

### B.4 Future reference implementations

Additional reference implementations in other languages (Python,
Rust) are expected to appear in the `openlarm` organisation; each
MUST declare its conformance level (§1.1) and cite the
specification commit hash against which it was verified.

---

*End of LARM v2.0 Specification.*
