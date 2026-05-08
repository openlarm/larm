# LARM v2.0 Engine-Shape RFC (DRAFT)

> Status: Code TSC review. Triggered by autoresearch round-1
> (`autoresearch/results.round1.jsonl`) and the v2.1 data-expansion
> study (`docs/superpowers/plans/data-expansion-v2.1.md`), both of
> which identified structural ceilings that parameter calibration
> cannot reach.
>
> Author: autoresearch agent, 2026-05-05. Recommendation only — no
> code, params, spec, tests, or fixtures were modified to produce
> this document.

---

## 1. Background

Round-1 of the autoresearch loop ran 30 calibration experiments
against `autoresearch/calibration/cases.json` (28 cases) and
plateaued at `metric_score = 0.9286`. The remaining `worst_miss`
cases were CAL-006 (calm-weather near-HV-power scoring R0 instead
of expected R1) and CAL-015 (EDR=0.78 just below the hard stop,
scoring R3-CONDITIONAL instead of expected NO_GO/R3). The
round-2 README explicitly flagged both as
"structurally unfixable by params (engine caps and hardcoded
R3-CONDITIONAL behavior)" — and instructed the agent to stop
parameter tweaking once those become the worst miss, deferring
to Code TSC.

The v2.1 data-expansion study reached the same conclusion from
the data side: even adding new fields like CAPE or observed
lightning strikes will not move CAL-006 or CAL-015 because the
ceilings are *shape* limits, not *information* limits.

This RFC pulls together the three specific shape claims, traces
each one through the engine source, the param schema, and the
spec, and recommends a disposition for each. The Code TSC is
asked to vote on whether to act on any of them in v2.1.

## 2. Methodology

I read four source files end-to-end:

- `packages/core/src/engines/risk-engine.ts` (527 lines)
- `packages/core/src/engines/model-helpers.ts` (53 lines)
- `packages/core/src/params/schema.ts` (131 lines)
- `packages/regions-taiwan/src/v2.ts` (105 lines)

I cross-referenced each code claim against the LARM v2.0
specification at `spec/LARM-v2.0.md` (~3,000 lines), focusing
on §5 (component scores), §6 (R-score aggregation), §7 (decision
gating), and §10 (parameter registry).

**Limits of this analysis.** I did not run the engine or write
new tests. The "constructed input" examples in this RFC are
hand-traced through the code, not executed; they should be
verified before any decision is acted on. I also did not survey
how downstream consumers (the frontend `src/lib/params-store.ts`
or the admin params UI) would need to change if a new parameter
is added.

---

## 3. Claim 1 — `g_score` env-interaction sub-cap of 3 is hardcoded

### What round-1 observed

Experiment 12 (`autoresearch/results.round1.jsonl`) tried
`W0 base_score 3 → 12` to force CAL-006 (calm + near-HV-power)
above the R1 boundary. The result line records:

> *"W0 base_score 3→12 (CAL-006 g_score=5 too low, only got to 17,
> still R0)"*

For an R0 mission to clear the R1 floor (21 under §6.1's Taiwan
mapping), the agent needs an additional ~4 points from somewhere.
Inspection showed the agent could not get those points from
the env-hazards branch of `g_score` because of two literal caps
the param record cannot override.

### Engine code evidence

`risk-engine.ts:222-232` (the env+interaction sub-dimension of
`computeGScore()`):

```ts
let envRaw = 0
if (b.near_hv_power === 1)       envRaw += 3       // line 223
if (b.near_base_station === 1)   envRaw += 1       // line 224
if (b.clearance_m != null && b.clearance_m < 5) envRaw += 2   // line 225
const envScore = Math.min(3, envRaw)               // line 226 — HARDCODED 3

let interaction = 0
if (floors > 20 && b.wind_channel_effect === 1) interaction += 2
if ((b.site_altitude_m ?? 0) > 300 && b.clearance_m != null
    && b.clearance_m < 5) interaction += 2
const interactionCapped = Math.min(2, interaction) // line 231 — HARDCODED 2
const envInteraction = Math.min(cfg.env_interaction_cap,
                                envScore + interactionCapped)
```

