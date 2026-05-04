// Taiwan climate calibration for LARM.
// Importing this module has a side effect: it registers v1.0 and v2.0
// parameter sets with @openlarm/core's PARAM_REGISTRY so that
// `evaluateRisk(input)` (no explicit params) works out of the box.

import { registerParams } from "@openlarm/core"
import { TAIWAN_PARAMS_V1_0 } from "./v1.js"
import { TAIWAN_PARAMS_V2_0 } from "./v2.js"

registerParams("v1.0", TAIWAN_PARAMS_V1_0)
registerParams("v2.0", TAIWAN_PARAMS_V2_0)

export { TAIWAN_PARAMS_V1_0 } from "./v1.js"
export { TAIWAN_PARAMS_V2_0 } from "./v2.js"

/** Convenience pointer to the currently-recommended Taiwan calibration. */
export const TAIWAN_PARAMS_ACTIVE = TAIWAN_PARAMS_V2_0

export const REGIONS_TAIWAN_VERSION = "0.1.0-alpha.0"
