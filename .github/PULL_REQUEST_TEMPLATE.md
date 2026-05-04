<!--
Thanks for contributing to LARM. Please fill in the sections below.
The parts are short on purpose; ignore them only if genuinely N/A.
-->

## Summary

<!-- 1–3 sentences. What changes and why. -->

## Type of change

- [ ] Bug fix (non-behaviour-changing)
- [ ] Refactor / internal cleanup (non-behaviour-changing)
- [ ] Model change (can affect `evaluateRisk()` output — **requires RFC**)
- [ ] Spec change (normative text in `spec/` — **requires RFC**)
- [ ] New region adapter (`@openlarm/regions-*` — **requires RFC**)
- [ ] Docs / tooling / CI only
- [ ] Dependency bump

## Linked issue / RFC

<!-- e.g. Closes #123, or Implements RFC 0007. -->

## Model Governance checklist

Fill in only if the PR changes any file under
`low-altitude-ops-platform/frontend/src/lib/engines/` or `spec/`:

- [ ] Accompanying entry added to `MODEL_CHANGELOG.md`.
- [ ] Golden tests updated or new ones added to cover the change.
- [ ] Conformance test vectors (`spec/test-vectors/v2.0/`) updated.
- [ ] Linked RFC is in `accepted` state.
- [ ] I have pinged the Model Governance Committee on the PR
      (`GOVERNANCE.md` §Model Governance).

## Safety Notice

- [ ] I have NOT modified or removed the Safety Notice excerpts in
      `README.md`, `README.en.md`, `spec/LARM-v2.0.md` §0.1, or the
      `@openlarm/core` package README. Any change to the Safety
      Notice wording must go through `LEGAL/DISCLAIMER.md` per
      `OPEN_SOURCE_DECISIONS.md` §1.

## Licensing & sign-off (DCO / CCLA)

- [ ] All my commits carry a `Signed-off-by:` line (individual
      contributor — DCO).
- [ ] **OR** My employer has an accepted CCLA on file and I am listed
      as an authorised submitter (corporate contributor).

See `CONTRIBUTING.md` for the full dual-track policy.

## Test plan

<!--
Describe how you verified this change locally. For model changes, include:
- which golden tests / conformance vectors you ran,
- what inputs would flip GO ↔ CONDITIONAL ↔ NO-GO (even if none do),
- how reviewers can reproduce.
-->

## Notes for reviewers

<!--
Anything non-obvious, risky, or that would help review go faster.
"N/A" is fine.
-->
