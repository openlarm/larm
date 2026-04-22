# @openlarm/core

## 0.1.0-alpha.0

### Minor Changes

- Initial public release — `v0.1.0-alpha.0`.

  `@openlarm/core` exposes the region-agnostic LARM (Low Altitude Risk Model)
  reference implementation: `evaluateRisk`, component scorers (WeatherNow,
  G-score, O-score, E-score), `mergeParams`/`resolveParams`/`registerParams`,
  and every core type.

  `@openlarm/regions-taiwan` exposes the Taiwan parameter calibration
  (`TAIWAN_PARAMS_V1_0`, `TAIWAN_PARAMS_V2_0`, `TAIWAN_PARAMS_ACTIVE`). v2.0
  reflects the current production model (SORA 2.5 GRC integration, EDR hard
  stop at 0.8, recalibrated component scales). See `spec/LARM-v2.0.md` and
  `MODEL_CHANGELOG.md` for details.

  Both packages target Node ≥ 20 and ship ESM + CJS + `.d.ts`.
