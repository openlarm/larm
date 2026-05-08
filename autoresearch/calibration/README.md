# calibration cases

Continuous-quality calibration cases for the autoresearch metric.

These are **different** from `spec/test-vectors/v2.0/`. Those are
conformance vectors — pass/fail with categorical expectations,
normative under `spec/LARM-v2.0.md`. They define correctness of any
LARM v2.0 implementation and **must always pass**.

These cases instead provide a **smooth gradient** for the agent to
optimize against. They have continuous-quality expected outputs:
which R-level we expect, which decision we expect, and (optionally)
the buffer-ratio range we expect.

## Schema

```jsonc
{
  "cases": [
    {
      "id": "CAL-XXX-snake-case-name",
      "description": "one-sentence human note",
      "weight": 1.5,                      // optional, default 1.0
      "input": {                          // matches LARMInput from @openlarm/core
        "weather_30d":         { ... },   // Weather30dInput
        "weather_today":       { ... },   // WeatherTodayInput
        "building_site":       { ... },   // BuildingSiteInput
        "operational_context": null|{...},
        "equipment":           null|{...}
      },
      "expected": {
        "decision":            "GO"|"COND"|"NO_GO",   // optional but recommended
        "r_level":             "R0"|"R1"|"R2"|"R3"|"R4",   // optional but recommended
        "buffer_ratio_range":  [low, high]            // optional, e.g. [0.10, 0.20]
      }
    }
  ]
}
```

The `decision` bucket merges all the granular `COND_A / COND_C / COND_D1 / COND_D2`
tiers into a single `COND`. Granular tier accuracy is intentionally not part of
the metric — let the agent optimize the binary go/cond/nogo first.

## How to add cases

1. **Real missions**: every completed GDS mission becomes a candidate
   case. Capture the actual environmental inputs from the dispatch
   record, then label what R-level / decision was *correct in
   hindsight* (not necessarily what LARM said at the time).
2. **Edge cases**: when reviewing LARM_PARAM_GUIDE or the spec, every
   mentioned boundary (e.g. "wind 33 km/h", "EDR 0.5", "W3 at R2")
   should have at least one case.
3. **Counter-examples**: if a mission was unsafe but LARM said GO, or
   if LARM blocked a clearly safe mission, those are the highest-value
   cases to add — give them `weight: 2.0+`.

## Weight guidance

| weight | meaning |
|--------|---------|
| 0.5    | nice-to-have, low business impact |
| 1.0    | normal case |
| 1.5    | important, frequent operating regime |
| 2.0    | safety-critical edge case |
| 3.0    | hard-stop boundary; the metric should heavily punish misses |

## Until you have ≥ 50 cases

The metric is noisy and the agent will tend to overfit. Don't trust
small (< 0.01) `metric_score` improvements. Treat the first ~20
agent runs as a way to *stress-test invariants*, not as actual
calibration progress.
