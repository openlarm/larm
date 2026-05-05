# Calibration Lessons Learned

A log of methodology corrections applied to
`autoresearch/calibration/cases.json`. New entries go at the top.

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
