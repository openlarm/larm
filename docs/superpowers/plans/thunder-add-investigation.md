# `thunder_add` — Investigation Memo

> Triggered by round-2 autoresearch: `thunder_add 5 → 10` produced
> zero metric delta on CAL-004 (and on every other case). This memo
> traces the parameter through declaration, engine read sites, and
> the metric pipeline to determine its functional status.
>
> Author: round-3 follow-up agent, 2026-05-05. Reference:
> `autoresearch/results.jsonl` line 4 and line 21 (the two
> 5→10 experiments).

## TL;DR

**Verdict (d): working as intended.** `thunder_add` is alive — declared
in the param schema, read by the engine, summed into `weather_now`,
and propagated to `risk_score`. The round-2 observation is also
correct: `5 → 10` produces no metric movement. The two facts are
consistent because the +5 increment is too small to flip CAL-004 (the
only case with `thunder_risk = 1`) across the R2→R3 boundary, and
CAL-004's metric weight is too small for a flip to register strongly
even if it occurred. Recommended next action: document the knob as
low-leverage and require larger jumps in future hypotheses.

## What we looked for

Per spec §5.2.6 (normative):

```
thunder = P.weather_now_weights.thunder_add  if today.thunder_risk == 1 else 0
```

Then aggregated in §5.2.10:

```
raw = wts.wind*wind_comp + wts.rain*rain_score + wts.instability*inst_comp
    + pred_disc + thunder + edr_adj
weather_now = round1(clamp(raw * region_weight * time_mult,
                           0, wts.weather_now_cap))
```

So a working `thunder_add` should: increase `weather_now` by exactly
`thunder_add * region_weight * time_mult` whenever `thunder_risk == 1`,
subject to `weather_now_cap`. Whether a 5-point increase moves
`risk_score` enough to cross an R-level boundary depends on where the
case sits relative to the boundaries.

## Findings

### Declarations

- `packages/core/src/params/schema.ts:46` — `thunder_add: number  // default 5`
- `spec/LARM-v2.0.md` §5.2.6 line 716–722 — normative pseudo-code +
  Taiwan reference value `5` flagged `[heuristic, no empirical source]`
- `spec/LARM-v2.0.md` Appendix A.2 line 2846 — `"thunder_add": 5` in
  the canonical Taiwan params JSON

### Engine reads

- `packages/core/src/engines/risk-engine.ts:142` — `today.thunder_risk
  === 1 ? wts.thunder_add : 0`
- `packages/core/src/engines/risk-engine.ts:148-149` — added into the
  `raw` aggregation
- `packages/core/src/engines/risk-engine.ts:163` — `raw` clamped to
  `weather_now_cap = 42`
- `packages/core/src/engines/risk-engine.ts:173` — explanation entry
  emitted when `thunder > 0`

The parameter is read in exactly one place, and that read site does
contribute to the final `risk_score` via `weather_now`. There is no
shadowed code path or short-circuit between the read and the
aggregation.

### Region adapters

- `packages/regions-taiwan/src/v2.ts:42` — `thunder_add: 5`
- `packages/regions-taiwan/src/v1.ts:38` — `thunder_add: 5`

### Test/fixture mentions

- `autoresearch/calibration/cases.json` — only **CAL-004** has
  `thunder_risk: 1`. All other 27 cases have `thunder_risk: 0`. So
  any `thunder_add` change can only move metric via CAL-004.
- No spec test vector exercises `thunder_risk = 1` directly. (TV-012
  is being added in a parallel task and does not touch thunder.)

## Tracing CAL-004

CAL-004 inputs:
- `weather_30d`: wind_p90=22, gust_p90=28, rain_days_30=12,
  heavy_rain_days_30=3, instability=0.85, predictability=0.4
- `weather_today`: wind_now=12, gust_now=20, rain_prob=70%,
  rain_mmph=6, **thunder_risk=1**, forecast_confidence=55
- `building`: 12F / 42m / moderate / clearance=3, no env hazards
- expected: `decision=COND, r_level=R3`, weight=2.0

Walking the engine (`risk-engine.ts:53-81`, classifier):

- W5: 22 < 39 and 28 < 50 → no
- W3: 12 < 15 → no
- W4: 0.85 ≥ 0.70 and heavy_rain_days_30=3 ≥ 2 → **yes**
- W2: 12 in [8,14] and 0.4 < 0.55 → yes
- → primary **W4**, secondary W2, confidence 0.78

`base_w = 15` (W4).

`computeWeatherNow` with W4 and `thunder_add = 5`:
- wind_score (11–18) = 10; wind_comp = min(50, 10×0.8) = 8
- rain_score: prob=70 > 60 → rule_3 = 45
- inst_scale (W4) = 28; inst_comp = 0.85 × 28 = 23.8
- pred_disc = -0.4 × 6 = -2.4 (Taiwan
  `predictability_discount = 6`, not 10)
- **thunder = 5**
- edr_adj = 0 (no edr)
- raw = 0.55×8 + 0.35×45 + 0.10×23.8 + (-2.4) + **5** + 0
      = 4.4 + 15.75 + 2.38 - 2.4 + 5
      = **25.13**
- region_weight = 1.0 (no exposure), time_mult = 1.0 (no
  local_hour)
- weather_now = round1(clamp(25.13, 0, 42)) = **25.1**

`computeGScore` (no env hazards): structural=7, ground=2, tke=1,
env=0, env_interaction=0 → g_score = **10**.

