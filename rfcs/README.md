# LARM RFC Process

Substantive changes to the LARM model or specification go through a
written Request-for-Comments (RFC) before they are merged. Small code
changes and bug fixes do not need an RFC.

This document explains **what needs an RFC**, **how to write one**, and
**how it gets reviewed**.

---

## What needs an RFC?

An RFC is required for any change that falls in one or more of these
buckets:

### Model Governance territory (always RFC)

Changes under the Model Governance Committee's scope in
[`GOVERNANCE.md`](../GOVERNANCE.md). In practice:

- New or retired parameters in `weather-regime-params.ts` (or the
  equivalent schema in a region-adapter package).
- Any change to parameter default **values** that can flip a GO /
  CONDITIONAL / NO-GO outcome for an existing input.
- W-code boundaries, R-level boundaries, regime classifier rules.
- Hard-stop thresholds (wind, rain, EDR, R4 NO-GO threshold).
- Additions or retirements of input fields on any `LARMInput` sub-type.
- Changes to `evaluateRisk()` output shape.
- New region adapter package (`@openlarm/regions-*`).

### Spec Editors territory (always RFC)

Changes under the Spec Editors' scope in `GOVERNANCE.md`. In practice:

- Any normative clause in `spec/LARM-v2.0.md`.
- Addition of a new conformance level or test-vector family.
- Changes to the interoperability floating-point tolerance.

### Code TSC discretion (RFC optional but encouraged)

- New `@openlarm/core` public exports or changes to existing signatures.
- Major architectural refactors that touch more than ~5 files.
- Tooling changes that affect every contributor (lint rules, TypeScript
  strictness bumps, module resolution, monorepo layout).

### What does NOT need an RFC

- Typos, broken links, formatting.
- Test additions that don't change expected outputs.
- Non-behaviour-changing refactors internal to `@openlarm/core`.
- Dependency bumps (Dependabot handles these).
- Changes to internal-only docs and guides.

If you're unsure, open a discussion or a draft issue first and ask.

---

## How to write an RFC

1. Copy `rfcs/0000-template.md` to a new file.
2. Rename using the next unused number and a short kebab-case slug —
   for example `rfcs/0007-add-edr-lookup-smoothing.md`. RFC numbers
   are assigned in PR order; if there's a race, the reviewer assigns
   a number at merge time.
3. Fill in every section. Sections you think don't apply should still
   be addressed with a one-line "N/A — reason".
4. Open a pull request titled `RFC NNNN: <short title>`.
5. Do not commit the implementation in the same PR as the RFC. RFCs
   and their implementations are reviewed in separate PRs so the
   discussion stays focused.

Drafts are welcome. Mark the PR "Draft" in GitHub; reviewers will still
comment but won't block on polish until you un-draft.

---

## How it gets reviewed

1. **Triage (1–7 days).** Any maintainer labels the RFC with the
   committee that owns it: `model-governance`, `spec-editors`, or
   `code-tsc`.
2. **Public review (minimum 10 days).** The PR stays open for at least
   ten calendar days to give the community time to comment. The
   minimum can be waived only for clearly time-sensitive safety
   corrections, and only by the quorum that would otherwise approve
   the change.
3. **Committee decision.** The owning committee follows its own
   threshold from `GOVERNANCE.md`:
   - Code TSC — simple majority of committee members.
   - Model Governance — **unanimous consent** of all committee
     members. A single sustained objection blocks the RFC until
     resolved.
   - Spec Editors — consensus of all spec editors; if Spec Editors
     and Model Governance disagree, both must co-sign.
4. **Outcome.** The RFC is marked `accepted`, `declined`, or
   `deferred`. An accepted RFC is merged to `rfcs/` with its number
   preserved. A declined RFC is closed with a brief written rationale
   in the PR. A deferred RFC is closed and re-opens when the blocking
   prerequisite lands.
5. **Implementation tracking.** Each accepted RFC gets a tracking
   issue. The implementation PR references the tracking issue and the
   RFC number in its description.

---

## Amendments

Accepted RFCs are historical records. If the design turns out to be
wrong or incomplete, open a **new RFC** that supersedes the old one;
do not edit the old RFC text. The new RFC should cite its predecessor
in its "Prior art" section.

Minor editorial fixes to accepted RFCs (typos, broken links, updated
references) may be landed without a new RFC.

---

## References

- [IETF RFC 2026](https://www.rfc-editor.org/rfc/rfc2026) — the
  original RFC process, from which this is adapted.
- [Rust RFC process](https://github.com/rust-lang/rfcs) — a good
  working example of a language-community RFC process.
- [Kubernetes KEP process](https://github.com/kubernetes/enhancements)
  — a good example of a product-community RFC process.
