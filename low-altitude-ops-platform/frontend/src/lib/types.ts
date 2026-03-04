// ─── Enums ──────────────────────────────────────────────────────────────────

export type MissionType = "Cleaning" | "Inspection" | "Coating" | "Solar" | "Other"
export type BuildingType = "commercial" | "luxury" | "house" | "factory" | "solar"
export type AirspaceStatus = "OK" | "NeedPermit" | "NoFly"
export type WeatherType = "W0" | "W1" | "W2" | "W3" | "W4" | "W5"
export type RiskLevel = "R0" | "R1" | "R2" | "R3" | "R4"
export type Decision = "GO" | "CONDITIONAL" | "NO_GO"
export type FacadeMaterial = "tile" | "stone" | "glass" | "metal" | "paint" | "solar"
export type Complexity = "none" | "light" | "medium" | "heavy"
export type Contamination = "dust" | "scale" | "mold" | "grease" | "bird" | "exhaust"
export type CleaningAgent = "water" | "neutral" | "acid" | "alkali"
export type TimeWindow = "day" | "weekend" | "night"
export type RooftopAccess = "Good" | "Limited" | "NotAvailable"
export type Supply = "Provided" | "SelfSupply"
export type QualCheckResult = "pass" | "fail" | "warn"
export type HealthStatus = "ok" | "warn" | "block"

// ─── LARM v1.0 Input Types ────────────────────────────────────────────────────

export type RegionExposure = "windward" | "leeward" | "coastal" | "rooftop_open"
export type CrowdDensity = "low" | "medium" | "high"
export type OperatorExperience = "junior" | "mid" | "senior"

/** Rolling 30-day weather statistics (regime context) */
export interface Weather30dInput {
  wind_mean_kmh: number
  wind_p90_kmh: number
  gust_p90_kmh: number | null
  rain_days_30: number           // days with ≥1 mm
  heavy_rain_days_30: number     // days with ≥20 mm
  instability_index: number      // 0..1
  predictability_score: number   // 0..1 (higher = more stable / predictable)
}

/** Today's forecast / real-time weather */
export interface WeatherTodayInput {
  wind_now_kmh: number
  wind_p10_kmh?: number          // Ensemble P10 wind (optimistic bound), km/h
  wind_p90_kmh?: number          // Ensemble P90 wind (conservative bound), km/h
  gust_now_kmh: number | null
  rain_prob_today_pct: number    // 0..100
  rain_mmph_forecast: number     // 1-hr rain rate (mm/h)
  thunder_risk: 0 | 1 | null
  forecast_confidence?: number   // 0..100 — ensemble member agreement (100 = all agree)
}

/** Building and site characteristics */
export interface BuildingSiteInput {
  site_altitude_m: number
  building_floors: number | null
  building_height_m: number | null
  facade_complexity: Complexity
  clearance_m: number | null           // available working clearance from wall (m)
  near_hv_power: 0 | 1
  near_base_station: 0 | 1
  wind_channel_effect: 0 | 1
  rooftop_condition: "good" | "limited" | "not_available" | null
  crowd_density: CrowdDensity | null
  region_exposure: RegionExposure | null
}

/** Operational context factors */
export interface OperationalContextInput {
  time_window: "day" | "night"
  weekend: 0 | 1
  urgent_days: number | null          // days until deadline (null = not urgent)
  road_closure_needed: 0 | 1
  multi_day_split: 0 | 1 | null
  operator_experience_level: OperatorExperience | null
  mission_days?: number               // total mission calendar days (for fatigue scoring)
}

/** Full LARM engine input */
export interface LARMInput {
  weather_30d: Weather30dInput
  weather_today: WeatherTodayInput
  building: BuildingSiteInput
  operational?: OperationalContextInput
  w_override?: WeatherType             // manual regime override (UI/mock)
  equipment?: Equipment[]              // assigned equipment for E-Score computation
}

/** W regime classification result with confidence */
export interface WeatherRegimeResult {
  w_code: WeatherType
  confidence: number                  // 0..1 (lower when multiple rules compete)
  secondary_w: WeatherType | null     // runner-up regime when confidence < 1
}

// ─── LARM v1.0 Output Types ───────────────────────────────────────────────────

export interface RiskExplanation {
  factor: string
  value: string | number
  score: number
  note: string
}

export interface LARMVersions {
  larm_version: string
  weather_regime_params_version: string
  thresholds_version: string
}

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

// ─── Risk ─────────────────────────────────────────────────────────────────────

export interface RiskResult {
  // ── Backward-compatible fields (same keys as before) ──────────────────────
  weather_type: WeatherType       // = w_code
  risk_level: RiskLevel
  internal_grade: "A" | "B" | "C" | "D"
  decision: Decision
  requires_approval: boolean
  controls: string[]
  ruleset_version: string
  evaluated_at: string

  // ── LARM v1.0 computed fields ─────────────────────────────────────────────
  w_code: WeatherType
  base_w: number                  // Base(W) score from regime
  weather_now: number             // WeatherNow component (0..50)
  b_score: number                 // Building/Site score (0..25)
  o_score: number                 // Operational score (0..15)
  risk_score: number              // Final R_score (0..100)
  buffer_ratio: number            // Time buffer ratio (0.05..0.40)
  explanations: RiskExplanation[] // Per-factor breakdown
  versions: LARMVersions

  // ── LARM v1.1 extension fields ────────────────────────────────────────────
  regime_confidence: number       // W regime classification confidence (0..1)
  secondary_w: WeatherType | null // Runner-up regime
  e_score: number                 // Equipment reliability score (0..10)
  conditional_tier: "A" | "B" | "C" | null  // CONDITIONAL sub-tier (null if GO/NO_GO)
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
}

// ─── Equipment (used by risk engine for E-score computation) ─────────────────

export interface Equipment {
  id: string
  name: string
  type: "drone" | "module" | "pump" | "hose" | "battery"
  serial: string
  health_status: HealthStatus
  last_calibrated: string // ISO date
  calibration_expires: string // ISO date
  last_maintenance: string // ISO date
  notes?: string
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

// ─── Wizard state ─────────────────────────────────────────────────────────────

export interface WizardState {
  currentStep: number
  mission: Partial<Mission>
}
