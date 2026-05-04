---
name: Region adapter proposal
about: Propose a new @openlarm/regions-* adapter (e.g. regions-japan)
title: "[adapter] "
labels: ["adapter", "needs-rfc"]
assignees: []
---

<!--
Proposing a new region adapter is a Model-Governance-scope change and
eventually requires an RFC. File this issue first to start the
conversation; the RFC comes later once the rough shape is agreed.

Read `spec/LARM-v2.0.md` §10.3 (Region adapter specification) before
filing.
-->

## Proposed adapter

- **Package name:** `@openlarm/regions-<slug>`
- **Region:** <country / jurisdiction / climate zone>
- **Intended calibration reference:** <which operators' data, which
  climate datasets, which regulatory framework>

## Motivation

Why does this region need its own adapter rather than using the
Taiwan calibration or a neighbouring adapter?

Concrete examples of inputs where the Taiwan calibration gives a
misleading output in your region are very welcome.

## Climate profile

Brief summary — prevailing winds, monsoon / cyclone season, heavy-rain
frequency, typical operating altitudes, typical building geometry.
One paragraph.

## Regulatory context

- National aviation authority (FAA, EASA, JCAB, CAAC, etc.).
- Any jurisdiction-specific hard limits that should be added to the
  adapter's hard-stop defaults.
- Any jurisdiction-specific restrictions on what LARM may or may not
  claim in its output.

## Calibration source

- Dataset(s) you intend to calibrate against (size, time range,
  provenance).
- Whether you have authorisation to use these datasets for this
  purpose.
- Whether you plan to publish an accompanying validation report.

## Maintainership

- [ ] I am the maintainer-designate for this adapter.
- [ ] Another named maintainer is `@<handle>`.
- [ ] No maintainer identified yet; looking for collaborators.

## Parameter deltas

A table (even rough) of which parameters you expect to change from the
Taiwan calibration, with best-guess new values. This is for discussion
— the actual calibration comes later.

| Parameter | Taiwan (v2.0) | Proposed (this region) | Why |
|---|---|---|---|

## Related work

Prior art — other risk models calibrated for this region, academic
literature, existing internal tools.
