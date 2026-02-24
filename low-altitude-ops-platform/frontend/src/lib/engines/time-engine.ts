import type {
  MissionType, BuildingType, Complexity, Contamination,
  TimeWindow, RiskLevel, Supply, RooftopAccess, FacadeData, TimeResult,
} from "@/lib/types"

// ─── Baseline productivity (m²/hr) ───────────────────────────────────────────

const BASELINE: Record<string, number> = {
  "Cleaning-commercial": 600,
  "Cleaning-luxury":     600,
  "Cleaning-factory":    800,
  "Cleaning-solar":      600,
  "Inspection-any":      600,
  "Coating-any":         150,
}

function getBaseline(taskType: MissionType, buildingType: BuildingType): number {
  return (
    BASELINE[`${taskType}-${buildingType}`] ??
    BASELINE[`${taskType}-any`] ??
    250
  )
}

// ─── Coefficients ─────────────────────────────────────────────────────────────

const HEIGHT_COEFF: { max: number; coeff: number }[] = [
  { max: 10,  coeff: 1.00 },
  { max: 20,  coeff: 1.00 },
  { max: 30,  coeff: 0.95 },
  { max: 999, coeff: 0.75 },
]

const WIND_COEFF: { max: number; coeff: number | null }[] = [
  { max: 3,   coeff: 1.00 },
  { max: 5,   coeff: 1.00 },
  { max: 7,   coeff: 1.00 },
  { max: 9,   coeff: 0.95 },
  { max: 999, coeff: null }, // halt
]

const COMPLEXITY_COEFF: Record<Complexity, number> = {
  none: 1.00, light: 0.98, medium: 0.9, heavy: 0.70,
}

const CONTAMINATION_COEFF: Record<Contamination, number> = {
  dust: 1.00, scale: 0.85, mold: 0.90, bird: 0.83, grease: 0.80, multi: 0.75,
}

const TIME_WINDOW_COEFF: Record<TimeWindow, number> = {
  day: 1.00, weekend: 0.95, night: 0.75,
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

function calcSetup(
  water: Supply, power: Supply,
  rooftop: RooftopAccess, roadClosure: boolean
): number {
  let mins = 60
  if (water === "SelfSupply") mins += 30
  if (power === "SelfSupply") mins += 20
  if (roadClosure) mins += 45
  if (rooftop !== "Good") mins += 30
  return mins
}

// ─── Buffer ratio per risk level ──────────────────────────────────────────────

const BUFFER_RATIO: Record<RiskLevel, number | null> = {
  R0: 0.05, R1: 0.10, R2: 0.20, R3: null, R4: null,
}

// ─── Main function ────────────────────────────────────────────────────────────

export interface TimeEngineInput {
  missionType: MissionType
  buildingType: BuildingType
  floors: number
  wind_ms: number
  facades: FacadeData[]
  contamination: Contamination
  timeWindow: TimeWindow
  riskLevel: RiskLevel
  waterSupply: Supply
  powerSupply: Supply
  rooftopAccess: RooftopAccess
}

export function estimateTime(input: TimeEngineInput): TimeResult {
  const {
    missionType, buildingType, floors, wind_ms,
    facades, contamination, timeWindow, riskLevel,
    waterSupply, powerSupply, rooftopAccess,
  } = input

  const dominant_complexity: Complexity =
    facades.some(f => f.complexity === "heavy") ? "heavy" :
    facades.some(f => f.complexity === "medium") ? "medium" :
    facades.some(f => f.complexity === "light") ? "light" : "none"

  const baseline = getBaseline(missionType, buildingType)

  const h_coeff = HEIGHT_COEFF.find(h => floors <= h.max)!.coeff
  const w_entry = WIND_COEFF.find(w => wind_ms <= w.max)!
  const w_coeff = w_entry.coeff ?? 0 // null = halt, treat as 0
  const c_coeff = COMPLEXITY_COEFF[dominant_complexity]
  const ct_coeff = CONTAMINATION_COEFF[contamination]
  const tw_coeff = TIME_WINDOW_COEFF[timeWindow]

  const adjusted = baseline * h_coeff * w_coeff * c_coeff * ct_coeff * tw_coeff
  const total_area = facades.reduce((sum, f) => sum + f.area_m2, 0)

  const road_closure = facades.some(f => f.road_closure)
  const setup_min = calcSetup(waterSupply, powerSupply, rooftopAccess, road_closure)
  const teardown_min = 60

  const pure_op_hours = adjusted > 0 ? total_area / adjusted : 0
  const rest_min = Math.floor(pure_op_hours / 2) * 30

  const buffer_ratio = BUFFER_RATIO[riskLevel] ?? 0
  const buffer_min = Math.round(
    (pure_op_hours * 60 + setup_min + teardown_min) * buffer_ratio
  )

  const total_min = Math.round(
    pure_op_hours * 60 + setup_min + teardown_min + rest_min + buffer_min
  )

  const MAX_DAILY_MIN = 8 * 60
  const suggested_days = Math.ceil(total_min / MAX_DAILY_MIN)

  return {
    baseline_productivity: baseline,
    adjusted_productivity: Math.round(adjusted * 10) / 10,
    pure_operation_hours: Math.round(pure_op_hours * 10) / 10,
    setup_minutes: setup_min,
    teardown_minutes: teardown_min,
    rest_minutes: rest_min,
    buffer_minutes: buffer_min,
    total_minutes: total_min,
    suggested_days,
    disruption_buffer_ratio: buffer_ratio,
    time_model_version: "v1.0",
    coefficient_snapshot: {
      height: h_coeff,
      wind: w_coeff,
      complexity: c_coeff,
      contamination: ct_coeff,
      time_window: tw_coeff,
    },
  }
}
