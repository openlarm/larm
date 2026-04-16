# Project Governance

This document describes how decisions are made in the LARM project. It
applies once the project is publicly released; until v0.1.0 ships,
governance is exercised informally by the founder and serves primarily
as a written commitment about how things will work.

> **TL;DR**: three committees, each with a defined scope. Model
> parameter changes require stronger consensus than ordinary code
> changes because they directly influence flight-safety decisions.

---

## Why three committees

LARM mixes three categorically different artefacts under one project:

1. **Code** — the TypeScript implementation, build tooling, packaging.
   Bugs here have ordinary consequences.
2. **Model parameters & rules** — values and formulas that determine
   GO / CONDITIONAL / NO-GO decisions. Bugs here can directly
   contribute to flight incidents.
3. **Specification text** — the normative wording in `spec/` that
   third-party implementations must follow. Wording bugs propagate to
   every downstream implementer.

A single TSC reviewing all three would either (a) over-process code
changes to satisfy model-safety standards or (b) under-process model
changes to keep code velocity. Splitting the responsibility lets each
committee apply the right standard.

---

## The three committees

### 1. Code TSC (Technical Steering Committee)

**Scope**

- All files under `frontend/src/` **except** the model-governed paths
  listed below.
- Build system, lint config, CI/CD, packaging, release tooling.
- API design for `@openlarm/core`, `@openlarm/cli`, and any other
  non-model packages.
- Performance, refactoring, dependency management, security hardening
  (in coordination with the Security WG when one exists).

**Decision rule**

- **Simple majority** of voting members. Quorum is half the seated
  members rounded up.
- Lazy consensus accepted for routine PRs (no objection within 72
  hours = approved).

**Member responsibilities**

- Review and merge code PRs in scope.
- Maintain CI, release tooling, and developer docs.
- Adjudicate disputes between code contributors.

### 2. Model Governance Committee

**Scope**

- `src/lib/engines/weather-regime-params.ts`
- `src/lib/engines/risk-engine.ts`
- `src/lib/engines/model-helpers.ts`
- `MODEL_CHANGELOG.md`
- All `@openlarm/regions-*` packages and their calibration data
- Hard-stop thresholds and the WR matrix
- The numeric content of the spec (parameter values, R-level boundaries,
  formulas — but not the prose, which is owned by Spec Editors)

**Decision rule**

- **Unanimous consent** for changes affecting hard stops, R-level
  boundaries, or breaking changes to existing decisions.
- **Two-thirds approval** for non-breaking parameter additions or
  recalibrations.
- **Simple majority** for documentation-only edits to model docs.
- All decisions require a documented rationale entered into
  `MODEL_CHANGELOG.md` and, where appropriate, an RFC.

**Member responsibilities**

- Review every model-changing PR for safety implications.
- Maintain and validate the calibration data.
- Decide when a parameter change warrants a major model-version bump.
- Coordinate with Spec Editors when normative spec text needs updating.

### 3. Spec Editors

**Scope**

- Normative wording in `spec/LARM-v*.md`.
- The RFC process documents under `rfcs/`.
- API documentation generated from `@openlarm/core` source comments.

**Decision rule**

- **Two-thirds approval** of seated editors.
- All decisions require an open issue or RFC; silent changes to
  normative text are not allowed.

**Member responsibilities**

- Maintain spec clarity, accuracy, and internal consistency.
- Translate Model Governance decisions into normative spec language.
- Review every spec PR for ambiguity and conformance to RFC 2119
  language ("MUST", "SHOULD", "MAY").

---

## Membership

### Joining

Each committee maintains its own membership. New members are nominated
by an existing committee member and confirmed per that committee's
decision rule. Nominees should typically have a track record of
contributions in the relevant scope (~3+ months of active engagement
or a comparable demonstration of expertise).

The bar for **Model Governance** membership is intentionally higher:
nominees should demonstrate either (a) operational drone-flight
experience, (b) meteorological or aviation-safety background, or (c)
sustained, careful work on the model code with a clear track record of
catching subtle issues.

