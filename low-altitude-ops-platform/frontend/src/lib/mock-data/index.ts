import type {
  AddressResult,
  AirspaceResult,
  WeatherDay,
  TeamMember,
  Equipment,
  BuildingData,
  FacadeData,
} from "@/lib/types"

// ─── Addresses ───────────────────────────────────────────────────────────────

export const MOCK_ADDRESSES: Record<string, AddressResult & { airspace: AirspaceResult }> = {
  "台北市信義區松仁路100號": {
    raw: "台北市信義區松仁路100號",
    lat: 25.0336,
    lng: 121.5636,
    altitude_m: 12,
    district: "信義區",
    city: "台北市",
    status: "success",
    airspace: {
      status: "OK",
      admin_days_added: 0,
      ruleset_version: "v1.0",
    },
  },
  "新北市板橋區文化路1段188號": {
    raw: "新北市板橋區文化路1段188號",
    lat: 24.9995,
    lng: 121.4592,
    altitude_m: 8,
    district: "板橋區",
    city: "新北市",
    status: "success",
    airspace: {
      status: "NeedPermit",
      reason: "位於松山機場管制空域 5km 範圍內，須向 CAA 提出 LAANC 申請",
      admin_days_added: 3,
      ruleset_version: "v1.0",
    },
  },
  "桃園市大園區航站南路9號": {
    raw: "桃園市大園區航站南路9號",
    lat: 25.0797,
    lng: 121.2325,
    altitude_m: 11,
    district: "大園區",
    city: "桃園市",
    status: "success",
    airspace: {
      status: "NoFly",
      reason: "位於桃園國際機場禁飛區（距跑道中心線 < 5km），任務不可生成",
      admin_days_added: 0,
      ruleset_version: "v1.0",
    },
  },
}

export const DEFAULT_ADDRESS_KEY = "台北市信義區松仁路100號"

// ─── Weather scenarios ────────────────────────────────────────────────────────

const today = new Date()
const dateStr = (offset: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offset)
  return d.toISOString().split("T")[0]
}

export const MOCK_WEATHER_SCENARIOS: Record<string, WeatherDay[]> = {
  "W0-R0": Array.from({ length: 14 }, (_, i) => ({
    date: dateStr(i),
    weather_type: "W0",
    risk_level: i % 7 === 6 ? "R1" : "R0",
    wind_ms: 1.5 + Math.random() * 1.5,
    rain_prob: Math.floor(Math.random() * 10),
    completion_prob: i % 7 === 6 ? 85 : 97,
  })),
  "W1-R2": Array.from({ length: 14 }, (_, i) => ({
    date: dateStr(i),
    weather_type: i % 3 === 0 ? "W2" : "W1",
    risk_level: i % 3 === 0 ? "R2" : i % 5 === 0 ? "R3" : "R1",
    wind_ms: 4 + Math.random() * 4,
    rain_prob: 20 + Math.floor(Math.random() * 40),
    completion_prob: i % 3 === 0 ? 55 : i % 5 === 0 ? 30 : 75,
  })),
  "W5-R3": Array.from({ length: 14 }, (_, i) => ({
    date: dateStr(i),
    weather_type: i < 3 ? "W4" : "W5",
    risk_level: i < 3 ? "R2" : "R3",
    wind_ms: 7 + Math.random() * 4,
    rain_prob: 60 + Math.floor(Math.random() * 35),
    completion_prob: i < 3 ? 40 : 15,
  })),
}

// ─── Building templates ───────────────────────────────────────────────────────

export const MOCK_BUILDINGS: Record<string, BuildingData> = {
  commercial: {
    name: "信義商業大樓",
    height_floors: 25,
    height_m: 88,
    building_type: "commercial",
    num_facades: 4,
    rooftop_access: "Good",
    water_supply: "Provided",
    power_supply: "Provided",
  },
  luxury: {
    name: "南港豪宅",
    height_floors: 18,
    height_m: 63,
    building_type: "luxury",
    num_facades: 4,
    rooftop_access: "Limited",
    water_supply: "Provided",
    power_supply: "Provided",
  },
  factory: {
    name: "林口工廠",
    height_floors: 5,
    height_m: 20,
    building_type: "factory",
    num_facades: 4,
    rooftop_access: "Good",
    water_supply: "SelfSupply",
    power_supply: "SelfSupply",
  },
}

