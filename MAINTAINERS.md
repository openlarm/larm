# Maintainers

This file lists the current members of the LARM project's three
governance committees (see [`GOVERNANCE.md`](./GOVERNANCE.md)) and the
contact channels for each role.

> **Initial state.** Until the v0.1.0 release lands, all three
> committees are staffed by the founder. Diversifying membership is a
> project priority for the alpha phase. If you might be a fit, please
> reach out — see "Joining" in `GOVERNANCE.md` §Membership.

---

## Code TSC (Technical Steering Committee)

Owns code architecture, build tooling, CI/CD, and packaging.

| GitHub | Name | Role | Joined | Affiliation |
|---|---|---|---|---|
| [@mkkb2156](https://github.com/mkkb2156) | _(real name TBD)_ | Founder, chair | 2025-09 | Independent |

**Contact**: file an issue and CC `@mkkb2156`. Once
`tsc@openlarm.org` is live, that becomes the preferred channel.

---

## Model Governance Committee

Owns parameter values, R-level boundaries, hard stops, WR matrix, and
all `@openlarm/regions-*` calibration data.

| GitHub | Name | Role | Joined | Domain expertise |
|---|---|---|---|---|
| [@mkkb2156](https://github.com/mkkb2156) | _(real name TBD)_ | Founder, chair | 2025-09 | Drone operations + model design |

**Contact**: see Code TSC. Until additional members join, model PRs go
to the same reviewer.

---

## Spec Editors

Owns normative wording in `spec/`, the RFC process, and generated API
documentation.

| GitHub | Name | Role | Joined |
|---|---|---|---|
| [@mkkb2156](https://github.com/mkkb2156) | _(real name TBD)_ | Founder, chair | 2025-09 |

The `spec/` directory itself does not yet exist; it will be created
when work on `LARM-v2.0.md` (per
[`OPEN_SOURCE_TASK_2_PLAN.md`](./OPEN_SOURCE_TASK_2_PLAN.md)) starts.

---

## Emeritus

No emeritus members yet.

---

## Joining

See `GOVERNANCE.md` §Membership for nomination criteria and
confirmation process. In short:

- Have a track record of contributions (~3+ months) in the relevant
  scope.
- Be nominated by an existing committee member.
- Be confirmed by the committee per its decision rule.

The Model Governance bar is intentionally higher: prior operational
drone-flight experience, a meteorology / aviation-safety background,
or sustained careful work on the model code.

---

## Conflict-of-interest disclosures

Members must disclose any direct financial or operational interest in
LARM's outputs (e.g. employment by a drone operator, equipment
manufacturer, or insurer that uses LARM). Disclosures appear here once
applicable. The founder's commercial application of LARM is documented
in the project README — see `README.md` §Current Status.

---

## Updates to this file

Changes to `MAINTAINERS.md` follow the rules in `GOVERNANCE.md`
§Membership. Adding a new member requires the corresponding committee's
approval; removing a member requires the high-bar removal procedure.
