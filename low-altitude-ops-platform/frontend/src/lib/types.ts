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
  num_facades: number
  rooftop_access: RooftopAccess
  water_supply: Supply
  power_supply: Supply
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
  weather_type: WeatherType
  risk_level: RiskLevel
  wind_ms: number
  rain_prob: number // 0-100
  completion_prob: number // 0-100
}

// ─── Risk ─────────────────────────────────────────────────────────────────────

export interface RiskResult {
  weather_type: WeatherType
  risk_level: RiskLevel
  internal_grade: "A" | "B" | "C" | "D"
  decision: Decision
  requires_approval: boolean
  controls: string[]
  ruleset_version: string
  evaluated_at: string
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

// ─── Team & Equipment ────────────────────────────────────────────────────────

export interface TeamMember {
  id: string
  name: string
  role: "RPIC" | "Observer" | "Safety" | "PM"
  cert_number: string
  cert_expires: string // ISO date
  night_qualified: boolean
  highrise_qualified: boolean
}

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

export interface QualCheck {
  item: string
  result: QualCheckResult
  reason?: string
}

export interface AssignmentData {
  team: TeamMember[]
  equipment: Equipment[]
  qual_checks: QualCheck[]
  health_checks: QualCheck[]
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
  risk?: RiskResult
  time_estimate?: TimeResult
  pricing?: PricingResult
  assignment?: AssignmentData
}

// ─── Wizard state ─────────────────────────────────────────────────────────────

export interface WizardState {
  currentStep: number
  mission: Partial<Mission>
}