export const MOCK_FACADES: FacadeData[] = [
  { id: "N", label: "N（北面）", area_m2: 800, material: "glass", complexity: "light",  road_closure: false, tight_perimeter: false, high_risk_env: false, adjacent_trees: false, tree_area_m2: 0, clean_tree_floors: true },
  { id: "E", label: "E（東面）", area_m2: 600, material: "glass", complexity: "none",   road_closure: false, tight_perimeter: false, high_risk_env: false, adjacent_trees: false, tree_area_m2: 0, clean_tree_floors: true },
  { id: "S", label: "S（南面）", area_m2: 800, material: "glass", complexity: "light",  road_closure: true,  tight_perimeter: true,  high_risk_env: false, adjacent_trees: false, tree_area_m2: 0, clean_tree_floors: true },
  { id: "W", label: "W（西面）", area_m2: 600, material: "glass", complexity: "none",   road_closure: false, tight_perimeter: false, high_risk_env: false, adjacent_trees: false, tree_area_m2: 0, clean_tree_floors: true },
]

// ─── Teams ────────────────────────────────────────────────────────────────────

export const MOCK_TEAMS: { qualified: TeamMember[]; unqualified: TeamMember[] } = {
  qualified: [
    { id: "P001", name: "林志傑", role: "RPIC", cert_number: "TW-RPIC-2021-4821", cert_expires: "2027-06-30", night_qualified: true, highrise_qualified: true },
    { id: "P002", name: "陳雅萍", role: "Observer", cert_number: "TW-OBS-2022-1130", cert_expires: "2027-03-15", night_qualified: true, highrise_qualified: true },
    { id: "P003", name: "黃建宏", role: "Safety", cert_number: "TW-SAFE-2023-0044", cert_expires: "2026-12-31", night_qualified: false, highrise_qualified: true },
    { id: "P004", name: "王美玲", role: "PM", cert_number: "PM-2024-0012", cert_expires: "2028-01-01", night_qualified: false, highrise_qualified: false },
  ],
  unqualified: [
    { id: "P005", name: "張威霖", role: "RPIC", cert_number: "TW-RPIC-2020-1103", cert_expires: "2025-12-31", night_qualified: false, highrise_qualified: false },
    { id: "P006", name: "吳詩涵", role: "Observer", cert_number: "TW-OBS-2021-0887", cert_expires: "2026-08-20", night_qualified: false, highrise_qualified: false },
  ],
}

// ─── Equipment ────────────────────────────────────────────────────────────────

export const MOCK_EQUIPMENT: { healthy: Equipment[]; blocked: Equipment[] } = {
  healthy: [
    { id: "D001", name: "DJI Matrice 350 RTK #1", type: "drone", serial: "M350-TW-0091", health_status: "ok", last_calibrated: "2026-01-15", calibration_expires: "2026-07-15", last_maintenance: "2026-01-10" },
    { id: "D002", name: "清潔模組 CM-X3 #1", type: "module", serial: "CMX3-0047", health_status: "ok", last_calibrated: "2026-01-20", calibration_expires: "2026-07-20", last_maintenance: "2026-01-18" },
    { id: "D003", name: "高壓泵浦 HP-500 #1", type: "pump", serial: "HP500-0023", health_status: "ok", last_calibrated: "2026-01-12", calibration_expires: "2026-07-12", last_maintenance: "2026-01-10" },
    { id: "D004", name: "電池組 TB60 #1–4", type: "battery", serial: "TB60-TW-0101~0104", health_status: "ok", last_calibrated: "2026-02-01", calibration_expires: "2026-08-01", last_maintenance: "2026-02-01" },
  ],
  blocked: [
    { id: "D005", name: "DJI Matrice 350 RTK #2", type: "drone", serial: "M350-TW-0092", health_status: "block", last_calibrated: "2025-06-10", calibration_expires: "2025-12-10", last_maintenance: "2025-11-20", notes: "校準過期，需重新送測" },
    { id: "D006", name: "清潔模組 CM-X3 #2", type: "module", serial: "CMX3-0048", health_status: "warn", last_calibrated: "2026-01-05", calibration_expires: "2026-07-05", last_maintenance: "2026-01-03", notes: "噴嘴磨損，建議更換前完成作業" },
  ],
}

// ─── Versions (for demo badge) ────────────────────────────────────────────────

export const SYSTEM_VERSIONS = {
  ruleset: "v1.0",
  pricing: "v1.0",
  time_model: "v1.0",
}

// ─── Scheduled conflicts (for Step 5 conflict check) ─────────────────────────

export interface ConflictEntry {
  mission_id: string
  client: string
  type: string
}

export const MOCK_CONFLICTS: Record<string, ConflictEntry[]> = {
  [dateStr(2)]: [{ mission_id: "M-SCHED-001", client: "大安商業大廈", type: "Cleaning" }],
  [dateStr(5)]: [{ mission_id: "M-SCHED-002", client: "南港科技園區", type: "Inspection" }],
  [dateStr(8)]: [{ mission_id: "M-SCHED-003", client: "中和工業廠房", type: "Coating" }],
}
