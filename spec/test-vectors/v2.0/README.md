# LARM v2.0 Conformance Test Vectors

Machine-readable test-vector fixtures derived from the v2.0 golden
tests at
`low-altitude-ops-platform/frontend/src/lib/engines/__tests__/risk-engine.golden.test.ts`.
Each fixture pins down a single observable invariant of `evaluateRisk()`
so that alternative implementations (e.g. the forthcoming
`@openlarm/core` package) can be verified against the same corpus.

A Level-3 conforming implementation (see `spec/LARM-v2.0.md` §1.1)
MUST pass every fixture below within the numerical tolerance of §1.2
(absolute tolerance `1e-2`, i.e. `< 0.01`). Categorical fields
(`decision`, `w_code`, `risk_level`, `internal_grade`,
`conditional_tier`, `requires_approval`, `ruleset_version`,
`versions.*`) are compared bit-equal.

## Fixture index

| ID             | File                                                        | Spec §    | Surface covered |
|----------------|-------------------------------------------------------------|-----------|-----------------|
| TV-v2.0-001    | `TV-v2.0-001-benign-baseline-go.json`                       | §6.1, §7.2 | Benign inputs produce GO at R0/R1, W0 with full confidence. |
| TV-v2.0-002    | `TV-v2.0-002-hard-stop-wind-39-kmh.json`                    | §7.1      | Wind at the 39 km/h threshold (equality) forces NO_GO, no conditional tier, no approval path. |
| TV-v2.0-003    | `TV-v2.0-003-hard-stop-rain-rate-and-probability.json`      | §7.1      | Rain > 10 mm/h AND probability > 60% forces NO_GO. |
| TV-v2.0-004    | `TV-v2.0-004-rain-rate-without-high-probability.json`       | §7.1      | Rain > 10 mm/h with probability ≤ 60% must NOT cite the conjunction hard stop (boundary). |
| TV-v2.0-005    | `TV-v2.0-005-hard-stop-edr.json`                            | §7.1      | v2.0 turbulence hard stop: EDR > 0.8 forces NO_GO and names EDR in controls. |
| TV-v2.0-006    | `TV-v2.0-006-w-override-respected.json`                     | §4.3      | `w_override` propagates verbatim; regime_confidence = 1; secondary_w = null. |
| TV-v2.0-007    | `TV-v2.0-007-climate-driven-w5.json`                        | §4.1      | `wind_p90_kmh ≥ 39` on the 30-day window classifies W5; base_w ≥ 15 (W5 nominal). |
| TV-v2.0-008    | `TV-v2.0-008-output-bounds-stressful-legal-input.json`      | §6.1, §9  | Invariant: risk_score ∈ [0, 100] and buffer_ratio ∈ [0.05, 0.55] under stressful (non-hard-stop) input. |
| TV-v2.0-009    | `TV-v2.0-009-b-score-alias-equals-g-score.json`             | §1.4      | Backward-compat alias: `b_score === g_score`. |
| TV-v2.0-010    | `TV-v2.0-010-version-identifiers-stable.json`               | §11.1, §15 | Engine reports `larm_v2.0` ruleset and populated versions block; `evaluated_at` is ISO-parseable. |

## Fixture JSON shape

Each fixture is a single JSON document of the form below. The
`$schema` reference is aspirational — no schema file is published in
this revision; the shape is normative here, inline.

