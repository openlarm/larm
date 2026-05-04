import type {
  LARMInput,
  OperationalContextInput,
  BuildingSiteInput,
  Equipment,
  WeatherType,
} from "@openlarm/core"
import type { DbWithSql } from "./queries/weather30d.js"
import { queryWeather30d } from "./queries/weather30d.js"
import { queryWeatherToday } from "./queries/weather-today.js"
import type { Freshness } from "./freshness.js"

export interface BuildOptions {
  lat: number
  lng: number
  when: Date
  mission_meta: {
    operational?: OperationalContextInput
    equipment?: Equipment[]
    site_overrides?: Partial<BuildingSiteInput>
    w_override?: WeatherType
    recent_typhoon_count?: number | null
    local_completion_adjustment?: number
  }
}

export interface BuildResult {
  input: LARMInput
  freshness: Freshness
  source_breakdown: Record<string, string>
}

const PLACEHOLDER_BUILDING: BuildingSiteInput = {
  site_altitude_m: 10,
  building_floors: null,
  building_height_m: null,
  facade_complexity: "medium",
  clearance_m: null,
  near_hv_power: 0,
  near_base_station: 0,
  wind_channel_effect: 0,
  rooftop_condition: null,
  crowd_density: null,
  region_exposure: null,
}

export async function buildLARMInput(
  db: DbWithSql,
  opts: BuildOptions,
): Promise<BuildResult> {
  const [w30d, today] = await Promise.all([
    queryWeather30d(db, opts),
    queryWeatherToday(db, opts),
  ])

  const input: LARMInput = {
    weather_30d: w30d,
    weather_today: today.input,
    building: { ...PLACEHOLDER_BUILDING, ...opts.mission_meta.site_overrides },
    operational: opts.mission_meta.operational,
    equipment: opts.mission_meta.equipment,
    w_override: opts.mission_meta.w_override,
    recent_typhoon_count: opts.mission_meta.recent_typhoon_count,
    local_completion_adjustment: opts.mission_meta.local_completion_adjustment,
  }

  return { input, freshness: today.freshness, source_breakdown: today.source_breakdown }
}
