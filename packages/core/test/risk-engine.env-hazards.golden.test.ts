// Golden tests for v2.1 RFC Recommendation A:
// param-ization of g_score env-hazards (env_raw block in §5.3.4).
//
// Two scenarios:
//   (a) defaults preserve v2.0 baseline
//   (b) override raises env-hazards contribution by the expected delta

import "./setup-taiwan.ts"

import { describe, it, expect } from "vitest"
import { evaluateRisk, resolveParams } from "../src/index.ts"
import type { LARMInput } from "../src/index.ts"

const benignInput: LARMInput = {
  weather_30d: {
    wind_mean_kmh: 8, wind_p90_kmh: 20, gust_p90_kmh: null,
    rain_days_30: 3, heavy_rain_days_30: 0,
    instability_index: 0.2, predictability_score: 0.85,
  },
  weather_today: {
    wind_now_kmh: 5, gust_now_kmh: null,
    rain_prob_today_pct: 10, rain_mmph_forecast: 0,
    thunder_risk: 0, forecast_confidence: 80,
  },
  building: {
    site_altitude_m: 15, building_floors: 8, building_height_m: 28,
    facade_complexity: "light", clearance_m: 5,
    near_hv_power: 1, near_base_station: 1, wind_channel_effect: 1,
    rooftop_condition: "good", crowd_density: "low", region_exposure: null,
  },
}

describe("evaluateRisk — v2.1 env-hazards param defaults preserve v2.0", () => {
  it("with default params, env_raw=4 saturates to env_score=3 (cap), g_score=7", () => {
    const r = evaluateRisk(benignInput)
    // structural: floors=8 → 0; alt=15 → 0; light → 2 → min(10,2) = 2
    // ground:    residential default = 2
    // tke:       floors=8 → 0.5; wind=5 → sqrt(0.5)≈0.71; corridor=1 → 1.4;
    //            floor(0.5×0.71×1.4) = floor(0.497) = 0
    // env_raw:   3 (hv) + 1 (base) + 0 (clearance=5 not <5) = 4
    // env_score: min(3, 4) = 3
    // interaction: floors=8 not >20 → 0; alt=15 not >300 → 0 → 0
    // env_interaction: min(4, 3+0) = 3
    // g_score = min(20, 2+2+0+3) = 7
    expect(r.g_score).toBe(7)
    const envExplanation = r.explanations?.find(
      (e) => e.factor === "環境危害",
    )
    expect(envExplanation).toBeDefined()
    expect(envExplanation!.note).toContain("上限3")
    expect(envExplanation!.note).toContain("高壓電+3")
    expect(envExplanation!.note).toContain("基地台+1")
  })
})

describe("evaluateRisk — v2.1 env-hazards param override raises score", () => {
  it("with env_hazards_cap=6, env_interaction_cap=8, near_hv_power=5, g_score rises by +3", () => {
    const baseParams = resolveParams("v2.0")!
    const overridden = resolveParams("v2.0", {
      g_score_config: {
        ...baseParams.g_score_config,
        env_hazards_cap: 6,
        env_interaction_cap: 8,
        env_hazard_points: {
          ...baseParams.g_score_config.env_hazard_points,
          near_hv_power: 5,
        },
      },
    })!

    const baseline = evaluateRisk(benignInput)
    const raised = evaluateRisk(benignInput, { params: overridden })

    // Override math:
    // env_raw   = 5 (hv) + 1 (base) + 0 (clearance=5) = 6
    // env_score = min(6, 6) = 6
    // env_interaction = min(8, 6+0) = 6
    // g_score = min(20, 2+2+0+6) = 10  → delta vs baseline (7) = +3
    expect(raised.g_score).toBe(10)
    expect(raised.g_score - baseline.g_score).toBe(3)
  })
})
