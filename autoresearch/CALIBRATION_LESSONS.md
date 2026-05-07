# Calibration Lessons Learned

A log of methodology corrections applied to
`autoresearch/calibration/cases.json`. New entries go at the top.

---

## 2026-05-07 — Systemic `facade_complexity` typo across 20 of 29 cases

`cases.json` was authored with `"facade_complexity": "moderate"` (16 cases) and
`"complex"` (4 cases), but the `Complexity` TypeScript enum is
`"light" | "medium" | "heavy"`. The engine's lookup
`complexityMap[b.facade_complexity] ?? 0` silently fell through to **0**
instead of 4 (medium) or 6 (heavy).

**Affected cases** (20 of 29):
- "moderate" → "medium": CAL-005, 006, 010, 013, 014, 016, 020, 021, 022, 023, 024, 025, 026, 027, 028, 029
- "complex" → "heavy": CAL-003, 007, 008, 015

The CAL-004 instance was found and fixed earlier in the same day (commit
`1a87141`, lightning task) because it was needed to verify the lightning
integration's predicted +1 risk_score. The full sweep happened in commit
**`<sweep-commit>`**.

### Metric impact: smaller than expected

- Pre-sweep metric: 0.7402 (after lightning + cape + W0/buffer round-3 keeps)
- Post-sweep metric: **0.7431** (Δ = **+0.0029**)

The user predicted +0.05–0.10 from the sweep. Reality was 17× smaller. **Why
the predicted jump didn't materialize**: most affected cases have
`risk_score` sitting deeper inside an R-band than the +4 (medium) or +6
(heavy) lift can close to the next integer R-level boundary. Decision cost
(0.3 for GO/COND mismatch) is the dominant loss term, and decision is
gated on R-level — so within-band score lifts don't reduce loss. Only
**CAL-007** (35F supertall canyon, R2→R3, +6 from "complex"→"heavy" was
enough to cross the 65→66 boundary) moved a full R-level. CAL-020
partially improved (R0→R1) but stayed wrong on decision.

### Implication for round-1/2/3 conclusions

Round-1 (`metric_score 0.9286` ceiling), round-2 (0.7956), and round-3
(0.7207) were all computed against the corrupted cases. The conclusions
hold qualitatively (engine-shape limits, R1→R2 cliff, governance review
items) but the absolute metric numbers in those reports are slightly off
from what the engine would produce against correct data. Re-running those
rounds against the corrected cases would produce the same shape of
findings with a small constant offset.

### Worst_miss reshuffle

None substantive. Top losses post-sweep:

1. CAL-023 (engine-shape, unchanged)
2. CAL-016 wind-just-below-hard-stop (unchanged)
3. CAL-003, 008, 012, 013, 014, 021, 025, 027, 028 — all R1/GO → R2/COND
   at loss 0.425, the persistent R1→R2 cliff that round-3 documented and
   that v2.1's narrow-channel features can't break alone.

CAL-007 dropped from the worst_miss list (now at 0.125), demonstrating
that getting the *correct* enum value matters when the case's score is
near a boundary.

### Process going forward

Add to round-4 program: a Zod-or-equivalent validation step at
`calibration-runner.mts` startup that asserts every `cases.json` input
parses against the `LARMInput` type. This class of bug should fail the
load, not silently degrade the test suite. Tracked as a follow-up in
`docs/superpowers/plans/`.

---

## 2026-05-05 — CAL-029 unresolvable via env-hazards alone; not a calibration target

When implementing the params_override mechanism in `calibration-runner.mts`,
hand-tracing revealed that CAL-029's expected COND/R1 cannot be reached
under W0 climate by env-hazards tuning alone, regardless of how high
`env_hazards_cap` or `env_hazard_points` are pushed. The blocker is
`wr_matrix.W0.R1 = "go"`, which routes any R1-classified mission under
stable-clear weather to GO regardless of risk score composition.

Round-2 autoresearch independently identified `wr_matrix.W0.R1 go→cond`
as a metric-improving change (kept change n=17, +0.0586 metric delta).
**This is a LARM operational policy decision, not a per-region calibration
knob.** Encoding it as a CAL-029 `params_override` would smuggle the
governance question through the calibration mechanism, polluting future
calibration with non-realistic region-adapter values.

A previous attempt set the override to `env_hazards_cap: 16,
near_hv_power: 8` (5× and 2.7× the v2.0 defaults) to chase metric. No
reasonable real region adapter would set those values; doing so for
metric improvement would corrupt future calibration intuition.

**Decision**: CAL-029 stays as an unresolved case. Its loss contributes
to `metric_score` and that loss is acceptable evidence of a real gap.
Re-evaluate after Spec Editors review of the round-2 `wr_matrix`
proposals (see `autoresearch/results.jsonl` kept changes n=17, n=18,
n=28).

