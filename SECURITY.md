# Security Policy

## Supported Versions

LARM is pre-release. The following versions receive security updates:

| Version | Supported |
|---|---|
| `main` (unreleased) | ✅ |
| `v0.1.x` (upcoming) | ✅ (once released) |
| pre-v0.1 internal / commercial builds | ❌ |

After the v0.1.0 release, we will support **the current minor and the
one immediately preceding it** for security patches. Older versions are
end-of-life (EOL) unless explicitly announced otherwise.

---

## Reporting a Vulnerability

### Please do NOT open public GitHub issues for security vulnerabilities.

Instead, report privately via one of the following channels:

1. **Preferred — GitHub Private Security Advisory**
   Visit https://github.com/openlarm/core/security/advisories/new
   (URL active once the `openlarm` GitHub organisation is registered).

2. **Email** — `security@openlarm.org`
   > ⚠️ This address becomes live after the `openlarm.org` domain is
   > registered (see `OPEN_SOURCE_DECISIONS.md` §7). Until then, please
   > use the temporary reporting channel on the repo owner's GitHub
   > profile, or open a confidential issue explicitly marked
   > `[SECURITY — REDACT BEFORE PUBLIC VIEW]` and a maintainer will
   > move it to a private advisory within 48 hours.

3. **PGP** — a PGP public key will be published alongside the first
   `v0.1.0` release tag. Until then, treat email as unencrypted; do not
   include exploit payloads in plain text.

### What to include

- **Description** of the vulnerability, including the affected version
  (git SHA or release tag) and component (`@openlarm/core`,
  `@openlarm/regions-*`, the Next.js demo app, CI pipeline, etc.)
- **Reproduction steps** — minimum input and environment needed.
- **Impact assessment** — what an attacker could achieve.
- **Suggested mitigation** (optional).
- **Your preferred credit** — name and/or handle for the advisory, or
  "anonymous" if preferred.

### What happens next

| Timeframe | Action |
|---|---|
| Within **3 business days** | Acknowledgement of receipt |
| Within **14 business days** | Initial triage (severity + scope + tentative fix plan) |
| Before public disclosure | Coordinated fix, advisory draft, CVE request if warranted |
| After fix ships | Public advisory via GitHub Security Advisories (GHSA) |

We aim to resolve critical vulnerabilities (CVSS ≥ 9.0) within **30 days**.
High-severity issues (CVSS 7.0–8.9) within **60 days**.
Lower-severity issues within **90 days** or the next minor release.

---

## Scope

Vulnerabilities **in scope** include:

- Logic errors in `@openlarm/core` that cause the model to return
  **unsafe GO decisions for unsafe inputs**, or valid NO-GO inputs to
  be incorrectly converted to GO (model integrity).
- Parameter-injection or override vulnerabilities that bypass hard stops
  (`wind ≥ 39 km/h`, `rain > 10 mm/h & prob > 60%`, `EDR > 0.8`).
- Supply-chain compromise (dependency poisoning, package-ownership
  hijack, malicious scripts in `postinstall`).
- Secret exposure (API keys for CWA/Open-Meteo/JMA leaked in commits,
  CI logs, or published packages).
- Cross-site scripting or other web vulnerabilities in the reference
  Next.js application.
- CI/CD pipeline compromise (GitHub Actions permission misuse, release
  signing bypass).

**Out of scope**:

- Issues requiring non-default and explicitly unsafe configurations
  (e.g. setting `hard_stop.wind_kmh` to 999 via param override —
  documented misuse).
- Missing aviation-regulation integrations for regions without a
  `@openlarm/regions-*` adapter (these are feature requests, not
  vulnerabilities).
- Real-world flight incidents caused by LARM's advisory output —
  LARM is decision support, not PIC replacement (see README Safety
  Notice).
- Weather API accuracy issues upstream of LARM (report to Open-Meteo /
  CWA / JMA directly).

---

## Safe Harbour

We support good-faith security research:

- You will not be subject to legal action if you follow this policy.
- You may test against your own deployments only — do **not** test
  against third-party LARM deployments without their permission.
- Do not access, modify, or exfiltrate data belonging to other users.
- Do not perform DoS / resource-exhaustion tests against hosted services.

---

## Acknowledgements

A security hall of fame will be maintained at
`docs/security/hall-of-fame.md` after the first credited disclosure.