```json
{
  "$schema": "../../schemas/test-vector.schema.json",
  "id": "TV-v2.0-XXX",
  "name": "snake_case_identifier",
  "description": "One-sentence human summary of what the fixture pins.",
  "spec_section": "§X.Y",
  "tags": ["hard-stop", "wind", "..."],
  "input": {
    "weather_30d": { /* Weather30dInput */ },
    "weather_today": { /* WeatherTodayInput */ },
    "building_site": { /* BuildingSiteInput */ },
    "operational_context": null,
    "equipment": null,
    "w_override": "W3"
  },
  "params_ref": "@openlarm/regions-taiwan@2.0.0",
  "expected": {
    "decision": "NO_GO",
    "risk_level": "R4",
    "w_code": "W5",
    "conditional_tier": null,
    "requires_approval": false,
    "regime_confidence": 1,
    "secondary_w": null,
    "risk_score_range": [86, 100],
    "buffer_ratio_range": [0.50, 0.55],
    "base_w_range": [15, 22],
    "controls_match_regex": "風速|39",
    "controls_must_not_match_regex": "大雨.*且降雨概率",
    "ruleset_version": "larm_v2.0",
    "versions": {
      "larm_version": "v2.0",
      "thresholds_version": "v2.0",
      "weather_regime_params_version_type": "string"
    },
    "evaluated_at_is_iso_parseable": true,
    "field_equality": ["b_score", "g_score"],
    "conditional_assertion": {
      "if": { "decision": "NO_GO" },
      "then": { "controls_must_not_match_regex": "..." }
    },
    "risk_level_in": ["R0", "R1"]
  },
  "tolerance": { "floating_point_epsilon": 0.01 }
}
```

### Field semantics

- `id` — permanent, immutable identifier. Once published, a fixture's
  `id` MUST NOT change even if the filename or directory does.
- `name` — short `snake_case` slug reused in file names.
- `spec_section` — pointer into `spec/LARM-v2.0.md` for humans.
- `tags` — free-form categorisation used by verifier summaries.
- `input` — mirrors the `LARMInput` shape declared in
  `low-altitude-ops-platform/frontend/src/lib/types.ts`. Missing
  optional fields (e.g. `equipment: null`) mean "do not supply this
  input"; the engine applies its documented defaults.
- `params_ref` — region-adapter parameter bundle to apply (§10 of the
  spec). Currently fixed to
  `@openlarm/regions-taiwan@2.0.0`. **Placeholder:** that package is
  not yet published. Until it exists, a verifier SHOULD resolve
  `params_ref` against its own region-adapter catalog (e.g. by
  applying its v2.0 default parameter record).
- `expected` — assertions that MUST hold for the computed
  `RiskResult`. Keys:
  - Scalar fields (`decision`, `w_code`, `risk_level`,
    `conditional_tier`, `requires_approval`, `regime_confidence`,
    `secondary_w`, `ruleset_version`) — exact-match assertions.
  - `*_range: [lo, hi]` — numeric range `lo ≤ result.<field> ≤ hi`.
    Used where the golden test only bounded a value.
  - `*_in: [...]` — set membership; the field MUST be one of the
    listed values (e.g. `risk_level_in: ["R0", "R1"]`).
  - `controls_match_regex` / `controls_must_not_match_regex` —
    applied to `result.controls.join(" ")`.
  - `versions` — per-subfield exact match, except
    `weather_regime_params_version_type`, which asserts the
    JavaScript `typeof` of that subfield.
  - `evaluated_at_is_iso_parseable` — `new Date(result.evaluated_at)`
    MUST produce a valid Date.
  - `field_equality: ["a", "b"]` — asserts `result.a === result.b`.
  - `conditional_assertion: { if, then }` — if every predicate in
    `if` holds on the result, every predicate in `then` must also
    hold; otherwise the fixture is trivially satisfied.
- `tolerance.floating_point_epsilon` — per §1.2, all numeric
  comparisons use an absolute tolerance of `0.01`.

## Tolerance (§1.2)

Numeric fields compare within absolute tolerance `1e-2` (`< 0.01`).
Categorical fields — `w_code`, `risk_level`, `decision`,
`internal_grade`, `conditional_tier`, `requires_approval`,
`ruleset_version`, and everything under `versions` — compare
bit-equal.

## Stability policy

Fixtures are frozen at v2.0.0. An `expected` block MUST NOT be
changed without a MINOR spec version bump. New fixtures MAY be added
under new filenames. An `id` is permanent even across directory
moves (e.g. `basic/` → `edge/`).

## Source of truth

- Specification: `../../LARM-v2.0.md`
- Golden tests these fixtures are derived from:
  `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/risk-engine.golden.test.ts`
- Input type definitions:
  `low-altitude-ops-platform/frontend/src/lib/types.ts`