The outer cap `cfg.env_interaction_cap` IS a parameter
(`g_score_config.env_interaction_cap`, default 4), but the
**inner caps `Math.min(3, envRaw)` and `Math.min(2, interaction)`
are literals**. The per-feature point values (`+3` for
`near_hv_power`, `+1` for `near_base_station`, `+2` for
`clearance < 5 m`, `+2` for each interaction term) are also
literals.

### Spec evidence

`spec/LARM-v2.0.md` §5.3.4 codifies the same formula
**normatively**:

```
env_raw = 0
if building.near_hv_power     == 1:  env_raw += 3
if building.near_base_station == 1:  env_raw += 1
if building.clearance_m is not null
   and building.clearance_m < 5:     env_raw += 2
env_score = min(3, env_raw)   # sub-cap 3 before interaction

interaction = 0
...
interaction_capped = min(2, interaction)

env_interaction = min(cfg.env_interaction_cap,
                      env_score + interactionCapped)
```

The literal `3` and the per-feature points `+3 / +1 / +2 / +2`
are part of the spec's normative pseudo-code. They are tagged
`[heuristic, no empirical source]`.

### Constructed CAL-006 trace (not executed)

For the CAL-006 input (calm, near_hv_power=1, otherwise simple):

| Sub-dimension | Calculation | Value |
|---|---|---|
| `structural` | floors=8, alt=15m, light facade → 0+0+2 → min(10,2) | 2 |
| `ground_consequence` | residential default = 2; no mitigations | 2 |
| `tke_proxy` | floors=8 → 0.5; wind=6 → sqrt(0.6)≈0.77; no corridor → 1.0; floor(0.5×0.77×1.0)=0 | 0 |
| `env_score` | hv_power=1 → +3 → min(3,3) | **3** |
| `interaction_capped` | no rules trigger | 0 |
| `env_interaction` | min(4, 3+0) | 3 |
| `g_score` | min(20, 2+2+0+3) | **7** |
| `base_w` (W0) | 3 |  3 |
| `weather_now` | clamp(negative, 0) | 0 |
| `R_score` | 3+0+7+0+0 | **10 → R0** |

To lift CAL-006 to R1 (≥ 21), the agent would need 11+ more
points. Available levers:

| Lever | Param? | Reachable max contribution |
|---|---|---|
| `near_hv_power` point value | No (literal `+3`) | bounded by inner `min(3,…)` |
| Inner env cap (3) | No (literal) | n/a |
| `env_interaction_cap` | Yes (default 4) | already 4 — only adds 1 over current |
| `near_base_station` / `clearance` literals | No | bounded by inner `min(3,…)` |

So even setting `env_interaction_cap` to its theoretical max
(say 8) only adds 1 point on this case, because `envScore` is
already saturated at 3 from `near_hv_power` alone. The agent's
diagnosis ("g_score=5 too low") is correct in spirit.

### Verdict — **Confirmed**

The literal `3` in `risk-engine.ts:226` and `2` in line 231 are
hardcoded; the per-feature point values on lines 223–225 are
also hardcoded. The spec normatively *also* hardcodes them.
There is no path through `WeatherRegimeParams` that lets a region
adapter elevate a calm-weather + HV-power mission above R0 by
calibration.

### Proposed resolution — Param-ize

Add to `g_score_config` (in `schema.ts`) a new sub-record:

```ts
interface GScoreEnvHazardsConfig {
  near_hv_power_pts: number       // default 3
  near_base_station_pts: number   // default 1
  clearance_lt_5m_pts: number     // default 2
  inner_cap_env: number           // default 3 (was Math.min(3,…))
  inner_cap_interaction: number   // default 2 (was Math.min(2,…))
  high_floor_corridor_pts: number // default 2
  high_alt_low_clearance_pts: number // default 2
}
```

Spec change: §5.3.4 changes from a literal-bearing pseudo-code
block to a parameter-bearing one, with the Taiwan reference
values listed in Appendix A. No behavioural change for callers
who use the existing Taiwan params unchanged.

Estimated effort: **S** (one schema field cluster, ~20 lines of
engine refactor, ~30 lines of spec edit, plus updates to
`v2.ts`, `LARM_PARAM_GUIDE.md` §11-A, the admin params UI's
"R指標 Tab", and the conformance vector at §12 if any reach
this code path — none currently do).

