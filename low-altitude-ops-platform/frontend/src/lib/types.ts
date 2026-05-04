// App-level type re-exports + augments.
//
// Core domain types (WeatherType, LARMInput, RiskResult, etc.) live in
// @openlarm/core. This file re-exports them so the 24+ in-app importers
// of "@/lib/types" keep working, then adds the app-only types below.

export type {
  WeatherType,
  RiskLevel,
  Decision,
  Complexity,
  PopulationDensityClass,
  SORAMitigation,
  EquipmentBlockCategory,
  EquipmentWarnCategory,
  RegionExposure,
  CrowdDensity,
  OperatorExperience,
  Weather30dInput,
  WeatherTodayInput,
  BuildingSiteInput,
  OperationalContextInput,
  Equipment,
  LARMInput,
  RiskResult,
  RiskExplanation,
  WeatherRegimeResult,
  LARMVersions,
  // CWA/JMA cross-validation types (used in WeatherTodayInput)
  CWAForecastDay,
  CrossValidationDivergence,
  CWACrossValidation,
  CWAObservation,
  CWACrossValidationMeta,
  JMAForecastDay,
  JMACrossValidation,
} from "@openlarm/core"

import type {
  Complexity,
  RegionExposure,
  CrowdDensity,
  WeatherType,
  RiskLevel,
  WeatherTodayInput,
  Weather30dInput,
  RiskResult,
} from "@openlarm/core"

// ─── App-only types (retained here) ─────────────────────────────────────────

// ─── Enums ──────────────────────────────────────────────────────────────────

export type MissionType = "Cleaning" | "Inspection" | "Coating" | "Solar" | "Other"
export type BuildingType = "commercial" | "luxury" | "house" | "factory" | "solar"
export type AirspaceStatus = "OK" | "NeedPermit" | "NoFly"
export type FacadeMaterial = "tile" | "stone" | "glass" | "metal" | "paint" | "solar"
export type Contamination = "dust" | "scale" | "mold" | "grease" | "bird" | "exhaust"
export type CleaningAgent = "soft" | "standard" | "deep"
export type TimeWindow = "day" | "weekend" | "night"
export type RooftopAccess = "Good" | "Limited" | "NotAvailable"
export type Supply = "Provided" | "SelfSupply"
export type QualCheckResult = "pass" | "fail" | "warn"
export type HealthStatus = "ok" | "warn" | "block"

// ─── Address ─────────────────────────────────────────────────────────────────

export interface AddressResult {
  raw: string
  lat: number
  lng: number
  altitude_m: number
  district: string
  city: string
  status: "success" | "failed"
}

// ─── Airspace ─────────────────────────────────────────────────────────────────

export interface AirspaceResult {
  status: AirspaceStatus
  reason?: string
  admin_days_added: number
  ruleset_version: string
}

// ─── Building ────────────────────────────────────────────────────────────────

export interface BuildingData {
  name?: string
  height_floors: number
  height_m: number
  building_type: BuildingType
  num_buildings?: number
  num_facades: number
  rooftop_access: RooftopAccess
  water_supply: Supply
  power_supply: Supply
  // LARM site inputs (captured in Step 3)
  region_exposure?: RegionExposure
  crowd_density?: CrowdDensity
  near_base_station?: 0 | 1
  wind_channel_effect?: 0 | 1
  clearance_m?: number
}

// ─── Facade ──────────────────────────────────────────────────────────────────

export interface FacadeData {
  id: string
  label: string // N / E / S / W or A / B / C
  area_m2: number
  material: FacadeMaterial
  complexity: Complexity
  road_closure: boolean
  tight_perimeter: boolean
  high_risk_env: boolean
  adjacent_trees: boolean     // 鄰樹：+5 NTD/㎡ (whole face)
  tree_area_m2: number        // m² covered by trees (0 if none)
  clean_tree_floors: boolean  // true → clean tree area at +10 NTD/㎡; false → exclude tree area
}

// ─── Weather ─────────────────────────────────────────────────────────────────

export interface WeatherDay {
  date: string // ISO
  weather_type: WeatherType    // LARM-computed W code (for display)
  risk_level: RiskLevel        // LARM-computed R level (for display / filtering)
  wind_ms: number              // display: wind_now_kmh / 3.6
  rain_prob: number            // 0-100; display: rain_prob_today_pct
  completion_prob: number      // 0-100; derived from LARM decision + buffer
  weather_today: WeatherTodayInput   // full LARM per-day input
}

// ─── Time Estimation ─────────────────────────────────────────────────────────

