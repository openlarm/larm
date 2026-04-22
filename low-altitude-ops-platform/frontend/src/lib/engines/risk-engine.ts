// Thin re-export. The pure engine lives in @openlarm/core.
// buildingSiteFromMission and operationalContextFromMission stay here
// because they take Mission — an app-layer type not part of core.

export { evaluateRisk, type EvaluateRiskOptions } from "@openlarm/core"

import type { Mission } from "../types"
import type {
  BuildingSiteInput,
  OperationalContextInput,
  Complexity,
} from "@openlarm/core"

export function buildingSiteFromMission(mission: Partial<Mission>): BuildingSiteInput {
  const bld = mission.building
  const facades = mission.facades ?? []

  const dominant: Complexity =
    facades.some(f => f.complexity === "heavy")  ? "heavy"  :
    facades.some(f => f.complexity === "medium") ? "medium" : "light"

  const rooftop_condition =
    bld?.rooftop_access === "Good"         ? "good"          :
    bld?.rooftop_access === "Limited"      ? "limited"       :
    bld?.rooftop_access === "NotAvailable" ? "not_available" : null

  return {
    site_altitude_m:     mission.address?.altitude_m ?? 10,
    building_floors:     bld?.height_floors ?? null,
    building_height_m:   bld?.height_m ?? null,
    facade_complexity:   dominant,
    clearance_m:         bld?.clearance_m ?? null,
    near_hv_power:       facades.some(f => f.high_risk_env) ? 1 : 0,
    near_base_station:   bld?.near_base_station ?? 0,
    wind_channel_effect: bld?.wind_channel_effect ?? (facades.some(f => f.road_closure) ? 1 : 0),
    rooftop_condition,
    crowd_density:       bld?.crowd_density ?? null,
    region_exposure:     bld?.region_exposure ?? null,
  }
}

export function operationalContextFromMission(
  mission: Partial<Mission>,
  timeWindow: "day" | "weekend" | "night" = "day",
): OperationalContextInput {
  return {
    time_window:                timeWindow === "night" ? "night" : "day",
    weekend:                    timeWindow === "weekend" ? 1 : 0,
    urgent_days:                null,
    road_closure_needed:        mission.facades?.some(f => f.road_closure) ? 1 : 0,
    multi_day_split:            null,
    operator_experience_level:  null,
    mission_days:               mission.selected_dates?.length ?? 1,
  }
}