Risk: **Low**. Default values preserve v2.0 behaviour exactly;
the change is purely a calibration-surface expansion.

---

## 4. Claim 2 — EDR 0.7–0.8 unreachable NO_GO

### What round-1 observed

After round-1 experiment 14 settled CAL-004 / CAL-007 via
wr_matrix moves, the new `worst_miss` was CAL-015 (EDR=0.78 on
a tall windward tower, expected NO_GO/R3, predicted
GO/R1 originally and CONDITIONAL/R3 after round-2 invariants
locked the boundaries). Experiments 19 and 30 tried EDR-table
tweaks; none reached NO_GO without violating an invariant.

### Engine code evidence

EDR enters the engine in three places:

1. **Hard stop** (`risk-engine.ts:362-365`):

   ```ts
   if (today.edr != null && today.edr > hs.edr_threshold) {
     return { decision: "NO_GO", ... }
   }
   ```

   Default `hs.edr_threshold = 0.8`. **Strict greater-than**, so
   `edr === 0.8` does not trigger; `edr === 0.78` is well below.
   This threshold IS a parameter.

2. **EDR adjustment to WeatherNow** (`risk-engine.ts:107-114`,
   table at `v2.ts:87-92`):

   ```ts
   function computeEDRAdj(edr, P) {
     if (edr == null) return 0
     let adj = 0
     for (const t of P.edr_thresholds) {
       if (edr >= t.min_edr) adj = t.adj    // last-matching wins
     }
     return adj
   }
   ```

   With the Taiwan table `[{0.1→3}, {0.3→7}, {0.5→12}, {0.8→20}]`,
   EDR=0.78 returns `adj = 12`. The adjustment IS a parameter
   (table-shaped); the upper-bound 20 is a parameter too.

3. **No third route.** `edr` does not affect `g_score`,
   `o_score`, `e_score`, `wr_matrix` lookup, or
   `r4_nogo_threshold` directly.

### Constructed CAL-015 trace (not executed)

CAL-015 inputs: wind_now=25, gust=36, rain=0, edr=0.78,
forecast_confidence=65, building 30 floors / 110 m / complex /
windward / wind_channel=1.

`classifyWeatherRegime` (lines 53–81) over CAL-015's `weather_30d`
(`wind_p90=32`, `predictability_score=0.65`, `rain_days=5`,
`heavy_rain_days=0`, `instability=0.4`):

- W5: 32 < 39 and gust_p90=40 < 50 → no
- W3: 5 < 15 → no
- W4: 0.4 < 0.7 → no
- W1: 32 < 33 → no
- W2: 5 < 8 → no
- → **W0**

`computeWeatherNow` (lines 116–183):

- effective wind: `forecast_confidence=65 ≥ 55` → use `wind_now=25`
- wind_score row (19–25) → 20; wind_comp = min(50, 20×0.8) = 16
- rain_score: prob=20 < 20 fails, mmph=0 < 1 succeeds — but rule_0
  needs both AND, so falls through to `return 0` at line 104
- inst: 0.4 × 20 = 8; component = 0.10 × 8 = 0.8
- pred_disc: −0.65 × 10 = −6.5
- thunder: 0
- edr_adj: 0.78 → last-matching threshold 0.5 → 12
- raw = 0.55×16 + 0.35×0 + 0.10×8 + (−6.5) + 0 + 12 = 8.8 + 0 +
  0.8 − 6.5 + 0 + 12 = **15.1**
- region_weight: W0/windward = 1.00
- time_mult: 1.0 (not W4)
- weather_now = round1(clamp(15.1, 0, 42)) = **15.1**

`computeGScore` (lines 187–261):

- structural: floors=30 → height_score=6 (>20 not >30); alt=25
  → 0; complexity=heavy → 6; structural = min(10, 12) = 10
- ground_consequence: residential default = 2
- tke_proxy: floors=30 → factor 1.2; wind=25 → sqrt(2.5)=1.58;
  corridor=1 → 1.4; floor(1.2×1.58×1.4) = floor(2.65) = 2
