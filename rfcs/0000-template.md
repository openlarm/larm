# RFC NNNN: <short title>

- **Feature name:** kebab-case-identifier
- **Start date:** YYYY-MM-DD
- **Owning committee:** Code TSC / Model Governance / Spec Editors
- **Status:** Draft / In review / Accepted / Declined / Deferred / Superseded
- **Related issue:** #NNN (tracking issue)
- **Related PR:** #NNN (this RFC's PR)
- **Supersedes:** RFC NNNN (if applicable)
- **Superseded by:** RFC NNNN (if applicable; fill in retroactively)

---

## Summary

One paragraph (≤ 150 words) that a busy reviewer can read to decide
whether they need to dig in. State what changes, who's affected, and
why now.

---

## Motivation

Why are we doing this? What use case does it unlock or what problem
does it fix? Include:

- The scenario today (what can't be done, or what's painful).
- Who feels the pain (operators, region adapters, downstream
  implementers, auditors).
- Why this is the right moment — is there external pressure (a new
  regulation, a validation study result), or is this purely internal
  maintenance?

Keep it concrete. Avoid "it would be nice to have". Link evidence
(issues, incident reports, validation runs, papers) rather than
asserting.

---

## Guide-level explanation

Explain the change as if you were teaching it to someone who will use
it — a drone operator, a region-adapter author, a downstream
integrator. Include:

- A worked example with inputs and expected outputs.
- How existing concepts are affected or reinterpreted.
- What an error or edge case looks like to the end user.
- How this interacts with the Safety Notice (see
  `LEGAL/DISCLAIMER.md`) — does it change what LARM can or cannot
  claim?

No internal implementation details at this level. That belongs in the
reference-level explanation below.

---

## Reference-level explanation

The precise technical content.

### Normative changes

Every MUST / SHOULD / MAY clause added to or removed from the spec,
quoted verbatim. If the RFC changes formulas or parameter values,
give the before / after in side-by-side tables.

### API changes (if applicable)

TypeScript signatures, Zod schemas, or JSON Schema fragments. Flag
every breaking change with **Breaking:**.

### Parameter changes (if applicable)

Table:

| Parameter | Old value | New value | Range | Rationale |
|---|---|---|---|---|

If the RFC is `Model Governance` territory, every numeric change must
be accompanied by either:

- an empirical citation (validation study, incident-rate analysis,
  meteorological standard), or
- an explicit `[heuristic]` tag with a short rationale, matching the
  style already used in `spec/LARM-v2.0.md` Appendix A.3.

### Test-vector impact

- Which conformance test vectors change?
- Are new vectors needed? List them.
- Which existing vectors become inapplicable? List them and explain
  the migration.

---

## Backwards compatibility

Answer all of:

1. Does this change `evaluateRisk()` output for any existing valid
   input? If yes, for which inputs and by how much (worst case and
   typical case)?
2. Does this break existing type signatures, schema shapes, or CLI
   invocations? If yes, migration steps.
3. Does this require an upgrade of a region-adapter package? If yes,
   which packages and how.
4. What's the deprecation path for anything being removed? (Typical
   path: deprecate in MINOR N, remove in MAJOR N+1.)

If the answer to any of 1–3 is "yes", the RFC MUST bump the model
`MAJOR` version per `MODEL_CHANGELOG.md`'s versioning rules.

---

## Rationale and alternatives

- Why is this design the best in the space of possible designs?
- What other designs were considered and why were they rejected?
- What's the impact of not doing this?

Include a "do nothing" alternative. It's a legitimate outcome.

---

## Prior art

Papers, regulations, other risk-assessment frameworks (SORA, JARUS,
OPM), or other open-source projects that have solved this problem.
One paragraph per source, with citation.

If this RFC supersedes a previous one, cite it here and summarise what
changed.

---

## Unresolved questions

Questions the RFC author knows they can't answer yet but need to be
answered before (or shortly after) acceptance. Each should be
actionable — "Alice will benchmark this by YYYY-MM-DD" rather than
"someone should look into this".

---

## Future possibilities

Natural extensions that this RFC intentionally does NOT cover, but
which become easier once it lands. Keep this short — it's context, not
a commitment.

---

## Security and safety considerations

- Does this change affect hard-stop thresholds, R-level boundaries, or
  any gating rule?
- Could a bad actor exploit this change to produce a falsely
  permissive output?
- Does this affect what operators should be told in the Safety Notice?

If the answer to any of the above is "yes", Spec Editors and the Model
Governance Committee MUST both co-sign the RFC before acceptance.
