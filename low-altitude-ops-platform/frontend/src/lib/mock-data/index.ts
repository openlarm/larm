import type {
  AddressResult,
  AirspaceResult,
  WeatherDay,
  WeatherType,
  RiskLevel,
  Weather30dInput,
  WeatherTodayInput,
  BuildingData,
  FacadeData,
} from "@/lib/types"

// ─── Addresses ───────────────────────────────────────────────────────────────

export const MOCK_ADDRESSES: Record<string, AddressResult & { airspace: AirspaceResult }> = {
  "台北市信義區松仁路100號": {
    raw: "台北市信義區松仁路100號",
    lat: 25.0336, lng: 121.5636, altitude_m: 12,
    district: "信義區", city: "台北市", status: "success",
    airspace: { status: "OK", admin_days_added: 0, ruleset_version: "v1.0" },
  },
  "新北市板橋區文化路1段188號": {
    raw: "新北市板橋區文化路1段188號",
    lat: 24.9995, lng: 121.4592, altitude_m: 8,
    district: "板橋區", city: "新北市", status: "success",
    airspace: {
      status: "NeedPermit",
      reason: "位於松山機場管制空域 5km 範圍內，須向 CAA 提出 LAANC 申請",
      admin_days_added: 3, ruleset_version: "v1.0",
    },
  },
  "桃園市大園區航站南路9號": {
    raw: "桃園市大園區航站南路9號",
    lat: 25.0797, lng: 121.2325, altitude_m: 11,
    district: "大園區", city: "桃園市", status: "success",
    airspace: {
      status: "NoFly",
      reason: "位於桃園國際機場禁飛區（距跑道中心線 < 5km），任務不可生成",
      admin_days_added: 0, ruleset_version: "v1.0",
    },
  },
}

export const DEFAULT_ADDRESS_KEY = "台北市信義區松仁路100號"

// ─── Rolling 30d weather context for each mock scenario ───────────────────────
// These drive LARM Step A (W classification) and WeatherNow instability/predictability

export const MOCK_WEATHER_30D: Record<string, Weather30dInput> = {
  // Stable high-pressure → W0
  "W0-R0": {
    wind_mean_kmh: 8,  wind_p90_kmh: 16, gust_p90_kmh: 22,
    rain_days_30: 2,   heavy_rain_days_30: 0,
    instability_index: 0.15, predictability_score: 0.90,
  },
  // NE monsoon — strong but predictable → W1
  "W1-R2": {
    wind_mean_kmh: 22, wind_p90_kmh: 35, gust_p90_kmh: 44,
    rain_days_30: 6,   heavy_rain_days_30: 1,
    instability_index: 0.45, predictability_score: 0.65,
  },
  // Typhoon outer circulation → W5
  "W5-R3": {
    wind_mean_kmh: 36, wind_p90_kmh: 52, gust_p90_kmh: 65,
    rain_days_30: 20,  heavy_rain_days_30: 7,
    instability_index: 0.85, predictability_score: 0.25,
  },
}

// ─── Per-day WeatherTodayInput generators ────────────────────────────────────

function stableDay(seed: number): WeatherTodayInput {
  const rng = (min: number, max: number) => min + ((seed * 17 + 7) % (max - min + 1))
  return {
    wind_now_kmh:        rng(5, 14),
    gust_now_kmh:        rng(10, 20),
    rain_prob_today_pct: rng(0, 12),
    rain_mmph_forecast:  0,
    thunder_risk:        0,
  }
}

function monsoonDay(seed: number): WeatherTodayInput {
  const rng = (min: number, max: number) => min + ((seed * 13 + 11) % (max - min + 1))
  return {
    wind_now_kmh:        rng(14, 30),
    gust_now_kmh:        rng(22, 40),
    rain_prob_today_pct: rng(20, 65),
    rain_mmph_forecast:  rng(0, 5),
    thunder_risk:        seed % 7 === 0 ? 1 : 0,
  }
}

