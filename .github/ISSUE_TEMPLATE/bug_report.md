---
name: Bug report
about: Report a defect in the code, the spec, or the reference implementation
title: "[bug] "
labels: ["bug", "needs-triage"]
assignees: []
---

<!--
Before filing:
- For model-output questions ("why did this input get R3?"), please use
  Discussions rather than a bug report unless you believe the engine
  is genuinely miscomputing per spec.
- For spec wording questions, file with label `spec` and cite the
  section number.
-->

## What happened?

<!-- One paragraph. What did you observe? -->

## What did you expect to happen?

<!-- One paragraph. What did the spec / docs / intuition say should happen? -->

## Minimal reproduction

```ts
// The smallest input that reproduces the issue.
const input = { /* ... */ };
const result = evaluateRisk(input, { params: /* ... */ });
// observed:
// expected:
```

If the bug is a spec issue (wording, contradiction, missing clause)
instead of a code issue, paste the spec excerpt and section number
here instead of code.

## Environment

- **Package and version:** `@openlarm/core@x.y.z` (or a commit SHA if
  from source)
- **Region adapter and version:** `@openlarm/regions-taiwan@x.y.z`
  (if applicable)
- **Node / runtime:** node -v, deno -v, bun -v — as applicable
- **OS:** e.g. macOS 14.4, Ubuntu 22.04

## Severity

- [ ] **Safety-critical** — wrong output could flip GO ↔ NO-GO for a
      realistic operator input.
- [ ] **Correctness** — observable output mismatch with the spec but
      not safety-critical.
- [ ] **Interface / ergonomics** — types, errors, DX.
- [ ] **Docs / spec wording only.**

Safety-critical reports may qualify for the private reporting channel
in `SECURITY.md`. If in doubt, file privately first.

## Additional context

<!-- Logs, links to related issues, workarounds, etc. -->