`o_score = 0`, `e_score = 0`.

`risk_score = round(15 + 25.1 + 10 + 0 + 0)` = **50** → R-level
mapping (41–65) → **R2**. `wr_matrix.W4.R2 = "cond"` → COND-A. The
R3 short-circuit at `risk-engine.ts:378-382` does not fire because
`risk_level !== "R3"`.

Predicted: COND/R2. Expected: COND/R3.

`caseLoss` (calibration-runner.mts:61-95):
- `r_level_distance = |2 - 3| / 4 = 0.25`
- `decision_cost = COND|COND = 0`
- weight = 2.0 → contribution = 2.0 × (0.5 × 0.25 + 0) = **0.25**

### What happens with `thunder_add = 10`

Only the thunder term changes: 5 → 10.
- raw goes from 25.13 to 30.13 (+5)
- weather_now = 30.1 (still well under cap 42)
- risk_score = 15 + 30.1 + 10 = 55.1 → 55 → still R2

R-level unchanged → loss unchanged → metric unchanged. **This is
exactly what `results.jsonl` lines 4 and 21 reported.** The
parameter change DID flow through to `risk_score` (the engine emits
`risk_score = 55` instead of `50`), but `risk_score` is not directly
visible in the metric — only `r_level` and `decision` are.

### What would be needed to move the metric

To flip CAL-004 from R2 to R3, `risk_score` must reach 66. From
baseline 50, that's +16. Sources of +16:

| Source | Available headroom |
|---|---|
| weather_now via thunder | weather_now_cap=42 caps total at +16.9 from current 25.1 — exactly the available headroom |
| g_score | already 10/20; could grow by raising structural/env caps but env hazards are zero on CAL-004 |
| base_w | locked by regime classifier |
| o/e_score | zero, but no operational/equipment input on CAL-004 |

The cleanest path is via `thunder_add`. To reach
`weather_now ≈ 41`, raw must reach ~41, i.e. thunder must contribute
~21 (current 5 → ~21 = +16 incremental, exactly the boundary jump
needed). So `thunder_add ≈ 21–25` flips CAL-004.

Even after the flip, the metric improvement is small. CAL-004's
weighted loss contribution drops by ~0.25 (from 0.25 to ~0). Total
weight across 28 cases is ~40, so the improvement is **0.25 / 40 ≈
0.006 in metric_score**. The round-2 baseline is 0.7956; flipping
CAL-004 alone moves it to ~0.802. Detectable but small.

## Verdict

**(d) Working as intended.** `thunder_add` reads, aggregates, and
contributes to the final score exactly as spec §5.2.6 prescribes.
The round-2 observation that "5→10 produces zero metric delta"
reflects two leverage limitations rather than a parameter defect:

1. **Boundary distance.** CAL-004 is at risk_score=50; the
   R2→R3 boundary is at 66. A +5 shift moves to 55 — still R2. The
   metric only sees R-level, not raw score, so the contribution is
   invisible.
2. **Case weight.** CAL-004's weight (2.0) is small relative to the
   total weight of all cases (~40). Even a successful R-level flip
   only adds ~0.006 to metric_score, well within run-to-run noise of
   round-2 hypothesis logs.

This is not a bug. It is the autoresearch loop correctly reporting
that `thunder_add` is a low-leverage knob given the current case
distribution.

## Recommended next action

Document the knob as low-leverage and require larger jumps in future
hypotheses. Specifically:

- In a future round-3 update to `autoresearch/program.md`'s Tier-1
  hint list (line ~67-68), expand the `thunder_add` bullet to read:
  *"adjust `weather_now_weights.thunder_add` (default 5) — note this
  only affects CAL-004; to move the metric the value must rise high
  enough to flip CAL-004's R-level (~+16 risk_score), constrained
  above by `weather_now_cap=42`."*
- No engine, params, spec, or test changes are required from this
  investigation alone.

If future calibration cases add more `thunder_risk = 1` inputs
(e.g. summer afternoon convection with varying intensity), the
parameter's leverage will rise organically without any code change.

## References

### Code

- `packages/core/src/params/schema.ts:46` — declaration
- `packages/core/src/engines/risk-engine.ts:142, 148-149, 163, 173`
  — read sites
- `packages/regions-taiwan/src/v2.ts:42` — Taiwan v2 default
- `packages/regions-taiwan/src/v1.ts:38` — Taiwan v1 default

### Spec

- `spec/LARM-v2.0.md` §5.2.6 (Thunder add-on, normative)
- `spec/LARM-v2.0.md` §5.2.10 (Aggregation and clamp, normative)
- `spec/LARM-v2.0.md` Appendix A.2 (canonical JSON)

### Calibration / autoresearch

- `autoresearch/calibration/cases.json` — only CAL-004
  (lines 39–48) has `thunder_risk: 1`
- `autoresearch/results.jsonl` — line 4 (n=3, "raise thunder_add 5 → 10",
  metric 0.6634, kept=false), line 21 (n=20, "thunder_add 5 → 10",
  metric 0.7887, kept=false)
- `autoresearch/results.round1.jsonl` lines 5–6 — round-1's
  `5 → 8` attempt with the same null result and the same
  underlying cause
- `autoresearch/program.md:67-68` — current Tier-1 hint mentioning
  `thunder_add`
- `autoresearch/calibration-runner.mts:61-95` — `caseLoss()`
  showing the metric only consumes `r_level` and `decision`
