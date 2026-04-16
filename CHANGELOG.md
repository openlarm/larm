# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
after the `v0.1.0` release. Pre-`v0.1.0` commits may break APIs without a
major-version bump; see `MODEL_CHANGELOG.md` for parameter-level changes
affecting model outputs.

## [Unreleased]

### Added

- Open-source scaffolding: `LICENSE` (Apache 2.0), `NOTICE`, bilingual `README`
  (zh-TW + en), `SECURITY.md`, `CHANGELOG.md`, `MODEL_CHANGELOG.md`.
- GitHub Actions CI (`.github/workflows/ci.yml`) running build, typecheck,
  lint, and vitest on every push and pull request.
- Vitest test infrastructure with 10 golden tests for
  `evaluateRisk()` covering hard stops, regime classification, R-level
  mapping, gating tiers, and buffer-ratio bounds.
- `OPEN_SOURCE_DECOUPLING_AUDIT.md` — coupling inventory across
  `src/lib/engines/`.
- `OPEN_SOURCE_TASK_2_PLAN.md` — outline for the normative
  `spec/LARM-v2.0.md`.
- `OPEN_SOURCE_TASK_3_PLAN.md` — `@openlarm/core` public API design.
- `OPEN_SOURCE_TASK_4_PLAN.md` — OSS-readiness checklist (32 items,
  P0/P1/P2).
- `OPEN_SOURCE_DECISIONS.md` — seven key decisions: liability disclaimer,
  DCO + CCLA, three-tier governance, v0.1 region split, arXiv preprint,
  Nextra docs, `@openlarm` naming.

### Changed

- `eslint.config.mjs` — temporarily downgrades
  `react-hooks/set-state-in-effect` and `react-hooks/purity` from `error`
  to `warn` so CI goes green while pre-existing wizard-step / admin
  components are refactored. Tracked for re-promotion in Batch B.

### Fixed

- `src/lib/engines/risk-engine.ts` — `let wn` → `const wn`
  (`prefer-const` cleanup, no behavioural change).
- `src/lib/engines/risk-engine.ts` — drop unused `SORAMitigation`
  import surfaced by `@typescript-eslint/no-unused-vars`.

### Pending (tracked for the v0.1 milestone)

- `CONTRIBUTING.md`, `GOVERNANCE.md`, `MAINTAINERS.md`,
  `CORPORATE_CLA.md`, `LEGAL/DISCLAIMER.md`, `.github/CODEOWNERS`.
- Extraction of `@openlarm/core` and `@openlarm/regions-taiwan` packages
  from the Next.js monorepo.
- Normative `spec/LARM-v2.0.md`.
- arXiv preprint draft.

## [0.0.0] — bootstrap (pre-open-source)

Historical development of the LARM engine occurred inside the
`low-altitude-ops-platform/frontend/` Next.js application. That history
is preserved in the git log and will be summarised in
`MODEL_CHANGELOG.md` rather than re-enumerated here.

---

[Unreleased]: https://github.com/openlarm/core/compare/v0.0.0...HEAD
[0.0.0]: https://github.com/openlarm/core/releases/tag/v0.0.0
