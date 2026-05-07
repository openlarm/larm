// LARM core types. Region-agnostic, no UI concerns, no runtime values.
// These types are the public contract of @openlarm/core.

// ─── Enum-like union types ────────────────────────────────────────────────────

export type WeatherType = "W0" | "W1" | "W2" | "W3" | "W4" | "W5"
export type RiskLevel = "R0" | "R1" | "R2" | "R3" | "R4"
export type Decision = "GO" | "CONDITIONAL" | "NO_GO"
export type Complexity = "light" | "medium" | "heavy"

/** SORA 2.5 population density classification for iGRC ground consequence */
export type PopulationDensityClass = "assembly" | "high_urban" | "residential" | "light" | "isolated"

/** SORA 2.5 M1-series ground risk mitigations */
export type SORAMitigation = "M1A" | "M1B" | "M1C"

/** Equipment block categories (封鎖級) — each +3 points */
export type EquipmentBlockCategory = "B1" | "B2" | "B3"

/** Equipment warn categories (警告級) — each +1.5 points */
export type EquipmentWarnCategory = "W1" | "W2" | "W3" | "W4" | "W5" | "W6"

export type RegionExposure = "windward" | "leeward" | "coastal" | "rooftop_open"
export type CrowdDensity = "low" | "medium" | "high"
export type OperatorExperience = "junior" | "mid" | "senior"

// ─── Input interfaces ─────────────────────────────────────────────────────────

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
  wind_direction_deg?: number    // Wind direction in degrees (0=N, 90=E, 180=S, 270=W)
  edr?: number | null            // v2.0: Eddy Dissipation Rate (turbulence, 0–1+)
  local_hour?: number | null     // v2.0: local hour (0–23) for W4 time-of-day multiplier
  /**
   * v2.1 candidate (Unreleased): Convective Available Potential Energy at the
   * mission hour, J/kg. From Open-Meteo /v1/forecast hourly=cape. Forward-looking
   * instability proxy. NULL is acceptable for inputs from sources that do not
   * provide CAPE; engine falls back to `weather_30d.instability_index` alone.
   *
   * Typical Taiwan summer ranges:
   *   0–500 J/kg   stable
   *   500–1500     marginal
   *   1500–2500    moderate, thunderstorm potential
   *   2500+        severe
   */
  cape_jkg?: number | null
  /**
   * v2.1 candidate (Unreleased): cloud-to-ground (CG) lightning strike count
   * within 5 km radius of the mission site, observed in the past 30 minutes.
   * From CWA opendata O-A0039-001 (KMZ feed). NOT a forecast — observed
   * ground-truth signal. Cloud-to-cloud (IC) strikes are excluded; CG is
   * what threatens drones at altitude.
   *
   * NULL when unavailable; engine falls back to forecast-only thunder_risk
   * with no lightning adder.
   *
   * Range: integer >= 0.
   * Typical Taiwan ranges:
   *   0      clear / no activity
   *   1–2    distant
   *   3–9    active storm in vicinity
   *   10+    intense activity
   *
   * Two engine effects (see spec §5.6):
   *   (A) Mechanism A — forces thunder_risk = 1 when strikes ≥ thunder_force_threshold
   *   (B) Mechanism B — tiered direct adder applied to risk_score after aggregation
   */
  lightning_strikes_30min_5km?: number | null
  cwa_cross?: CWACrossValidation // CWA cross-validation data for this day
  jma_cross?: JMACrossValidation // JMA cross-validation data for this day
}

// ─── CWA Cross-Validation Types ──────────────────────────────────────────────

/** Per-day CWA forecast data from F-D0047 township-level forecast */
export interface CWAForecastDay {
  wind_speed_kmh: number | null     // WS: max wind speed (m/s → km/h)
  wind_direction: string | null     // WD: wind direction text (e.g. "偏北風")
  rain_prob_12h: number | null      // PoP12h: 12-hour rain probability (%)
  weather_desc: string | null       // Wx: weather phenomenon text
  min_temp_c: number | null         // MinT: min temperature (°C)
  max_temp_c: number | null         // MaxT: max temperature (°C)
}

/** Per-day divergence analysis between Open-Meteo and CWA */
export interface CrossValidationDivergence {
  wind_delta_kmh: number | null     // Open-Meteo wind - CWA wind (positive = OM higher)
  rain_prob_delta: number | null    // Open-Meteo rain% - CWA rain% (positive = OM higher)
  severity: "low" | "medium" | "high"  // Divergence severity level
  notes: string[]                   // Human-readable divergence explanations
}

/** Combined CWA cross-validation for a single forecast day */
export interface CWACrossValidation {
  cwa_forecast: CWAForecastDay
  divergence: CrossValidationDivergence
}

