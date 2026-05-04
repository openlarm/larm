---
name: RFC tracking issue
about: Tracking issue for an accepted or in-progress RFC
title: "[rfc-NNNN] "
labels: ["rfc", "tracking"]
assignees: []
---

<!--
This template is for the tracking issue that accompanies an RFC PR.
The RFC text itself lives in `rfcs/NNNN-<slug>.md`.
-->

## RFC

- **Number:** NNNN
- **Title:**
- **PR:** #NNN
- **Owning committee:** Code TSC / Model Governance / Spec Editors
- **Status:** Draft / In review / Accepted / Deferred / Declined

## One-paragraph summary

<!-- Copy the RFC's Summary section verbatim. -->

## Why this tracking issue exists

Every accepted RFC gets a tracking issue so that:

1. Implementation PRs have a stable thing to reference.
2. The community can subscribe to progress without watching the RFC
   document itself.
3. Deferred RFCs have a place to record what's blocking them.

## Implementation checklist

Break the RFC's implementation into sub-PRs. Each bullet here
eventually links to a merged PR.

- [ ] Sub-PR 1: …
- [ ] Sub-PR 2: …
- [ ] Update `MODEL_CHANGELOG.md` (if model change).
- [ ] Update `spec/LARM-v2.0.md` (if normative change).
- [ ] Update conformance test vectors in `spec/test-vectors/v2.0/`.
- [ ] Cut release.

## Blocking / blocked by

<!-- Other issues or RFCs that must land first, or that this one blocks. -->

## Notes

<!-- Ongoing discussion that doesn't fit in PR threads. -->
