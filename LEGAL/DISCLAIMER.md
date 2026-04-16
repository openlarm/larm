# Authoritative Safety Notice and Disclaimer

> **Status: DRAFT — pending review and final wording by a licensed
> attorney before the v0.1.0 release.** This document is the
> authoritative version once finalised; the Safety Notice excerpts
> embedded in `README.md`, `README.en.md`, and `@openlarm/core`
> package READMEs are non-binding paraphrases pointing here.

This file applies to the entire LARM project — the model, the
specification, the reference implementation, and any region-adapter
packages — collectively referred to as "the Project" or "LARM".

---

## 1. What LARM is and is not

LARM is a **decision-support tool**: a deterministic numerical model
that translates a set of inputs about weather, building, operational
context, and equipment into a recommended risk classification (R0–R4)
and a recommended decision (GO / CONDITIONAL / NO-GO).

LARM is:

- An advisory aid for trained drone operators and planners.
- An open specification anyone may implement, adapt, or extend under
  the terms of the [Apache License 2.0](../LICENSE).

LARM is **NOT**:

- A regulatory compliance certification.
- A flight-safety guarantee or warranty.
- A substitute for the judgement of the Pilot-in-Command (PIC) at the
  time of operation.
- A substitute for compliance with any applicable aviation laws,
  regulations, airspace restrictions, manufacturer guidelines,
  insurance requirements, or local ordinances.
- An approved or endorsed tool of any civil aviation authority,
  including but not limited to the CAA (Taiwan), FAA (United States),
  EASA (European Union), ICAO, JCAB (Japan), CAAC (China), CAAS
  (Singapore), or any other jurisdiction's regulator.
- An ATC (Air Traffic Control) coordination tool.
- A real-time monitoring or surveillance system.
- A replacement for SORA, JARUS, OPM, or any other recognised
  operational risk-assessment methodology — though LARM may
  incorporate concepts from these methodologies as documented in
  `NOTICE`.

---

## 2. Allocation of responsibility

By using LARM in any form (running the code, consuming the spec,
deploying a derivative, or relying on its output) you agree that:

1. **The PIC bears full responsibility** for every flight decision,
   regardless of what LARM outputs.
2. **The operating organisation bears full responsibility** for
   ensuring LARM's outputs are evaluated by appropriately trained
   personnel and integrated into the organisation's safety management
   system.
3. **You are responsible for verifying** that LARM's parameters are
   appropriate for your jurisdiction, climate region, equipment, and
   operating context. The shipped Taiwan calibration
   (`@openlarm/regions-taiwan`) is **not** automatically applicable
   elsewhere.
4. **LARM does not collect, transmit, or store** flight or operational
   data on your behalf. Anything your deployment chooses to log is
   your responsibility, including compliance with applicable data
   protection laws.

---

## 3. Limitations of the model

The Model Governance Committee actively works to identify and
document the model's known limitations. Operators should be aware
that:

- **Calibration is regional.** The default parameter set is calibrated
  against subtropical (Taiwan) conditions and historical operational
  outcomes from the founder's commercial work. Other climates,
  topographies, or operation types may require recalibration before
  the model's outputs are meaningful.
- **Weather inputs depend on third-party data.** Errors,
  unavailability, or latency in upstream weather APIs (Open-Meteo,
  ECMWF, CWA, JMA) propagate to LARM's outputs.
- **Hard stops are necessary but not sufficient.** Wind ≥ 39 km/h,
  rain > 10 mm/h with > 60% probability, and EDR > 0.8 trigger a
  forced NO-GO. Conditions below these thresholds are **not**
  automatically safe; the broader R-score and PIC judgement still
  apply.
- **The model has no awareness** of: airspace clearances, NOTAMs,
  TFRs, ATC instructions, current battery state of the airframe,
  payload constraints beyond what is supplied as input, electromagnetic
  interference sources beyond declared HV power and base stations,
  bird activity, or other-aircraft proximity.
- **Equipment scoring is only as good as the input.** LARM trusts the
  equipment health flags it is given. Deferred maintenance not
  reflected in the input will not be reflected in the output.
- **Model parameters change over time.** Each version is documented in
  `MODEL_CHANGELOG.md`. A decision computed under one version may
  differ from the same input computed under a later version.

---

## 4. Disclaimer of warranties

