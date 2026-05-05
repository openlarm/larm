# Round-2 patch for autoresearch

Three files updated to close the loopholes the round-1 agent found:

| File | What changed |
|------|--------------|
| `autoresearch/invariants.mts` | +6 new locks. Total: 19 → 25 invariants. |
| `autoresearch/program.md` | New tier-ranked hypothesis seed list; explicit forbidden-as-hypothesis list. |
| `autoresearch/calibration/cases.json` | 8 → 28 cases. Adds W3/W4/W5 regime cases, EDR boundary, equipment block/warn, operational context, low-forecast-confidence, climate trend. |

## How to apply

From the `openlarm/larm` repo root:

```bash
# back up your round-1 results first
cp autoresearch/results.jsonl autoresearch/results.round1.jsonl

# revert the round-1 v2.ts (those changes had structural problems)
git checkout main -- packages/regions-taiwan/src/v2.ts

# apply this patch
unzip ~/Downloads/openlarm-autoresearch-round2.zip

# clear results log for the new run
echo '' > autoresearch/results.jsonl

# verify baseline
node autoresearch/evaluate.mjs
```

You should see something like:

```
build             : PASS
conformance       : PASS
invariants_passed : true (25/25)
metric_score      : 0.5076   ← new baseline on 28 cases
worst_miss        : CAL-015-edr-just-below-hard-stop (pred GO/R1, exp NO_GO/R3)
elapsed_sec       : ~11s
```

## What's new in invariants.mts

1. **`mapping_r_level_canonical_spec_boundaries`** — locks R-level boundaries to canonical spec values (R0:0–20, R1:21–40, R2:41–65, R3:66–85, R4:86–100). This blocks the cheapest round-1 metric hack.

2. **`wr_matrix_w0_low_risk_not_nogo`** — W0 (stable clear weather) R0/R1/R2 cells must not be `nogo`. Blocks round-1 exp 14 hack.

3. **`wr_matrix_r4_always_nogo`** — every regime row must end in `nogo` at R4.

4. **`wr_matrix_no_go_above_r1`** — `"go"` decisions can only appear at R0/R1, never R2/R3/R4.

5. **`regime_base_score_ordering`** — W0 must be lowest, W5 highest. Stops the agent from re-ordering regime severities to redirect cases through different W-rows.

6. **`rain_hard_stop_thresholds_meaningful`** — keeps rain hard-stop thresholds within bands defensible against thunderstorm cases.

## What's new in program.md

The hypothesis seed list is now **5-tiered** with explicit ordering:

- **Tier 1** (try first): `weather_now_weights`, `wind_score_table` row scores, `rain_score_rules` — the actual sensitivity knobs the loop was designed for
- **Tier 2**: EDR thresholds and adjustments
- **Tier 3**: regime base scores, `region_weight_table`, `volatility_buffer_add`
- **Tier 4**: `wr_matrix` cells (one at a time, with justification)
- **Tier 5**: buffer ratios, component caps

The `## EXPLICITLY FORBIDDEN as hypothesis` section now names every round-1
metric hack pattern with the exact invariant that catches it. Agent will
stop trying these on iteration 1 instead of grinding through 5–6
revert cycles per pattern.

## What's new in cases.json

20 new cases covering gaps I noticed in round 1:

| ID | Tests |
|----|-------|
| CAL-009 | W3 meiyu regime with a clear-window operational decision |
| CAL-010 | W4 climate but morning mission — temporal awareness |
| CAL-011 | Light rain at low probability — should stay GO |
| CAL-012 | Rain rate 11mm/h at 40% prob — must NOT trigger conjunction hard stop |
| CAL-013 | Coastal windward exposure under NE monsoon |
| CAL-014 | EDR=0.45 borderline turbulence |
| CAL-015 | EDR=0.78 just-below hard stop (current worst_miss) |
| CAL-016 | Wind 38 km/h just below 39 hard stop |
| CAL-017 | Equipment block status |
| CAL-018 | Two equipment items in warn |
| CAL-019 | Tight clearance, small building |
| CAL-020 | Multi-day split mission |
| CAL-021 | Weekend + crowded area + road closure |
| CAL-022 | Near 5G base station |
| CAL-023 | W5 with high recent_typhoon_count |
| CAL-024 | w_override regime (manual W4 forcing) |
| CAL-025 | Low forecast confidence — buffer_ratio test |
| CAL-026 | Poor rooftop condition |
| CAL-027 | W0 climate + sudden high wind today |
| CAL-028 | Urgent deadline pressure |

Note CAL-015 and CAL-006: round-1 agent identified these as structurally
unfixable by params (engine caps and hardcoded R3-CONDITIONAL behavior).
With the new invariants in place, if these stay as worst_miss after
round 2, that's evidence to take them to the **engine** (Code TSC review)
rather than try more parameter tweaks.

## Restart prompt for the agent

```
Read autoresearch/program.md (round 2). The R-level boundary lock is
new — do not waste experiments trying to move them. Focus on Tier 1
hypotheses (weather_now_weights, wind/rain score tables) first. Run
30 experiments. Append to autoresearch/results.jsonl. Revert any
change that fails build, conformance, invariants, or doesn't strictly
improve metric_score.
```

If the agent runs into a metric ceiling around 0.7–0.8 and the
worst_miss stays on CAL-006 / CAL-015 / R3-hardcoded cases, **stop the
loop** and write up findings — those are engine-level concerns that
need human Code TSC review per `OPEN_SOURCE_DECISIONS.md`, not more
calibration iterations.
