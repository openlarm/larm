# Contributing to LARM

Thank you for your interest in contributing to LARM (Low Altitude Risk Model).
This guide tells you everything you need to know before opening your first PR.

> 🇹🇼 中文貢獻者：本指南目前只有英文版，但歡迎用繁體中文提交 issue / PR
> 描述。模型參數和規範術語請保留英文識別。

---

## Code of Conduct

By participating in this project you agree to abide by our Code of Conduct
(`CODE_OF_CONDUCT.md` — Contributor Covenant 2.1). In
short: be respectful, be patient, focus on the work. The Code of Conduct
applies in all project spaces (issues, PRs, discussions, chat, conferences).

Report violations to `conduct@openlarm.org` (placeholder until the domain
is registered — for now contact the repo owner via GitHub direct message).

---

## Before you start

LARM influences flight-safety decisions. Two practical implications:

1. **Model-changing PRs require extra review.** Anything that touches
   `src/lib/engines/weather-regime-params.ts`, `src/lib/engines/risk-engine.ts`,
   the eventual `spec/` directory, or the WR matrix / hard-stop thresholds
   is reviewed by the Model Governance Committee (see `GOVERNANCE.md`)
   under stricter rules than ordinary code changes.
2. **Open an issue first for non-trivial changes.** New parameters, new
   region adapters, or anything that could change `evaluateRisk()`
   output for an existing input deserves a design discussion before
   you write code. This is for your own protection — we don't want
   anyone burning a weekend on something we'd then have to ask them to
   redo.

Trivial changes (typos, broken links, formatting, dependency bumps,
tightening types) can go straight to a PR.

---

## Licensing & sign-off — DCO + CCLA

LARM is licensed under [Apache License 2.0](./LICENSE). Every contribution
must be licensable under the same terms. To make that legally clean we
follow a **dual-track** model — pick the one that matches your situation.

### Track 1 — Individual contributors: DCO

