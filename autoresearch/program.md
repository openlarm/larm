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

**Round 2 priorities** (round 1 over-indexed on R-level boundary moves
which are now invariant-locked; metric ceiling found via boundary
gaming was 0.9286). New high-leverage knobs to try first:

**Tier 1 — try these BEFORE any other category** (these are the knobs
the loop was designed to optimize):

- adjust `weather_now_weights.wind` / `.rain` / `.instability`
  (must keep sum ≈ 1.0)
- adjust `weather_now_weights.instability_scale` (default 20) and
  `.instability_scale_w4` (default 28)
- adjust `weather_now_weights.predictability_discount` (default 10)
- adjust `weather_now_weights.thunder_add` (default 5) — directly
  addresses thunderstorm cases
- adjust individual rows of `wind_score_table` scores (keep monotonic)
- adjust `rain_score_rules.rule_*.score`

**Tier 2 — turbulence and EDR**:

- adjust `edr_thresholds[*].adj` (penalty per EDR band)
- adjust `edr_thresholds[*].min_edr` boundaries (keep ascending)

**Tier 3 — regime base scores and region weights**:

- adjust `regimes.W*.base_score` (must keep W0 ≤ W1..W4 ≤ W5)
- adjust `regimes.W*.instability_weight` / `.predictability_weight`
- adjust `region_weight_table` cells (windward / coastal multipliers)
- adjust `volatility_buffer_add` per regime
- adjust `w5_typhoon_trend_threshold` / `w5_typhoon_trend_bonus`

**Tier 4 — WR matrix surgery (ONE cell at a time, justify each move)**:

- `wr_matrix.W2.*` / `wr_matrix.W3.*` / `wr_matrix.W4.*` cells
  (subject to invariants: W0 low-risk cells locked, W1.R0 locked,
  monotonic-in-R locked)
- iGRC / ground-consequence overrides (if agent wants stricter
  decisions for crowded sites under specific regimes)

**Tier 5 — buffer ratio and component caps** (low priority, do last):

- `buffer_coefficients.*`
- `g_score_config.*_cap` (must keep sub-caps sum ≤ total_cap)
- `e_score_config.block_points` / `.warn_points`
- `o_score_cap`

## EXPLICITLY FORBIDDEN as hypothesis (round 2)

These were tried in round 1 and either failed conformance, broke
invariants, or hit the ceiling without representing real model
improvement:

- **Editing `mapping_r_level` boundaries** — invariant-locked to canonical
  spec values (R0:0–20, R1:21–40, R2:41–65, R3:66–85, R4:86–100). Don't
  even try; it will revert.
- **Setting `wr_matrix.W0.R0/R1/R2 = "nogo"`** — invariant-locked.
  Stable clear weather can never be a blanket nogo at low/medium risk.
- **Making `wr_matrix` non-monotonic in R-level** — invariant-locked.
- **Reordering `regimes.W*.base_score`** — invariant-locked. W0 must
  remain lowest, W5 must remain highest.
- **Weakening any `thresholds.hard_stop.*` value** below the safety floor
  (`wind_kmh < 35`, `edr_threshold < 0.7`, `rain_mmph < 8`,
  `rain_prob_pct < 50`).
- **Touching `wr_matrix.W1.R0`** (v1.1 Bug 3 territory).

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