function typhoonDay(seed: number): WeatherTodayInput {
  const rng = (min: number, max: number) => min + ((seed * 11 + 3) % (max - min + 1))
  return {
    wind_now_kmh:        rng(28, 44),
    gust_now_kmh:        rng(38, 55),
    rain_prob_today_pct: rng(55, 95),
    rain_mmph_forecast:  rng(4, 18),
    thunder_risk:        seed % 3 === 0 ? 1 : 0,
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

const today = new Date()
const dateStr = (offset: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d.toISOString().split("T")[0]
}

// ─── Weather scenarios (365-day calendar) ────────────────────────────────────
// Generates 365 days based on Taiwan's monthly climate profiles.
// weather_type and risk_level are pre-computed from LARM for display purposes.
// Step 6 re-runs LARM with full building+operational context.

type WDist = [number, WeatherType][]  // cumulative weight → W-code
type MonthProfile = { wDist: WDist; riskBase: RiskLevel }

// Taiwan monthly climate distributions (W-code probability + base risk)
const MONTH_PROFILES: MonthProfile[] = [
  /* Jan */ { wDist: [[0.50, "W0"], [0.85, "W1"], [1.00, "W2"]], riskBase: "R0" },
  /* Feb */ { wDist: [[0.45, "W0"], [0.80, "W1"], [1.00, "W2"]], riskBase: "R0" },
  /* Mar */ { wDist: [[0.40, "W0"], [0.65, "W1"], [0.90, "W2"], [1.00, "W3"]], riskBase: "R1" },
  /* Apr */ { wDist: [[0.35, "W0"], [0.55, "W1"], [0.80, "W2"], [0.95, "W3"], [1.00, "W4"]], riskBase: "R1" },
  /* May */ { wDist: [[0.20, "W0"], [0.35, "W1"], [0.55, "W2"], [0.85, "W3"], [1.00, "W4"]], riskBase: "R2" },
  /* Jun */ { wDist: [[0.15, "W0"], [0.25, "W1"], [0.45, "W2"], [0.75, "W3"], [0.95, "W4"], [1.00, "W5"]], riskBase: "R2" },
  /* Jul */ { wDist: [[0.15, "W0"], [0.25, "W1"], [0.40, "W2"], [0.55, "W3"], [0.80, "W4"], [1.00, "W5"]], riskBase: "R3" },
  /* Aug */ { wDist: [[0.12, "W0"], [0.22, "W1"], [0.38, "W2"], [0.52, "W3"], [0.78, "W4"], [1.00, "W5"]], riskBase: "R3" },
  /* Sep */ { wDist: [[0.20, "W0"], [0.35, "W1"], [0.55, "W2"], [0.70, "W3"], [0.88, "W4"], [1.00, "W5"]], riskBase: "R2" },
  /* Oct */ { wDist: [[0.40, "W0"], [0.65, "W1"], [0.85, "W2"], [0.95, "W3"], [1.00, "W4"]], riskBase: "R1" },
  /* Nov */ { wDist: [[0.50, "W0"], [0.80, "W1"], [0.95, "W2"], [1.00, "W3"]], riskBase: "R0" },
  /* Dec */ { wDist: [[0.55, "W0"], [0.88, "W1"], [1.00, "W2"]], riskBase: "R0" },
]

// Deterministic hash for consistent pseudo-random values
function hash(seed: number): number {
  let h = (seed * 2654435761) >>> 0
  h = ((h >>> 16) ^ h) * 0x45d9f3b >>> 0
  h = ((h >>> 16) ^ h) >>> 0
  return (h & 0x7fffffff) / 0x7fffffff // 0..1
}

function pickFromDist(dist: WDist, rand: number): WeatherType {
  for (const [threshold, w] of dist) {
    if (rand <= threshold) return w
  }
  return dist[dist.length - 1][1]
}

// Map W-code + month base risk → daily risk level
function riskForW(w: WeatherType, baseRisk: RiskLevel, rand: number): RiskLevel {
  const wIdx = parseInt(w[1])
  const rBase = parseInt(baseRisk[1])
  // Add some variance: +/-1 risk level with probability
  let r = Math.min(4, Math.max(0, rBase + Math.floor(wIdx / 2) - 1))
  if (rand > 0.85) r = Math.min(4, r + 1) // 15% chance worse
  if (rand < 0.15) r = Math.max(0, r - 1) // 15% chance better
  return `R${r}` as RiskLevel
}

function completionForRisk(rl: RiskLevel, w: WeatherType): number {
  const rIdx = parseInt(rl[1])
  const wIdx = parseInt(w[1])
  const base = [97, 82, 60, 35, 10][rIdx]
  return Math.max(5, Math.min(99, base - wIdx * 3))
}

// Generate weather for a given day using scenario seed + day offset
function genDay(scenarioSeed: number, dayOffset: number): WeatherDay {
  const d = new Date(today)
  d.setDate(d.getDate() + dayOffset)
  const month = d.getMonth() // 0-based
  const profile = MONTH_PROFILES[month]

  const seed = scenarioSeed * 1000 + dayOffset
  const r1 = hash(seed)
  const r2 = hash(seed + 7919)
  const r3 = hash(seed + 104729)

  const w = pickFromDist(profile.wDist, r1)
  const rl = riskForW(w, profile.riskBase, r2)

  // Generate weather_today based on W-code
  const wIdx = parseInt(w[1])
  let weather_today: WeatherTodayInput
  if (wIdx <= 1) {
    weather_today = stableDay(seed)
  } else if (wIdx <= 3) {
    weather_today = monsoonDay(seed)
  } else {
    weather_today = typhoonDay(seed)
  }

  return {
    date: d.toISOString().split("T")[0],
    weather_type: w,
    risk_level: rl,
    wind_ms: Math.round(weather_today.wind_now_kmh / 3.6 * 10) / 10,
    rain_prob: weather_today.rain_prob_today_pct,
    completion_prob: completionForRisk(rl, w),
    weather_today,
  }
}

function generate365(scenarioSeed: number): WeatherDay[] {
  return Array.from({ length: 365 }, (_, i) => genDay(scenarioSeed, i))
}

export const MOCK_WEATHER_SCENARIOS: Record<string, WeatherDay[]> = {
  "W0-R0": generate365(1),  // Stable baseline
  "W1-R2": generate365(2),  // NE monsoon influenced
  "W5-R3": generate365(3),  // Typhoon influenced
}

// ─── Building templates ───────────────────────────────────────────────────────

export const MOCK_BUILDINGS: Record<string, BuildingData> = {
  commercial: {
    name: "信義商業大樓",
    height_floors: 25, height_m: 88,
    building_type: "commercial", num_facades: 4,
    rooftop_access: "Good", water_supply: "Provided", power_supply: "Provided",
  },
  luxury: {
    name: "南港豪宅",
    height_floors: 18, height_m: 63,
    building_type: "luxury", num_facades: 4,
    rooftop_access: "Limited", water_supply: "Provided", power_supply: "Provided",
  },
  factory: {
    name: "林口工廠",
    height_floors: 5, height_m: 20,
    building_type: "factory", num_facades: 4,
    rooftop_access: "Good", water_supply: "SelfSupply", power_supply: "SelfSupply",
  },
}

export const MOCK_FACADES: FacadeData[] = [
  { id: "N", label: "N（北面）", area_m2: 800, material: "glass", complexity: "light",  road_closure: false, tight_perimeter: false, high_risk_env: false, adjacent_trees: false, tree_area_m2: 0, clean_tree_floors: true },
  { id: "E", label: "E（東面）", area_m2: 600, material: "glass", complexity: "none",   road_closure: false, tight_perimeter: false, high_risk_env: false, adjacent_trees: false, tree_area_m2: 0, clean_tree_floors: true },
  { id: "S", label: "S（南面）", area_m2: 800, material: "glass", complexity: "light",  road_closure: true,  tight_perimeter: true,  high_risk_env: false, adjacent_trees: false, tree_area_m2: 0, clean_tree_floors: true },
  { id: "W", label: "W（西面）", area_m2: 600, material: "glass", complexity: "none",   road_closure: false, tight_perimeter: false, high_risk_env: false, adjacent_trees: false, tree_area_m2: 0, clean_tree_floors: true },
]

// ─── Versions ────────────────────────────────────────────────────────────────

export const SYSTEM_VERSIONS = {
  ruleset:    "larm_v1.0",
  pricing:    "v1.0",
  time_model: "v1.0",
}

// ─── Scheduled conflicts (for Step 5 conflict check) ─────────────────────────

export interface ConflictEntry {
  mission_id: string
  client: string
  type: string
}

export const MOCK_CONFLICTS: Record<string, ConflictEntry[]> = {
  [dateStr(2)]: [{ mission_id: "M-SCHED-001", client: "大安商業大廈",  type: "Cleaning"   }],
  [dateStr(5)]: [{ mission_id: "M-SCHED-002", client: "南港科技園區",  type: "Inspection" }],
  [dateStr(8)]: [{ mission_id: "M-SCHED-003", client: "中和工業廠房",  type: "Coating"    }],
}