The `params_override` mechanism itself is shipped (`calibration-runner.mts`)
and remains valuable for future region adapters (Hong Kong, Singapore,
Japan) which will have legitimate per-region calibration needs.

---

## 2026-05-05 — CAL-029 unresolvable via env-hazards alone

While implementing the `params_override` mechanism in
`autoresearch/calibration-runner.mts`, hand-tracing revealed that
CAL-029's expected `COND/R1` cannot be reached under W0 climate by
env-hazards tuning alone, regardless of how high `env_hazards_cap` or
`env_hazard_points` are pushed. The blocker is `wr_matrix.W0.R1 =
"go"`, which routes any R1-classified mission under stable-clear
weather to GO regardless of risk score composition.

Round-2 autoresearch independently identified `wr_matrix.W0.R1
go→cond` as a metric-improving change but this is a LARM operational
policy decision, not a per-region calibration knob. Encoding it as a
CAL-029 `params_override` would smuggle the governance question
through the calibration mechanism.

Status: CAL-029 remains a recognized unresolved case. Re-evaluate
after Spec Editors review of the round-2 wr_matrix proposals. Until
then, the case contributes loss to `metric_score` and that loss is
acceptable evidence of a real gap.

The `params_override` mechanism itself ships and is available for
future region-adapter calibration cases; it just isn't invoked on
any case in this round.

---

## 2026-05-05 — Calibration cases must respect spec, not author intuition

Following the engine-shape RFC at
`docs/superpowers/plans/larm-engine-shape-rfc.md`, several round-1
and round-2 calibration cases had expected outputs unreachable under
LARM v2.0 spec §7.2/§7.3.

### What went wrong

Cases were written with `expected = NO_GO/R3` based on the author's
intuition that "thunderstorm-imminent / EDR=0.78 / wind=38 km/h
should obviously be NO-GO." Per spec:

- R3 is **CONDITIONAL-D1** by design, not NO_GO. R3 = "high risk,
  requires senior approval and active controls, but may proceed."
- NO_GO at high R-level is reachable only via R4 (R_score ≥ 86)
  or via a hard-stop precondition that short-circuits R-level
  mapping entirely.
- The engine and spec are aligned and intentional. Reference:
  `larm-engine-shape-rfc.md` §5 (Claim 3 — R3 hardcoded to
  CONDITIONAL).

### Why this matters for autoresearch

When a case has an unreachable expected, the metric_score has a
hardcoded ceiling below 1.0 that no parameter change can clear.
The autoresearch agent then either:

  - bashes against the ceiling, distorting otherwise-good
    parameters in pursuit of impossible improvements; or
  - stops early with low metric and a misleading "no progress"
    signal that hides whether real calibration progress is
    available elsewhere.

Round-1's reported metric ceiling of 0.9286 was caused in part by
this. Round-2 baseline of 0.5076 (after 28-case expansion) was
similarly inflated.

### What was changed

- **CAL-004** thunderstorm-imminent — Correction A
  (NO_GO → COND, keep R3). Rain 6 mm/h @ 70% does not meet the rain
  conjunction hard stop (needs > 10 mm/h AND > 60%). R3 routes through
  CONDITIONAL-D1 (senior approval + active weather monitoring + abort
  triggers), which is the authentic spec response to "thunderstorm
  imminent but not yet dangerous enough to short-circuit."
- **CAL-007** supertall-canyon-turbulence — Correction A
  (NO_GO → COND, keep R3). EDR=0.55 is below the 0.8 hard stop. A 35F
  supertall in canyon flow is exactly the high-risk-but-controllable
  scenario D1 was designed for (mitigations: aborts, narrowed geofence,
  reduced ceiling).
- **CAL-015** edr-just-below-hard-stop — Correction A
  (NO_GO → COND, keep R3). Description's premise — "NO-GO via
  R-level/wr_matrix even without hard stop" — assumes a path that does
  not exist under v2.0. R3 is COND-D1 by construction.
- **CAL-016** wind-just-below-hard-stop — Correction A
  (NO_GO → COND, keep R3). Same pattern: author encoded "almost a hard
  stop" as R3+NO_GO. Either the threshold trips (R3+NO_GO via
  short-circuit) or it doesn't (R3+COND). No middle path exists.

### Process going forward

Three rules for adding or editing calibration cases:

1. **Read spec §7 (hard stops) and §6 (R_score components) before
   writing any case with `expected.decision = "NO_GO"`.** Confirm
   the case can actually reach NO_GO under v2.0 logic.
2. **If your intuition disagrees with the spec, that is a Spec
   Editors discussion, not a calibration case.** Open an RFC under
   `docs/superpowers/plans/`. Do not encode the disagreement as a
   "correct" expected output the calibration loop will chase.
3. **When round-N autoresearch worst_miss patterns resemble
   structural limits, cross-check spec before assuming model
   error.** Engine code and spec §14.1 already document several
   intentional asymmetries.