LARM is distributed on an **"AS IS" basis, without warranties or
conditions of any kind, either express or implied**, including but not
limited to warranties of:

- merchantability;
- fitness for a particular purpose;
- non-infringement of third-party rights;
- accuracy, completeness, currency, or reliability of outputs;
- uninterrupted or error-free operation;
- compatibility with any specific drone, ground-control station,
  payload, or third-party software;
- conformance to any specific regulatory regime.

This disclaimer is in addition to the disclaimer of warranty in
Section 7 of the Apache License 2.0 and applies to the same scope.

---

## 5. Limitation of liability

To the maximum extent permitted by applicable law, in no event and
under no legal theory shall any contributor, maintainer, committee
member, or distributor of LARM be liable for any damages — including
direct, indirect, special, incidental, consequential, exemplary, or
punitive damages, or for loss of profits, revenue, data, goodwill, use,
property, or business — arising from, or in connection with, the use
or inability to use LARM or its outputs, even if advised of the
possibility of such damages.

This includes (without limitation) damages arising from:

- Reliance on LARM's GO / CONDITIONAL / NO-GO output.
- Errors or omissions in LARM's parameters or formulas.
- Errors or omissions in upstream weather or environmental data.
- Misclassification by the regime classifier or any other component.
- Any failure of LARM to anticipate or warn about a particular
  hazard.

This limitation is in addition to, and consistent with, Section 8 of
the Apache License 2.0.

> 🇹🇼 法務注意：在台灣《消費者保護法》或其他強行法規可能限制免責條款效力的範圍內，
> 上述限制以法律允許的最大範圍為準。本條款不主張排除任何不可免除之法定責任。

---

## 6. No professional advice

LARM does not constitute legal, regulatory, engineering, or
professional aviation-safety advice. For decisions with regulatory or
safety significance, consult the appropriate licensed professional
(aviation lawyer, certified flight instructor, or accredited safety
consultant) in your jurisdiction.

---

## 7. Specific high-risk uses

LARM is **not designed, tested, or authorised for**:

- Operations where failure of the model could directly result in loss
  of human life (e.g., search and rescue with extreme time pressure,
  manned-aircraft proximity assessment, or drone delivery directly
  over assemblies of people without fallback procedures).
- Critical infrastructure inspection where the inspection result is
  used as the sole basis for life-safety decisions (LARM evaluates
  drone-flight risk, not infrastructure-condition risk).
- Military, paramilitary, or weaponised operations.
- Any operation prohibited by the Apache License 2.0 or by applicable
  export-control regulations.

If your intended use case falls in or near these categories, consult
qualified safety professionals and the relevant aviation authority
before using LARM.

---

## 8. Regional and jurisdictional notices

### Taiwan (中華民國)

LARM is independently developed and is not endorsed by the 民用航空局
(Civil Aeronautics Administration) or the 中央氣象署 (Central Weather
Administration). Use of CWA forecast data via the optional CWA
integration requires a valid 氣象開放資料服務 API key obtained
directly from the CWA. Operators must comply with the 民用航空法
無人機專章 and any associated regulations.

### Other jurisdictions

LARM has not been certified or evaluated under FAA Part 107, EASA
SORA, JCAB unmanned-aircraft regulations, or the equivalent
framework in any other jurisdiction. Operators are responsible for
all applicable national, regional, and local regulatory compliance.

---

## 9. Changes to this notice

This notice may be amended by the joint quorum of all three
committees per `GOVERNANCE.md` §Amendment. Material changes will be
announced in the project changelog and via the project's public
communication channels. Continued use of LARM after a material change
constitutes acceptance of the revised notice.

---

## 10. Severability

If any provision of this notice is held to be invalid, illegal, or
unenforceable in any jurisdiction, the remaining provisions remain in
full force and effect, and the invalid provision is to be reformed to
the minimum extent necessary to make it enforceable while preserving
the original intent.

---

## 11. Contact

Questions about this notice should be addressed to the project
maintainers via:

- GitHub issue (general questions)
- `legal@openlarm.org` (placeholder; until the domain is registered,
  contact the founder via GitHub direct message)

---

> **Reminder.** This is a draft. Final wording is subject to lawyer
> review before the v0.1.0 release. Where this draft and any
> attorney-finalised version differ, the attorney-finalised version
> controls.
