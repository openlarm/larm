# program.md — openlarm autoresearch loop

You are an autonomous research agent calibrating LARM v2.0 parameters.
Your job: improve `metric_score` from `autoresearch/evaluate.mjs` while
keeping conformance and invariants green.

## File permissions

| File | You may edit? | Notes |
|------|---------------|-------|
| `packages/regions-taiwan/src/v2.ts`     | **YES — only this** | calibration knobs |
| `packages/core/src/**`                   | **NO**              | engine; spec-bound |
| `packages/regions-taiwan/src/v1.ts`      | NO                  | back-compat |
| `packages/regions-taiwan/src/index.ts`   | NO                  | registration |
| `spec/**`                                | NO                  | normative |
| `spec/test-vectors/v2.0/**`              | NO                  | conformance set |
| `autoresearch/**` (incl. this file, calibration/, invariants.mts, evaluate.mjs) | NO | the loop itself |
| `autoresearch/results.jsonl`             | append-only         | experiment log |

If you touch any other file, the experiment is invalid. Run
`git status` before each `evaluate.mjs` call. If anything besides
`packages/regions-taiwan/src/v2.ts` and `autoresearch/results.jsonl`
shows, run `git checkout -- <file>` to clean it up.

## Loop

1. `git status` — confirm clean working tree.
2. Read the last 10 lines of `autoresearch/results.jsonl`. Avoid
   repeating a hypothesis that already lost.
3. Pick **exactly one** focused hypothesis. One mechanism, one direction,
   small diff. Examples:
   - "raise `weather_now_weights.wind` 0.55 → 0.58, drop rain 0.35 → 0.32"
   - "tighten `wind_score_table` row 4 (33–38 km/h) score from 55 → 60"
   - "raise `r4_nogo_threshold` 92 → 94"
   - "increase `edr_thresholds[3].adj` from 20 → 24"
   - "lower `buffer_coefficients.score_divisor` 400 → 350"
4. Edit `packages/regions-taiwan/src/v2.ts`. Keep the diff small —
   ideally < 5 changed lines.
5. Run `node autoresearch/evaluate.mjs --json` and parse the output.
6. Decision rule:
   - `conformance.passed === false` → **revert** (`git checkout packages/regions-taiwan/src/v2.ts`)
   - `invariants_passed === false` → **revert**
   - `metric_score` not strictly greater than current best → **revert**
   - Otherwise → **keep**.
7. Append one line to `autoresearch/results.jsonl`:
   ```json
   {"ts":"2026-05-04T03:30:00Z","hypothesis":"...",
    "conformance_passed":true,"invariants_passed":true,
    "metric_score":0.823,"prev_best":0.811,"kept":true,
    "diff_summary":"weather_now_weights.wind 0.55→0.58, .rain 0.35→0.32"}
   ```
8. Repeat.

## Hypothesis seed list

Pick from these when you have nothing better. Don't repeat a losing
hypothesis. Don't pick the same category for >3 consecutive iterations.

**Component weights** (must keep `weather_now_weights` sum ≈ 1.0):
- adjust `weather_now_weights.wind` / `.rain` / `.instability`
- adjust `weather_now_weights.instability_scale` / `.instability_scale_w4`
- adjust `weather_now_weights.predictability_discount`

**Wind / rain scoring tables**:
- shift `wind_score_table` row scores (keep monotonic)
- shift `wind_score_table` row breakpoints (keep contiguous, no gaps)
- adjust `rain_score_rules.rule_*.score`

**EDR turbulence (v2.0 specific)**:
- adjust `edr_thresholds[*].adj` values (keep monotonic in `min_edr`)
- adjust `edr_thresholds[*].min_edr` (keep ascending, top entry `< 0.8`)

**Hard stops** (very narrow band, ask before drastic moves):
- `thresholds.hard_stop.wind_kmh` (only ±2 from 39)
- `thresholds.hard_stop.rain_mmph` (only ±2 from 10)
- `thresholds.hard_stop.edr_threshold` (only ±0.05 from 0.8)
- **never** raise `wind_kmh` above 41 or `edr_threshold` above 0.85

**Decision boundaries**:
- `mapping_r_level` thresholds (must stay contiguous, non-overlapping)
- `r4_nogo_threshold` (sane range 88–96)
- `wr_matrix[Wn][Rk]` cells (see forbidden list below)

**Buffer ratio**:
- `buffer_coefficients.base` / `.score_divisor`
- `buffer_coefficients.regime_conf_penalty` / `.ensemble_penalty`
- `buffer_coefficients.min` / `.max` (must keep min < max, max ≤ 0.6)

**G/O/E score caps**:
- `g_score_config.*_cap` (must keep sum ≤ `total_cap`)
- `e_score_config.block_points` / `.warn_points`
- `o_score_cap`

## Forbidden moves

- Setting `wr_matrix.W1.R0 = "nogo"` (historical bug regression).
- Removing or weakening any `thresholds.hard_stop.*` value below
  the safety floor: `wind_kmh < 35`, `edr_threshold < 0.7`,
  `rain_mmph < 8`.
- Setting any `weather_now_weights.{wind,rain,instability}` outside [0, 1].
- Letting `weather_now_weights.{wind+rain+instability}` drift > 0.02 from 1.0.
- Making `wind_score_table` non-monotonic.
- Reordering `mapping_r_level` so categories overlap or have gaps.
- Editing this file, `evaluate.mjs`, `invariants.mts`,
  `calibration/cases.json`, or anything in `packages/core/` or `spec/`.
- Catching exceptions or returning early to mask failures.

## Hard limits per iteration

- One hypothesis per experiment.
- Max ~10 lines of net change to `v2.ts`.
- If `metric_score` plateaus for 5 consecutive experiments, switch
  category (stop tweaking weights, try EDR, etc.).
- If 10 consecutive experiments all revert, stop and write a
  one-paragraph summary to `autoresearch/results.jsonl` with
  `"stop_reason": "no_progress"` and exit.

## Logging hint

Print one line to stdout per experiment:
- Kept:  `KEEP <hypothesis> -> metric +0.012 (now 0.835)`
- Drop:  `DROP <hypothesis> -> metric -0.003`
- Inv:   `DROP <hypothesis> -> invariant: weights_sum_to_one`
- Conf:  `DROP <hypothesis> -> conformance: TV-v2.0-005 failed`
