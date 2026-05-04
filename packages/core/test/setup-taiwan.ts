// Test-only helper: loads the Taiwan parameter defaults into core's
// PARAM_REGISTRY so tests can call evaluateRisk(input) without passing
// options.params. Imported by each test suite that needs the defaults.

import { registerParams } from "../src/params/registry.ts"
import { TAIWAN_PARAMS_V1_0, TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"

registerParams("v1.0", TAIWAN_PARAMS_V1_0)
registerParams("v2.0", TAIWAN_PARAMS_V2_0)