You sign each commit with the [Developer Certificate of Origin
(DCO) 1.1](https://developercertificate.org/). The full text reads:

> By making a contribution to this project, I certify that:
>
> (a) The contribution was created in whole or in part by me and I have
>     the right to submit it under the open source license indicated in
>     the file; or
>
> (b) The contribution is based upon previous work that, to the best of
>     my knowledge, is covered under an appropriate open source license
>     and I have the right under that license to submit that work with
>     modifications, whether created in whole or in part by me, under
>     the same open source license (unless I am permitted to submit
>     under a different license), as indicated in the file; or
>
> (c) The contribution was provided directly to me by some other person
>     who certified (a), (b) or (c) and I have not modified it.
>
> (d) I understand and agree that this project and the contribution are
>     public and that a record of the contribution (including all
>     personal information I submit with it, including my sign-off) is
>     maintained indefinitely and may be redistributed consistent with
>     this project or the open source license(s) involved.

You certify by adding a `Signed-off-by` trailer to every commit:

```bash
git commit -s -m "fix: typo in README"
```

This adds a line like:

```
Signed-off-by: Jane Doe <jane@example.com>
```

The name and email **must match** the author of the commit. Anonymous /
pseudonymous contributions are not accepted.

### Track 2 — Corporate contributors: CCLA

If you are contributing **as part of your job** or on behalf of an
employer, your company should sign the [Corporate Contributor
License Agreement (CCLA)](./CORPORATE_CLA.md) **once**, listing
authorised employees. After that all contributions from listed employees
are covered automatically — they no longer need DCO sign-off, but
including it anyway is fine.

To sign the CCLA, your authorised signatory should:

1. Read `CORPORATE_CLA.md`.
2. Email the signed PDF to `legal@openlarm.org` (placeholder; for now
   open a tracking issue and the maintainers will provide the current
   submission channel).
3. Wait for confirmation. We will add your company to a public
   `CCLA-signers.md` file and update CODEOWNERS or maintainer lists
   accordingly.

Until your CCLA is on file, your employees should use DCO sign-off.

---

## Development setup

### Prerequisites

- **Node.js 20** or later (matches CI; later 22.x also works)
- **npm 10** or later (bundled with Node 20)
- A POSIX shell (Linux, macOS, or WSL on Windows). Native Windows
  PowerShell is not actively tested but should mostly work.

### One-time setup

```bash
git clone https://github.com/openlarm/core.git           # or your fork
cd core/low-altitude-ops-platform/frontend
npm ci                                                    # exact lockfile install
```

### Daily commands

```bash
# from low-altitude-ops-platform/frontend/
npm run dev          # Next.js dev server on http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm test             # vitest (one-shot)
npm run test:watch   # vitest in watch mode
npm run build        # full production build (also typechecks)
```

CI runs all five non-`dev` commands on every PR — keeping them green
locally avoids surprises.

---

## Pull-request workflow

1. **Fork** the repository (use your personal namespace, not `openlarm`).
2. **Create a topic branch** off `main`. Naming convention:
   `<type>/<short-description>` where `<type>` is one of `feat`, `fix`,
   `docs`, `refactor`, `test`, `ci`, `chore`. Example:
   `feat/japan-region-adapter`.
3. **Make focused commits.** One logical change per commit. Do not bundle
   unrelated edits. Run `git rebase -i` to clean history before opening
   the PR.
4. **Write meaningful commit messages.** Use the
   [Conventional Commits](https://www.conventionalcommits.org/) style:

   ```
   feat(core): add edr_threshold parameter to hard-stop config

   Closes #123
   Signed-off-by: Jane Doe <jane@example.com>
   ```

5. **Run the full local CI** (`typecheck`, `lint`, `test`, `build`) before
   pushing. Pushing red commits wastes CI minutes and reviewer attention.
6. **Open the PR against `main`.** Fill in the PR template (lands in
   Batch B). Link any issue with `Closes #N` so it auto-closes on merge.
7. **Respond to review feedback** by adding new commits (do not rewrite
   already-pushed history; reviewers' inline comments lose context).
   Squash on merge handles the cleanup.
8. **A maintainer will merge** once required reviews are in. Default merge
   strategy is **squash-and-merge** to keep `main` linear and bisectable.

---

## Special PR rules

### Model-changing PRs

PRs that touch any of the following must have **Model Governance
Committee** approval (see `GOVERNANCE.md`):

- `src/lib/engines/weather-regime-params.ts`
- `src/lib/engines/risk-engine.ts`
- `src/lib/engines/model-helpers.ts`
- The eventual `spec/` directory
- The eventual `@openlarm/regions-*` packages

Such PRs **must** also:

- Update `MODEL_CHANGELOG.md` with a clear description of the
  parameter or rule change and its expected output impact.
- Add or update golden tests proving the change is intentional and
  bounded.
- Bump the relevant version string (`larm_version`,
  `weather_regime_params_version`, or `thresholds_version`) following
  the rules in `MODEL_CHANGELOG.md`.

### Spec PRs

PRs that touch `spec/` (once it lands) must be co-reviewed by the
**Spec Editors** committee. Substantive changes require an RFC; see
`rfcs/` (Batch B) for the template.

### Hard-stop changes

Changes to the hard-stop rules (wind ≥ 39 km/h, rain conjunction, EDR > 0.8)
require **unanimous Model Governance Committee approval** and a
documented justification posted to the PR description. The bar is
intentionally high.

### Region adapters

New `@openlarm/regions-*` packages must:

- Live in their own directory and be independently versionable.
- Include a `CALIBRATION.md` describing the source data, sample
  period, and validation approach.
- Pass the same vitest suite shape as `@openlarm/regions-taiwan` (the
  reference implementation).

---

## Filing good issues

Before you open one:

1. **Search existing issues**, including closed ones.
2. **Check the FAQ** in `docs/` (Batch B).
3. **Reproduce on `main`** if possible.

A good bug report includes:

- LARM version (`ruleset_version` from `evaluateRisk()` output, plus
  the git SHA you are running).
- Inputs that trigger the bug (a JSON snippet of `LARMInput` is
  ideal).
- Expected vs actual output.
- Any relevant environment details (Node version, OS, browser).

A good feature request describes the **operational problem** you are
trying to solve, not just the proposed solution. We may suggest a
different solution that fits the model better.

---

## Security issues

Do **not** open public issues for security vulnerabilities. See
[`SECURITY.md`](./SECURITY.md) for the private disclosure process.

---

## Documentation contributions

Documentation PRs are very welcome. Some notes:

- README and other top-level docs come in pairs: `README.md` (zh-TW)
  + `README.en.md` (English). Keep them in sync.
- Engineering / spec docs are English-primary; translations welcome
  in regional subdirectories (e.g. `docs/zh-TW/…`).
- Code samples in docs **must run** — broken examples will be flagged
  by the docs-test workflow (Batch B).

---

## Recognition

Every contributor is acknowledged in the project's collective
"The LARM Authors" copyright. Significant contributions may also earn:

- Membership in one of the three governance committees (see
  `GOVERNANCE.md`).
- Listing in `MAINTAINERS.md`.
- A note in the next release's `CHANGELOG.md`.

We do not currently use Allcontributors-style emoji recognition, but
may adopt it once the contributor count justifies it.

---

## Questions?

- Open a GitHub Discussion (Batch B) or a `question:` issue.
- For private inquiries, contact the repo owner via GitHub direct
  message until `hello@openlarm.org` is live.

Thanks again. Safe flying.