- env_raw: hv=0, base=0, clearance=3<5 → +2 → env_score = 2
- interaction: floors>20 && corridor → +2; alt>300 false →
  interaction = 2 → capped at 2
- env_interaction: min(4, 2+2) = 4
- g_score = min(20, 10+2+2+4) = **18**

`o_score`: ops absent → defaulted to all-zero → **0**.
`e_score`: no equipment → **0**.

`risk_score = round(3 + 15.1 + 18 + 0 + 0)` = **36 → R1**.

The CAL-015 expected output is NO_GO/R3. Currently the engine
reports R1. There are three potential routes to NO_GO:

1. **Hard stop on EDR.** Requires `edr > hs.edr_threshold`.
   Setting `hs.edr_threshold` to 0.7 would fire on 0.78, but
   then 0.78 → NO_GO and 0.69 → no NO_GO; this just moves the
   boundary, doesn't fix the structural shape.
2. **Push score above `r4_nogo_threshold` (92).** Requires
   ~57 more points than current 36. Even quadrupling EDR adj
   (12 → 48) only buys 36 more, getting to 72 (R3). The cap
   `weather_now_cap = 42` blocks further EDR-only escalation.
3. **Land in R3 and have R3 route to NO_GO.** Blocked by the
   short-circuit (Claim 3).

### Spec evidence

Spec §7.2 (normative) explicitly codifies the R3/R4 short-circuit:

> *"After the hard stops, the engine evaluates: (1) R4 band,
> below hard-NO-GO threshold ... CONDITIONAL with conditional_tier
> = 'D2' ... (2) R3 band ... CONDITIONAL with conditional_tier
> = 'D1'."*

Spec §7.3 (normative) reinforces:

> *"Because branches (1) and (2) return before any WR-matrix
> lookup, the wr_matrix cells at columns R3 and R4 are consulted
> only by informative helpers ... Implementations MUST short-circuit
> at R3/R4 to preserve v2.0 behaviour."*

So the engine's behaviour matches the spec exactly. The
calibration case CAL-015 expects "NO_GO at R3", which is **not
something v2.0 can produce by design**.

### Verdict — **Partially confirmed; matches spec**

The agent's observation is correct at the code-level (no R3 →
NO_GO path exists). But this is not an engine bug — it is the
explicit normative behaviour of §7.2 / §7.3. CAL-015's `expected:
{decision: "NO_GO", r_level: "R3"}` is **inconsistent with the
spec**: under v2.0, R3 *cannot* yield NO_GO (only CONDITIONAL-D1).

The case can be reached either by (a) revising CAL-015's expected
output to `CONDITIONAL/R3`, or (b) adding a new spec-level path
from EDR 0.7–0.8 to NO_GO (e.g. EDR-tier-specific routing in the
gating ladder), or (c) lowering `hs.edr_threshold` from 0.8 to
0.7 (a parameter change, no engine work needed).

### Proposed resolution — Spec-clarify + parameter

**Two-part proposal**:

1. **Add an EDR severity-NO_GO path** to spec §7.1 hard stops:
   a new rule "EDR ≥ `P.thresholds.hard_stop.edr_severe_threshold`"
   (default 0.7). This converts the existing `> 0.8` hard stop
   from "single threshold" into "two-tier hard stop", with the
   upper tier unchanged. Region adapters can opt out by setting
   `edr_severe_threshold` equal to `edr_threshold`. Spec §7.1
   precedence table (informative) gets one new row.
2. **Update CAL-015** in `autoresearch/calibration/cases.json`
   to reflect the chosen behaviour. If the spec change above is
   adopted, CAL-015's expected output stays NO_GO and the
   calibration agent can reach it via the new hard-stop param.

Estimated effort: **S** for the param + spec change; **M** if
the CAL-015 expected output is instead corrected and a new
calibration case is authored to exercise the new path. Risk:
**Medium** — adding a hard stop changes the GO/NO_GO ratio of
real missions; Model Governance must sign off explicitly.

If the Code TSC prefers no behavioural change, the alternative
disposition is:

3. **Spec-clarify only**: Add to `spec/LARM-v2.0.md` §14
   ("Known Limitations") an explicit note that EDR 0.7–0.8 +
   tall windward tower lands in R3-CONDITIONAL-D1, not NO_GO,
   under v2.0. Update PARAM_GUIDE §一 ("硬停條件") to make this
   visible to operators. Update `autoresearch/calibration/cases.json`
   CAL-015 expected output. No code change.

Estimated effort: **S**. Risk: **Low**.

---

## 5. Claim 3 — R3 hardcoded to CONDITIONAL

### What round-1 observed

Experiment 24 (`autoresearch/results.round1.jsonl`):

> *"wr_matrix W4.R3 cond→nogo (engine ignores R3 wr_matrix)"*

The agent set `wr_matrix.W4.R3` to `"nogo"` and observed that
the engine produced no change in CAL-007's decision.

### Engine code evidence

`risk-engine.ts:371-382` (excerpt):

```ts
if (risk_level === "R4") {
  return { decision: "CONDITIONAL", ... conditional_tier: "D2" ... }
}
if (risk_level === "R3") {
  return { decision: "CONDITIONAL", ... conditional_tier: "D1" ... }
}