/** Real-time CWA observation from nearest weather station (O-A0003-001) */
export interface CWAObservation {
  station_name: string
  station_id: string
  observed_at: string               // ISO datetime
  wind_speed_kmh: number | null     // WDSD (m/s → km/h)
  wind_direction_deg: number | null // WDIR (degrees)
  gust_speed_kmh: number | null     // H_FX (m/s → km/h)
  temperature_c: number | null      // TEMP
  humidity_pct: number | null       // HUMD (0..1 → 0..100)
  precipitation_mm: number | null   // 24R: 24h accumulated rain (mm)
}

/** Top-level CWA cross-validation summary in API response */
export interface CWACrossValidationMeta {
  enabled: boolean
  observation: CWAObservation | null
  forecast_coverage: number          // How many forecast days have CWA data (0..14)
  max_divergence_severity: "low" | "medium" | "high" | "none"
  data_sources: string[]             // e.g. ["F-D0047-091", "O-A0003-001"]
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
  // v2.0: SORA 2.5 ground risk inputs
  population_density_class?: PopulationDensityClass
  sora_mitigations?: SORAMitigation[]
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

/** Equipment item (used by risk engine for E-score computation) */
export interface Equipment {
  id: string
  name: string
  type: "drone" | "module" | "pump" | "hose" | "battery"
  serial: string
  health_status: "ok" | "warn" | "block"
  last_calibrated: string // ISO date
  calibration_expires: string // ISO date
  last_maintenance: string // ISO date
  notes?: string
  // v2.0: specific block/warn categories
  block_category?: EquipmentBlockCategory
  warn_category?: EquipmentWarnCategory
}

/** Full LARM engine input */
export interface LARMInput {
  weather_30d: Weather30dInput
  weather_today: WeatherTodayInput
  building: BuildingSiteInput
  operational?: OperationalContextInput
  w_override?: WeatherType             // manual regime override (UI/mock)
  equipment?: Equipment[]              // assigned equipment for E-Score computation
  // v2.0 extensions
  recent_typhoon_count?: number | null // 3-year recent typhoon count (W5 climate trend)
  local_completion_adjustment?: number // local completion rate adjustment multiplier (default 1.0)
}

// ─── Output interfaces ────────────────────────────────────────────────────────

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

export interface RiskResult {
  // ── Backward-compatible fields ────────────────────────────────────────────
  weather_type: WeatherType       // = w_code
  risk_level: RiskLevel
  internal_grade: "A" | "B" | "C" | "D1" | "D2"  // v2.0: D split into D1/D2
  decision: Decision
  requires_approval: boolean
  controls: string[]
  ruleset_version: string
  evaluated_at: string

  // ── LARM v2.0 computed fields ─────────────────────────────────────────────
  w_code: WeatherType
  base_w: number                  // Base(W) score from regime (0..22)
  weather_now: number             // WeatherNow component (0..42, v1.1 was 0..50)
  g_score: number                 // Ground/Site score (0..20, replaces B_score)
  b_score: number                 // @deprecated alias for g_score (backward compat)
  o_score: number                 // Operational score (0..12, v1.1 was 0..15)
  e_score: number                 // Equipment score (0..8, v1.1 was 0..10)
  risk_score: number              // Final R_score (0..100)
  buffer_ratio: number            // Time buffer ratio (0.05..0.55, v1.1 was 0.05..0.40)
  explanations: RiskExplanation[] // Per-factor breakdown
  versions: LARMVersions

  // ── Regime + Decision extensions ──────────────────────────────────────────
  regime_confidence: number       // W regime classification confidence (0..1)
  secondary_w: WeatherType | null // Runner-up regime
  conditional_tier: "A" | "C" | "D1" | "D2" | null  // v2.0 CONDITIONAL sub-tier

  // ── v2.0 new detail fields ────────────────────────────────────────────────
  edr_adj?: number                // EDR turbulence adjustment (0..20)
  tke_proxy?: number              // TKE proxy add (0..3)
  ground_consequence?: number     // SORA GRC ground consequence (0..6)
  // ── v2.1 candidate (Unreleased) ───────────────────────────────────────────
  lightning_adj?: number          // Lightning observation tier adder (0..max_adj, default cap 25)
}

/** W regime classification result with confidence */
export interface WeatherRegimeResult {
  w_code: WeatherType
  confidence: number                  // 0..1 (lower when multiple rules compete)
  secondary_w: WeatherType | null     // runner-up regime when confidence < 1
}

// ─── JMA Cross-Validation ───────────────────────────────────────────────────

/** Per-day JMA forecast data from Open-Meteo JMA API */
export interface JMAForecastDay {
  wind_max_kmh: number | null
  wind_gust_kmh: number | null
  rain_sum_mm: number | null
  source_model: "jma_gsm" | "jma_msm"
}

/** JMA cross-validation for a single forecast day */
export interface JMACrossValidation {
  jma_forecast: JMAForecastDay
  divergence: CrossValidationDivergence  // reuses existing divergence type
}