export interface TimeResult {
  baseline_productivity: number
  adjusted_productivity: number
  pure_operation_hours: number
  setup_minutes: number
  teardown_minutes: number
  rest_minutes: number
  buffer_minutes: number
  total_minutes: number
  suggested_days: number
  disruption_buffer_ratio: number
  time_model_version: string
  coefficient_snapshot: Record<string, number>
}

// ─── Pricing ─────────────────────────────────────────────────────────────────

export interface PricingLineItem {
  code: string
  label: string
  unit_price?: number
  area_m2?: number
  subtotal: number
}

export interface PricingResult {
  line_items: PricingLineItem[]
  subtotal: number
  multiplier: number
  multiplier_breakdown: Record<string, number>
  total: number
  currency: string
  quote_code: string
  valid_until: string
  pricing_version: string
  // v2.0: multiplier cap protection
  requires_manual_review?: boolean
  manual_review_note?: string
}

// ─── Mission (aggregate) ──────────────────────────────────────────────────────

export type MissionStatus =
  | "DRAFT"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "MISSION_READY"
  | "BLOCKED"
  | "COMPLETED"

export interface Mission {
  id: string
  status: MissionStatus
  created_at: string
  updated_at: string
  address?: AddressResult
  mission_type?: MissionType
  client_name?: string
  airspace?: AirspaceResult
  building?: BuildingData
  facades?: FacadeData[]
  selected_date?: string
  selected_dates?: string[]
  weather?: WeatherDay
  weather_30d?: Weather30dInput    // scenario 30d context; stored by Step 5 for Step 6
  risk?: RiskResult
  time_estimate?: TimeResult
  pricing?: PricingResult
}

// ─── Forecast Accuracy Training ──────────────────────────────────────────────

/** Single-day forecast record (stored in IndexedDB) */
export interface ForecastLogEntry {
  id: string                       // `${date}_${lead_days}_${location_key}`
  date: string                     // target date (YYYY-MM-DD)
  recorded_at: string              // ISO datetime when forecast was captured
  location_key: string             // "lat,lng" rounded to 0.01
  lead_days: number                // forecast lead time (1=tomorrow … 14)
  forecast: {
    wind_max_kmh: number
    wind_gust_kmh: number | null
    rain_prob_pct: number
    rain_sum_mm: number
    wind_p10_kmh: number | null
    wind_p90_kmh: number | null
    confidence: number | null
    source: "open-meteo" | "cwa" | "blended"
  }
  actual?: {
    wind_max_kmh: number
    wind_gust_kmh: number | null
    rain_sum_mm: number
    source: "archive" | "cwa-observation"
  }
  accuracy?: {
    wind_error_kmh: number         // forecast - actual (positive = overestimate)
    wind_abs_error_kmh: number     // |wind_error|
    rain_error_mm: number          // forecast - actual
    rain_hit: boolean              // whether rain/no-rain was predicted correctly (threshold ≥1mm)
  }
}

/** Per-bucket bias statistics */
export interface BiasStats {
  wind_bias_kmh: number            // mean error (positive = model overestimates)
  wind_mae_kmh: number             // Mean Absolute Error
  rain_bias_pct: number            // mean rain amount error (mm)
  rain_hit_rate: number            // fraction of correct rain/no-rain calls (0..1)
  rain_prob_bias?: number          // v2.0: mean rain probability bias (forecast% − actual_occurred×100)
  sample_count: number
}

/** Bias correction coefficients per location */
export interface ForecastBiasCorrection {
  location_key: string
  updated_at: string
  sample_count: number
  buckets: {
    lead_1_3: BiasStats
    lead_4_7: BiasStats
    lead_8_14: BiasStats
  }
}

/** Summary for Monitor dashboard */
export interface ForecastAccuracySummary {
  location_key: string
  period_days: number              // lookback window (30/60/90)
  overall_wind_mae: number
  overall_rain_hit_rate: number
  trend: "improving" | "stable" | "degrading"
  buckets: ForecastBiasCorrection["buckets"]
  daily_mae: Array<{ date: string; mae: number }>  // for sparkline chart
}

// ─── Seasonal Forecast (Copernicus CDS via Open-Meteo) ──────────────────────

/** Monthly seasonal forecast from ECMWF SEAS5 */
export interface SeasonalForecast {
  month: string                    // "2026-04"
  wind_max_p10: number             // km/h
  wind_max_p50: number
  wind_max_p90: number
  rain_sum_p10: number             // mm (monthly total)
  rain_sum_p50: number
  rain_sum_p90: number
  temp_max_p50: number             // °C
}

// ─── JMA Cross-Validation ───────────────────────────────────────────────────
// (JMAForecastDay and JMACrossValidation are re-exported from @openlarm/core above)

// ─── Wizard state ─────────────────────────────────────────────────────────────

export interface WizardState {
  currentStep: number
  mission: Partial<Mission>
}
