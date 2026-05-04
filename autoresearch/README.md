# autoresearch — autonomous parameter research for LARM v2.0

A drop-in autoresearch loop adapted from
[karpathy/autoresearch](https://github.com/karpathy/autoresearch) for this
repo. The agent edits one file (`packages/regions-taiwan/src/v2.ts`),
runs `autoresearch/evaluate.mjs`, and keeps changes that strictly
improve `metric_score` while keeping all conformance vectors and
invariants green.

## Why this is **params-only**, not engine-edits

Unlike `karpathy/autoresearch` where the agent rewrites `train.py`,
this loop restricts the agent to **parameter calibration only**:

- Every meaningful knob in LARM v2.0 (component caps, weights,
  thresholds, WR matrix, EDR adjustments, region weights) is already
  a data field in `TAIWAN_PARAMS_V2_0`.
- The engine in `packages/core/` is regulated by `spec/LARM-v2.0.md`
  and 10 normative test vectors. Changing it requires Code TSC review.
- Calibration is the highest-leverage thing an autonomous agent can
  safely do here.

If you later want a "track 2" loop that proposes engine changes,
swap `program.md` to allow edits to `packages/core/src/engines/risk-engine.ts`
and tighten `invariants.mts`. Keep the params-only loop as the default.

## What the loop measures

Three orthogonal signals on every iteration:

1. **Conformance**: all 10 spec test vectors at `spec/test-vectors/v2.0/`
   plus the 55-test workspace suite must pass (`npm test`).
   Failure → revert, regardless of metric.
2. **Invariants**: probes in `autoresearch/invariants.mts` that pin
   structural properties the agent could otherwise game (weights sum,
   monotonicity, hard-stop thresholds within sane bounds, R-level
   boundaries non-overlapping, etc.).
3. **Calibration metric** (continuous, lower is better → higher score):
   weighted loss over `autoresearch/calibration/cases.json`. This is
   the only signal the agent optimizes against.

## Quick start

```bash
# from repo root
npm install
node autoresearch/evaluate.mjs           # human-readable
node autoresearch/evaluate.mjs --json    # machine-readable, for the agent
```

You should see something like:

```
conformance       : PASS (55/55 vitest, 10/10 vectors)
invariants_passed : true
metric_score      : 0.81
n_cases           : 12
worst_miss        : CAL-008 ...
elapsed_sec       : 3.7
```

## Running the agent

```bash
git checkout -b autoresearch/run-001
claude  # or codex / cursor
```

Prompt:

> Read `autoresearch/program.md` and run a loop of 30 experiments.
> Edit ONLY `packages/regions-taiwan/src/v2.ts`. Revert any change
> that fails conformance, invariants, or `metric_score`. Append every
> experiment to `autoresearch/results.jsonl`.

## File map

```
autoresearch/
├── README.md               (this file)
├── program.md              agent loop instructions
├── evaluate.mjs            orchestrator (Node ESM, no deps)
├── calibration-runner.mts  TS runner; imports @openlarm/core + params
├── invariants.mts          TS probes against TAIWAN_PARAMS_V2_0
├── calibration/
│   ├── cases.json          continuous-metric calibration cases
│   └── README.md           schema + how to add cases
└── results.jsonl           append-only experiment log
```

## What the human iterates on

You don't write TypeScript in this loop. You iterate on:

1. **`calibration/cases.json`** — add more cases from real GDS missions.
   Until you have 50+, the metric is noisy. Each new mission outcome
   in production should become a calibration case.
2. **`invariants.mts`** — every safety/regulatory red line you can
   articulate goes here. The more invariants, the safer the agent's
   freedom is.
3. **`program.md`** — refine hypothesis seeds and forbidden moves
   based on what you observe.

## Two known limitations

1. **`spec/LARM-v2.0.md` doesn't change.** The spec text is normative;
   it pins what `evaluateRisk` must do. If the agent finds a gain that
   would require relaxing the spec, that's a human decision (Spec
   Editors committee), not an autoresearch outcome.
2. **No ground-truth outcomes yet.** The calibration metric is currently
   "agreement with expert-labeled expected R-level / decision". Once GDS
   accumulates mission incident/near-miss data, the calibration set can
   shift to ground truth and the metric becomes Brier score / calibration
   error. That's a much stronger signal but requires data you don't have
   yet.