### Stepping down

Members may step down at any time by emailing the committee chair (see
`MAINTAINERS.md`). After 6 months of inactivity, a member is
automatically moved to "emeritus" status and loses voting rights;
re-activation requires a new confirmation.

### Removal

A member may be removed for repeated Code-of-Conduct violations or
demonstrated bad-faith conduct, by **two-thirds vote** of the rest of
the committee, **plus** ratification by either of the other two
committees. This high bar is intentional.

### Cross-committee membership

A person may serve on multiple committees. In Year 1 it is expected
that the founder serves on all three. As contributors join, we will
work to diversify membership.

### Conflict of interest

Committee members **must** recuse themselves from decisions where they
have a direct financial or operational interest (e.g. an employer
shipping a competing product). Recusal is logged in the PR or issue
thread.

---

## Decision-making process

### Routine changes

Most PRs are reviewed by the relevant committee using normal GitHub
review tools. Approval thresholds (above) determine when a PR can be
merged. CODEOWNERS routes PRs to the right reviewers automatically.

### Significant changes — RFCs

A change is **significant** if any of the following apply:

- Adds, removes, or renames a public API.
- Changes a model parameter that could flip a previously GO input to
  NO-GO (or vice versa) for realistic operational scenarios.
- Introduces a new dependency in the runtime path of `@openlarm/core`.
- Modifies governance, licensing, or contribution policy.
- Adds a new region adapter or modifies an existing one's
  calibration source.

Significant changes require an **RFC** (Request for Comments):

1. Open a draft PR adding a new file under `rfcs/NNNN-short-title.md`
   following the template (Batch B).
2. The RFC sits in `Open` status for **at least 14 days** during which
   it is publicly discussable.
3. The relevant committee then makes a decision per its decision rule.
4. The decision is recorded in the RFC file under a `## Disposition`
   section.

### Disputes & appeals

If a contributor disputes a committee decision they may:

1. Re-raise in the next committee meeting (committees should meet at
   least quarterly once they have multiple members).
2. Escalate to the **joint quorum** — a meeting of all three
   committees, who may overturn a single-committee decision by
   two-thirds majority of joint attendees.
3. There is no further appeal mechanism. Joint-quorum decisions are
   final.

---

## Meetings & communications

- **Async-first.** Most decisions happen via PR/issue review.
- **Regular meetings.** Each committee should meet at least quarterly
  once it has 3+ members. Meetings are public; agendas posted in the
  relevant GitHub Discussions category 7+ days in advance.
- **Notes are public.** Meeting notes are committed to
  `governance/meeting-notes/YYYY-MM-DD-<committee>.md` (directory
  lands when the first meeting happens).

---

## Releases

Release authority is delegated to the **Code TSC**, but model-version
bumps must be co-signed by the **Model Governance Committee**:

| Release type | Authority |
|---|---|
| Patch (`x.y.z+1`) — code-only fixes | Code TSC alone |
| Minor (`x.y+1.0`) — features, no model changes | Code TSC alone |
| Minor (`x.y+1.0`) — model-parameter additions | Code TSC + Model Gov |
| Major (`x+1.0.0`) — any breaking change | All three committees |
| Spec release (`spec-v1.x`) | Spec Editors + Model Gov |

Release procedure is automated via `.github/workflows/release.yml`
(Batch B); committees authorise releases by approving the release PR.

---

## Amending this document

Changes to `GOVERNANCE.md` are themselves significant changes. They
require an RFC and **all three committees**' approval (per their
respective decision rules).

---

## Initial state (pre-v0.1)

Until the v0.1.0 release lands, all three committees consist of one
person (the founder). This is documented in `MAINTAINERS.md`. The
intention is to populate the committees with external members during
the alpha and beta phases.

The single-person phase is deliberately short. If you read this
document and think you might be a fit for one of the committees,
please reach out — diversifying governance early is a project priority.