// WR matrix check
const wrResult = P.wr_matrix[w_code]?.[risk_level]
if (wrResult === "nogo") { ... }
```

The R4 and R3 short-circuits at lines 371 and 377 return BEFORE
the wr_matrix is consulted at line 385. So `P.wr_matrix.W?.R3`
and `P.wr_matrix.W?.R4` are never read by the gating function
in normative paths. (They ARE read by `getWRDecision()` in
`model-helpers.ts:39-45`, but that helper is only used by the
admin-params UI for display, not by `evaluateRisk()`.)

### Spec evidence

Spec §7.3:

> *"The parenthesised cells in columns R3 and R4 are retained
> in the parameter record for informative use by the standalone
> helper `getWRDecision()` (non-normative UI support). They do
> not participate in the normative decision path, because §7.2
> short-circuits before this lookup is reached."*

Spec §14.1 ("Known inconsistencies") presumably (per its title)
covers this — I did not read §14.1 directly but spec §7.3
references it as documenting "this inconsistency".

### Param-side comparison

`packages/regions-taiwan/src/v2.ts:27-34` shows the Taiwan
`wr_matrix` R3 column:

```
W0.R3: "nogo", W1.R3: "cond", W2.R3: "cond",
W3.R3: "cond", W4.R3: "cond", W5.R3: "cond"
```

So even if the engine were patched to consult the wr_matrix at
R3, only W0/R3 would route to NO_GO under the existing Taiwan
params; W1–W5/R3 would still produce CONDITIONAL. The autoresearch
agent's observation that "engine ignores R3 wr_matrix" is
correct, but the params themselves would not deliver the
expected behaviour for CAL-015 (W0 in this case → would NO_GO,
but for cases where W is W2–W5 the matrix says cond).

### Verdict — **Confirmed; deliberate per spec**

The engine ignores `wr_matrix.R3` and `wr_matrix.R4` cells.
This is explicitly normative under §7.2 and §7.3 and is
documented in §14.1 as a "known inconsistency". The
autoresearch agent reached the right conclusion via experimental
evidence; the inconsistency is not an oversight.

### Proposed resolution — Spec-clarify + UI fix

Two coordinated changes, neither behavioural:

1. **Spec edit.** Promote the §14.1 "known inconsistency" note
   into a clearer warning at the top of §7.3, restating that R3
   and R4 cells are display-only and any change to them does not
   affect engine output.
2. **UI clarification.** The admin params WR-matrix tab
   (`src/app/(main)/admin/params/page.tsx`) should grey out or
   visually mark the R3 and R4 columns as informative-only. The
   `LARM_PARAM_GUIDE.md` §五 (WR 矩陣) currently shows the full
   6×5 matrix without any such note; it should add one. (Out of
   scope for engine work but flagged here so it travels with
   the spec edit.)

Estimated effort: **S**. Risk: **None** (no behavioural change).

If the Code TSC instead wants R3 to be sensitive to the WR
matrix — i.e. to remove the §7.2 short-circuit — that is a
**Major version bump** (v3.0): an input that previously produced
CONDITIONAL-D1 can flip to NO_GO. This is out of scope here but
flagged as the "alternative" path Code TSC may consider.

---

## 6. Cross-cutting observation

All three claims share a structural pattern:

> **The autoresearch agent encountered behaviour that LOOKS like
> a parameterizable knob but is in fact embedded in the spec's
> normative pseudo-code.**

This pattern shows up in:

- The literal `3` and per-feature points of §5.3.4 (Claim 1).
- The R3/R4 short-circuit of §7.2 / §7.3 (Claim 2 / 3).
- The hardcoded population-density-class → ground-consequence
  map in §5.3.2 (`pop_map = {assembly: 6, …}`) — same shape;
  not raised by autoresearch but worth noting.
- The hardcoded R2-CONDITIONAL contextual-flag list in §7.5
  (`night work / wind-corridor / HV power / windward+coastal`)
  — same shape; not raised yet.

Each of these is, by spec design, a **calibration-fixed shape**
rather than a **calibration-fixed knob**. Region adapters
(per spec §10.3) cannot legally redefine R-level mapping or
add fields to `WeatherRegimeParams`. So an attempt to "tune
v2.0 by parameters" inevitably bumps into one of these shapes.

If Code TSC is comfortable with the autoresearch loop being
*structurally limited* to the `[heuristic, no empirical source]`
levers that *are* parameters — wind-score table, rain rules,
weights, edr_thresholds, R-level boundaries (subject to
invariants), wr_matrix R0–R2, base scores, region_weight_table,
volatility buffer, buffer coefficients, the various caps and
multipliers — then no action is required and the
autoresearch agent should stop optimising once worst_miss lands
on a shape-bound case.

If Code TSC wants to grow the parameter surface to cover
regional calibration that v2.0 cannot reach, the candidates
above (especially Claim 1) are the cheapest places to start.

---

## 7. Recommendations to Code TSC

Ranked by recommended priority for v2.1.

### Recommendation A — Param-ize `g_score` env-hazards (Claim 1)

Adopt the schema extension proposed in §3 above. Default values
preserve current Taiwan behaviour. Region adapters and the
admin-params UI gain the ability to push calm-weather + HV-power
or calm-weather + tight-clearance missions above R0 if their
regional risk model says they should be.

- Effort: **S**
- Risk: **Low** (purely additive, defaults match v2.0)
- Resolves: CAL-006 (with Model Governance approval of the
  appropriate point values)

### Recommendation B — Spec-clarify R3 / R4 short-circuit (Claim 3)

Add an explicit warning at the top of §7.3 of the spec; mark R3
and R4 cells as display-only in the admin-params WR-matrix UI;
add a one-paragraph note in `LARM_PARAM_GUIDE.md` §五.

- Effort: **S**
- Risk: **None** (no behavioural change)
- Resolves: future-agent confusion; ensures the next round of
  autoresearch does not waste experiments on R3/R4 cells

### Recommendation C — Decide CAL-015 disposition (Claim 2)

Code TSC must choose one of:

- **C1**: Update CAL-015's expected output to
  `{decision: "CONDITIONAL", r_level: "R3"}` to align with
  spec. Add a new calibration case for "EDR=0.78 must NOT GO"
  that resolves to CONDITIONAL-D1 rather than NO_GO. **(Effort S,
  Risk Low.)**
- **C2**: Add a parameterized EDR-severe hard stop at default
  0.7 (the proposal in §4 above). Keeps CAL-015's NO_GO
  expected output. **(Effort S, Risk Medium — changes
  GO/NO_GO ratio; needs Model Governance sign-off.)**
- **C3**: Defer to v3.0; ship v2.1 without addressing CAL-015.
  Document in `MODEL_CHANGELOG.md` as "known limitation". **(Effort
  S, Risk Low.)**

The author's recommendation is **C1** — the spec is correct as
written, the calibration case is what's misaligned. C2 is a
reasonable alternative if Model Governance specifically wants to
treat EDR 0.7+ as a NO_GO event.

### Recommendation D — Do nothing

Defensible position: v2.0 is freshly stabilized (round-2
invariants are at 25/25), the calibration metric is at 0.9286,
and the remaining gap is structural. Defer the engine-shape
discussion to v3.0 alongside other major changes.

- Effort: **0**
- Risk: **Low** (calibration metric stays where it is)
- Resolves: nothing, but blocks no future work

---

## 8. Out of scope

This RFC explicitly does NOT propose:

- Adding new R-levels or W-codes.
- Redefining the §6.1 R-level boundary mapping.
- Removing the R3/R4 short-circuit (Recommendation C2 adds an
  alternative path; it does not delete the existing one).
- Refactoring the `evaluateRisk()` control flow into smaller
  functions, or splitting the engine into a separate gating
  package.
- Adding pricing parameters back into `WeatherRegimeParams`
  (resolved separately in `OPEN_SOURCE_DECOUPLING_AUDIT.md`).
- The v2.1 data-expansion candidates (`cape_jkg`,
  `lightning_strikes_30min_5km`, `visibility_m`) — those live
  in `data-expansion-v2.1.md` and are independent of this RFC.
- Any change to the CWA / Open-Meteo / JMA fetch wrappers.
- Conformance test vectors at §12 — none of them currently
  exercise the env-hazards code path, but if Recommendation A
  is adopted, at least one new vector should be added.

---

## 9. References

### Engine code

- `packages/core/src/engines/risk-engine.ts:107-114`
  (`computeEDRAdj`)
- `packages/core/src/engines/risk-engine.ts:187-261`
  (`computeGScore`)
- `packages/core/src/engines/risk-engine.ts:222-232`
  (env+interaction sub-dimension; the hardcoded literals)
- `packages/core/src/engines/risk-engine.ts:343-428`
  (`computeGating`, the decision ladder)
- `packages/core/src/engines/risk-engine.ts:371-382`
  (R3/R4 short-circuit)
- `packages/core/src/engines/risk-engine.ts:385-388`
  (wr_matrix consultation, only reached when risk_level ∈ {R0,R1,R2})
- `packages/core/src/engines/model-helpers.ts:39-45`
  (`getWRDecision()`, the informative helper for the admin UI)
- `packages/core/src/params/schema.ts:79-86` (`GScoreConfig`)
- `packages/core/src/params/schema.ts:113`
  (`hard_stop.edr_threshold`)
- `packages/regions-taiwan/src/v2.ts:27-34` (Taiwan wr_matrix
  with `R3`/`R4` cells)
- `packages/regions-taiwan/src/v2.ts:87-92` (Taiwan
  `edr_thresholds` table)

### Spec sections

- `spec/LARM-v2.0.md` §5.3.4 — environment + interaction
  sub-dimension (literals codified normatively)
- `spec/LARM-v2.0.md` §5.3.5 — G_score aggregation
- `spec/LARM-v2.0.md` §7.1 — hard stops (including the
  `edr > 0.8` strict greater-than)
- `spec/LARM-v2.0.md` §7.2 — R3 / R4 short-circuit (normative)
- `spec/LARM-v2.0.md` §7.3 — wr_matrix R3/R4 cells declared
  informative
- `spec/LARM-v2.0.md` §10.3 — Region adapter constraints
  (cannot add new fields without core spec change)
- `spec/LARM-v2.0.md` §14 — Known Limitations and Known
  Inconsistencies (referenced by §7.3)

### Calibration / autoresearch

- `autoresearch/calibration/cases.json` — CAL-006 (lines 60–69),
  CAL-015 (lines 161–170)
- `autoresearch/results.round1.jsonl` — exp 12 (CAL-006),
  exp 19 / exp 24 / exp 30 (CAL-015 + R3 wr_matrix attempts)
- `autoresearch/program.md` — Tier-ranked hypothesis list,
  explicitly forbidden moves
- `autoresearch/invariants.mts` — round-2 lock 1
  (`mapping_r_level_canonical_spec_boundaries`), lock 4
  (`wr_matrix_no_go_above_r1`)
- `README.md` (round-2 patch notes) — explicit framing of
  CAL-006 / CAL-015 as engine-bound
- `docs/superpowers/plans/data-expansion-v2.1.md` — companion
  v2.1 data-side analysis that reaches the same conclusions
  from the data-expansion direction
