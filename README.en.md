# LARM — Low Altitude Risk Model

> A **deterministic risk-assessment decision-support model** for low-altitude
> drone operations. Open specification + TypeScript reference implementation.
>
> **Model repo**: `openlarm/core` (upcoming) · **Spec**: `openlarm/spec` (upcoming) · **Docs**: docs.openlarm.org (upcoming)

🇹🇼 [繁體中文版](./README.md)

---

## ⚠️ Safety Notice

> **LARM is a decision-support tool, not a regulatory compliance certification.**
>
> - ❌ Does **NOT** guarantee flight safety
> - ❌ Is **NOT** a substitute for Pilot-in-Command (PIC) judgment
> - ❌ Is **NOT** approved or endorsed by CAA / FAA / EASA or any aviation authority
> - ✅ **MUST** be used alongside applicable aviation regulations in your jurisdiction
> - ✅ Operators bear **full responsibility** for all flight decisions
>
> Final wording is pending review by a licensed attorney before the v0.1 release.
> See [`LEGAL/DISCLAIMER.md`](./LEGAL/DISCLAIMER.md) for the authoritative draft.

---

## What is LARM?

LARM (Low Altitude Risk Model) is a **deterministic** risk-assessment model
designed for low-altitude drone operations — facade cleaning, inspection,
coating, solar-panel maintenance — that, given local climate, operational
context, equipment state, and personnel factors, computes for each mission:

- **R-score** (0–100 composite risk)
- **R-level** (R0 – R4)
- **Decision** (GO / CONDITIONAL-Tier / NO-GO)
- **Buffer ratio** (5% – 55% time buffer)
- **Completion probability** (5% – 99%)

Unlike simple single-threshold approaches ("wind > X km/h → no-go"), LARM
jointly weighs:

| Component | Description | Range |
|---|---|---|
| **Base(W)** | 30-day climate regime (W0–W5) | 3–22 |
| **WeatherNow** | Today's wind/rain + EDR turbulence | 0–42 |
| **G_score** | Ground/site risk (incl. SORA 2.5 iGRC) | 0–20 |
| **O_score** | Operational context (night/weekend/urgency/crowd/fatigue) | 0–12 |
| **E_score** | Equipment state (Block / Warn categories) | 0–8 |

---

## Current Status

| Item | Status |
|---|---|
| Engine version | **LARM v2.0** (SORA 2.5 GRC integration + EDR turbulence) |
| License | **Apache License 2.0** |
| Published packages | Planned (`@openlarm/core`, `@openlarm/regions-taiwan`) |
| Specification | In progress (`spec/LARM-v2.0.md`) |
| CI | ✅ build + typecheck + lint + vitest golden tests |
| v0.1 release | Targeting 2026 Q2–Q3 |

> Today the main code lives under `low-altitude-ops-platform/frontend/`
> (complete Next.js application). The standalone engine package
> (`@openlarm/core`) will be extracted from this monorepo at v0.1.

---

## Quick Start

### Run the existing Next.js app (requires Node.js 20+)

```bash
cd low-altitude-ops-platform/frontend
npm install
npm run dev      # http://localhost:3000
```

### Use the engine (once `@openlarm/core` is published)

```ts
import { evaluateRisk } from "@openlarm/core"
import { TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"

const result = evaluateRisk({
  weather_30d: { /* ... */ },
  weather_today: { wind_now_kmh: 18, rain_prob_today_pct: 20, /* ... */ },
  building: { site_altitude_m: 25, /* ... */ },
}, { params: TAIWAN_PARAMS_V2_0 })

console.log(result.risk_level, result.decision, result.buffer_ratio)
// → "R1", "GO", 0.12
```

---

## Documentation

| File | Audience | Content |
|---|---|---|
| [`README.md`](./README.md) | 繁中使用者 | Traditional Chinese version |
| [`CLAUDE.md`](./CLAUDE.md) | Maintainers / AI | Project structure and dev commands |
| `low-altitude-ops-platform/LARM_CONCEPT_GUIDE.md` | Business / management | Plain-language overview |
| `low-altitude-ops-platform/LARM_PARAM_GUIDE.md` | Operators / engineers | Parameter formulas and tuning |
| [`OPEN_SOURCE_DECOUPLING_AUDIT.md`](./OPEN_SOURCE_DECOUPLING_AUDIT.md) | Contributors | Decoupling audit |
| [`OPEN_SOURCE_TASK_2_PLAN.md`](./OPEN_SOURCE_TASK_2_PLAN.md) | Contributors | Spec document plan |
| [`OPEN_SOURCE_TASK_3_PLAN.md`](./OPEN_SOURCE_TASK_3_PLAN.md) | Contributors | `@openlarm/core` API design |
| [`OPEN_SOURCE_TASK_4_PLAN.md`](./OPEN_SOURCE_TASK_4_PLAN.md) | Contributors | OSS-readiness checklist |
| [`OPEN_SOURCE_DECISIONS.md`](./OPEN_SOURCE_DECISIONS.md) | Contributors | Key decisions record |
| [`CHANGELOG.md`](./CHANGELOG.md) | Everyone | Release notes |
| [`MODEL_CHANGELOG.md`](./MODEL_CHANGELOG.md) | Model users | Model parameter changes |
| [`SECURITY.md`](./SECURITY.md) | Security researchers | Vulnerability disclosure |

---

## Hard Stops

Even if all other conditions are favourable, any of the following
triggers a **forced NO-GO** that cannot be manually overridden:

- 🌪️ **Current wind ≥ 39 km/h**
- 🌧️ **Rain > 10 mm/h AND probability > 60%**
- 💨 **EDR (turbulence) > 0.8** (new in v2.0)
- 📈 **R_score > r4_nogo_threshold** (upper R4 band)

All hard stops are **non-policy technical thresholds** codified in the
LARM v2.0 specification.

---

## Contributing

Contributions welcome. Before opening a PR, please read:

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — DCO + CCLA workflow
- [`GOVERNANCE.md`](./GOVERNANCE.md) — Three-tier governance
- [`MAINTAINERS.md`](./MAINTAINERS.md) — Committee membership
- [`CORPORATE_CLA.md`](./CORPORATE_CLA.md) — Corporate CLA template (pending lawyer)
- [`LEGAL/DISCLAIMER.md`](./LEGAL/DISCLAIMER.md) — Full disclaimer draft
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) (upcoming) — Contributor Covenant 2.1

### Governance preview

| Committee | Scope |
|---|---|
| **Code TSC** | `@openlarm/core` API, architecture, performance |
| **Model Governance** | Parameters, W-code / R-level bounds, hard stops |
| **Spec Editors** | Normative wording of the specification |

Individual contributors use **DCO** (`Signed-off-by:` in commits).
Corporate contributors sign a **CCLA** once per entity; all their employees are covered.

---

## License

This project is licensed under the **[Apache License 2.0](./LICENSE)**.
Copyright is held collectively by **The LARM Authors** (all contributors).
See [`NOTICE`](./NOTICE) for third-party attributions and upstream data sources.

---

## Citation

For academic use, please cite (CITATION.cff and arXiv preprint will be
available after the v0.1 release):

```
The LARM Authors (2026). LARM: A Deterministic Low-Altitude Drone Operation
  Risk Model for Subtropical Climates with SORA 2.5 Integration.
  arXiv preprint (pending).
```

---

## Contact / Security

See [`SECURITY.md`](./SECURITY.md) for vulnerability reporting.
General questions: open a GitHub issue.
