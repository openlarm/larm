// ─── Quick Quote: mapping tables, smart defaults, area estimation ────────────

import type {
  BuildingType, FacadeData, FacadeMaterial, Complexity,
  Contamination, RiskLevel, TimeWindow, Supply,
} from "@/lib/types"

// ─── Business-friendly labels → engine values ────────────────────────────────

export type ServiceType = "cleaning" | "coating" | "inspection"
export type TimeSlot = "day" | "weekend" | "night"
export type DirtType = "dust" | "scale" | "mold" | "grease"

// ─── Taiwan seasonal weather risk matrix ─────────────────────────────────────

export type WeatherRiskLevel = "low" | "medium" | "high"

export interface WeatherRisk {
  level: WeatherRiskLevel
  season: string           // season label
  icon: string
  concerns: string[]       // specific hazards for that period
  advice: string           // recommended action
  bufferDays: number       // suggested schedule buffer
}

// Month 1–12 → risk entry
const WEATHER_RISK_BY_MONTH: WeatherRisk[] = [
  // Jan
  { level: "low",    season: "冬季乾燥",   icon: "☀️", concerns: ["偶有東北季風強風"], advice: "施工最佳時段，可正常安排工期", bufferDays: 0 },
  // Feb
  { level: "low",    season: "冬末",       icon: "☀️", concerns: ["東北季風漸弱", "偶有霧氣"], advice: "施工條件佳，留意霧日能見度", bufferDays: 1 },
  // Mar
  { level: "medium", season: "梅雨前期",   icon: "🌦", concerns: ["降雨機率上升", "濕度高，塗料固化受影響"], advice: "建議預留 2 天緩衝，確認施工前 72h 無雨", bufferDays: 2 },
  // Apr
  { level: "medium", season: "梅雨初期",   icon: "🌧", concerns: ["間歇性降雨", "高濕度影響防水塗層效果"], advice: "密切追蹤降雨預報，排定備用工期", bufferDays: 2 },
  // May
  // May
  { level: "medium", season: "梅雨盛期",   icon: "🌧", concerns: ["連續降雨常見", "能見度低", "高濕度"], advice: "強烈建議預留 3 天緩衝，塗層施工宜避開", bufferDays: 3 },
  // Jun
  { level: "high",   season: "梅雨末 / 颱風季開始", icon: "⛈️", concerns: ["颱風路徑影響", "豪大雨", "強陣風 >10m/s"], advice: "高風險期，建議延後至 10 月後或增加 5 天緩衝", bufferDays: 5 },
  // Jul
  { level: "high",   season: "颱風季盛期", icon: "🌀", concerns: ["颱風頻率最高", "強風 >15m/s 停工", "大量降雨"], advice: "強烈建議避開，若必要請規劃緊急停工預案", bufferDays: 7 },
  // Aug
  { level: "high",   season: "颱風季盛期", icon: "🌀", concerns: ["颱風頻率高", "強對流雨", "高溫暴曬"], advice: "強烈建議避開，若必要請規劃緊急停工預案", bufferDays: 7 },
  // Sep
  { level: "high",   season: "颱風季末期", icon: "🌀", concerns: ["秋颱活躍", "強風 >12m/s", "東北季風加強"], advice: "風險仍高，預留 5 天緩衝，確認停工觸發條件", bufferDays: 5 },
  // Oct
  { level: "medium", season: "東北季風轉強", icon: "🌬", concerns: ["東北季風強化", "迎風面風速 >8m/s", "東北部降雨增多"], advice: "留意迎風面作業，預留 2 天緩衝", bufferDays: 2 },
  // Nov
  { level: "medium", season: "東北季風盛期", icon: "🌬", concerns: ["持續東北風", "北部 / 迎風面多雨", "低溫影響塗層"], advice: "南部施工條件尚可；北部需預留 3 天緩衝", bufferDays: 2 },
  // Dec
  { level: "low",    season: "冬季乾燥",   icon: "☀️", concerns: ["偶有強北風", "日夜溫差大"], advice: "施工最佳時段，注意低溫對塗料的最低施作溫度", bufferDays: 0 },
]

/**
 * Returns weather risk for a given date string (YYYY-MM-DD or Date).
 * Falls back to current month if no date provided.
 */
export function getWeatherRisk(dateStr?: string): WeatherRisk & { month: number } {
  const d = dateStr ? new Date(dateStr) : new Date()
  const month = d.getMonth() + 1 // 1-12
  return { ...WEATHER_RISK_BY_MONTH[month - 1], month }
}

export const SERVICE_OPTIONS: { value: ServiceType; label: string }[] = [
  { value: "cleaning", label: "外牆清洗" },
  { value: "coating", label: "外牆防水塗層" },
  { value: "inspection", label: "外牆檢測" },
]

export const BUILDING_TYPE_OPTIONS: { value: BuildingType; label: string }[] = [
  { value: "commercial", label: "商辦大樓" },
  { value: "luxury", label: "豪宅大樓" },
  { value: "house", label: "透天厝" },
  { value: "factory", label: "廠房" },
  { value: "solar", label: "太陽能板" },
]

export const DIRT_TYPE_OPTIONS: { value: DirtType; label: string; emoji: string }[] = [
  { value: "dust",   label: "灰塵 / 水漬", emoji: "💨" },
  { value: "scale",  label: "鏽斑 / 水垢", emoji: "🟤" },
  { value: "mold",   label: "青苔 / 霉菌", emoji: "🟢" },
  { value: "grease", label: "油汙 / 重附著", emoji: "⚫" },
]

export const COMPLEXITY_OPTIONS: { value: Complexity; label: string; desc: string }[] = [
  { value: "none",   label: "無",   desc: "平整外牆" },
  { value: "light",  label: "輕微", desc: "少量凸出" },
  { value: "medium", label: "中等", desc: "窗框、線條較多" },
  { value: "heavy",  label: "複雜", desc: "大量裝飾/格柵" },
]

export const TIME_SLOT_OPTIONS: { value: TimeSlot; label: string }[] = [
  { value: "day",     label: "一般白天" },
  { value: "weekend", label: "週末 / 假日" },
  { value: "night",   label: "夜間施工" },
]

// ─── Per-facade input (what the sales form collects) ─────────────────────────

export type PowerVoltage = "110V" | "220V"

export interface QuoteFacadeInput {
  id: string
  buildingIndex: number        // 0-based; which building this facade belongs to
  buildingLabel: string        // "A", "B" … when numBuildings > 1, else ""
  label: string                // A / B / C / D (within the building)
  dirtTypes: DirtType[]        // multi-select
  complexity: Complexity
  hasRecesses: boolean         // 有內縮 / 露台 / 天井
  isHighRisk: boolean          // 緊鄰特殊風險環境
  waterSupply: Supply          // 用水：業主提供 or 自備
  powerSupply: Supply          // 用電：業主提供 or 自備 (derived from powerVoltage)
  powerVoltage: PowerVoltage[] // which voltages are available ([] = 自備)
  supplyPhotos: { name: string; url: string }[]  // water/power access photos
  photos: { name: string; url: string }[]        // general facade photos
}

// ─── Building MBR dimensions (from Overpass polygon analysis) ─────────────────

export interface BuildingDimensions {
  width_m: number     // longer side
  depth_m: number     // shorter side
  sides_m: number[]   // [w, d, w, d] for rectangular building
  angle_deg: number
  name?: string | null
  address?: string | null
}

// ─── Form data (full) ────────────────────────────────────────────────────────

export interface QuoteFormData {
  clientName: string
  address: string
  lat: number
  lng: number
  serviceType: ServiceType
  urgent: boolean
  buildingType: BuildingType
  floors: number
  numBuildings: number          // how many buildings on the same project site
  numFacades: number            // facades per building
  timeSlot: TimeSlot
  facadeInputs: QuoteFacadeInput[]
  expectedDate?: string         // YYYY-MM-DD; drives weather risk advisory
}

// ─── Mapping tables ─────────────────────────────────────────────────────────

const DEFAULT_MATERIAL: Record<BuildingType, FacadeMaterial> = {
  commercial: "glass", luxury: "stone", house: "tile", factory: "metal", solar: "solar",
}

// ─── Default building dimensions ────────────────────────────────────────────

const BUILDING_DIMENSIONS: Record<BuildingType, { width_m: number; depth_m: number }> = {
  commercial: { width_m: 25, depth_m: 25 },
  luxury:     { width_m: 20, depth_m: 20 },
  house:      { width_m: 5,  depth_m: 15 },
  factory:    { width_m: 50, depth_m: 30 },
  solar:      { width_m: 10, depth_m: 5  },
}

// ─── Risk level from floors ──────────────────────────────────────────────────

export function inferRiskLevel(floors: number): RiskLevel {
  if (floors <= 10) return "R0"
  if (floors <= 20) return "R1"
  return "R2"
}

// ─── Area estimation ─────────────────────────────────────────────────────────

export type AreaSource = "overpass" | "manual-draw" | "default"

export interface AreaEstimate {
  source: AreaSource
  perimeter_m: number
  facade_width_m: number          // average (for display)
  building_height_m: number
  facade_area_m2: number          // average facade area
  total_area_m2: number
  num_facades: number
  facadeWidths_m?: number[]       // actual per-facade widths when MBR is available
}

const FLOOR_HEIGHT_M = 3.5

export function estimateFromPerimeter(
  perimeter_m: number,
  floors: number,
  numFacades: number,
  source: AreaSource = "overpass"
): AreaEstimate {
  const facadeWidth = Math.round(perimeter_m / numFacades)
  const height = floors * FLOOR_HEIGHT_M
  const facadeArea = Math.round(facadeWidth * height)
  return {
    source,
    perimeter_m: Math.round(perimeter_m),
    facade_width_m: facadeWidth,
    building_height_m: height,
    facade_area_m2: facadeArea,
    total_area_m2: facadeArea * numFacades,
    num_facades: numFacades,
  }
}

/** Use actual MBR width × depth from polygon analysis — most accurate */
export function estimateFromDimensions(
  dims: BuildingDimensions,
  floors: number,
  numFacades: number,
): AreaEstimate {
  const height = floors * FLOOR_HEIGHT_M
  // Assign side widths to each requested facade (repeating w,d,w,d pattern)
  const facadeWidths = Array.from({ length: numFacades }, (_, i) => {
    // sides_m is [w, d, w, d] for a rect; cycle if fewer sides defined
    return dims.sides_m[i % dims.sides_m.length] ?? dims.width_m
  })
  const totalArea = Math.round(facadeWidths.reduce((s, w) => s + w * height, 0))
  const avgWidth = Math.round(facadeWidths.reduce((s, w) => s + w, 0) / numFacades)
  const perimeter = 2 * (dims.width_m + dims.depth_m)
  return {
    source: "overpass",
    perimeter_m: Math.round(perimeter),
    facade_width_m: avgWidth,
    building_height_m: height,
    facade_area_m2: Math.round(totalArea / numFacades),
    total_area_m2: totalArea,
    num_facades: numFacades,
    facadeWidths_m: facadeWidths,
  }
}

export function estimateFromDefaults(
  buildingType: BuildingType,
  floors: number,
  numFacades: number,
): AreaEstimate {
  const dims = BUILDING_DIMENSIONS[buildingType]
  const perimeter = 2 * (dims.width_m + dims.depth_m)
  return estimateFromPerimeter(perimeter, floors, numFacades, "default")
}

export function estimateFromRect(
  width_m: number,
  depth_m: number,
  floors: number,
  numFacades: number,
): AreaEstimate {
  const perimeter = 2 * (width_m + depth_m)
  return estimateFromPerimeter(perimeter, floors, numFacades, "manual-draw")
}

// ─── Default facade inputs ───────────────────────────────────────────────────

const FACE_LABELS = ["A", "B", "C", "D"]
const BUILDING_LABELS = ["A", "B", "C", "D", "E", "F"]

export function buildDefaultFacadeInputs(numFacades: number, numBuildings: number = 1): QuoteFacadeInput[] {
  const result: QuoteFacadeInput[] = []
  for (let b = 0; b < numBuildings; b++) {
    const buildingLabel = numBuildings > 1 ? (BUILDING_LABELS[b] ?? String(b + 1)) : ""
    for (let i = 0; i < numFacades; i++) {
      result.push({
        id: `${b}-${i}`,
        buildingIndex: b,
        buildingLabel,
        label: FACE_LABELS[i] ?? String(i + 1),
        dirtTypes: ["dust"] as DirtType[],
        complexity: "light" as Complexity,
        hasRecesses: false,
        isHighRisk: false,
        waterSupply: "Provided" as Supply,
        powerSupply: "Provided" as Supply,
        powerVoltage: ["110V", "220V"] as PowerVoltage[],
        supplyPhotos: [],
        photos: [],
      })
    }
  }
  return result
}

// ─── Contamination: derive from multi-select dirt types ──────────────────────

export function inferContamination(dirtTypes: DirtType[]): Contamination {
  if (dirtTypes.length === 0) return "dust"
  if (dirtTypes.length >= 2) return "multi"
  const map: Record<DirtType, Contamination> = {
    dust: "dust", scale: "scale", mold: "mold", grease: "grease",
  }
  return map[dirtTypes[0]]
}

/** Worst contamination across all facades (for engine input) */
export function worstContamination(facadeInputs: QuoteFacadeInput[]): Contamination {
  const priority: Contamination[] = ["multi", "grease", "mold", "scale", "dust"]
  const all = facadeInputs.map(f => inferContamination(f.dirtTypes))
  for (const p of priority) {
    if (all.includes(p)) return p
  }
  return "dust"
}

/** If ANY facade needs self-supply, use SelfSupply (conservative) */
export function aggregateSupply(facadeInputs: QuoteFacadeInput[], type: "water" | "power"): Supply {
  const field = type === "water" ? "waterSupply" : "powerSupply"
  return facadeInputs.some(f => f[field] === "SelfSupply") ? "SelfSupply" : "Provided"
}

// ─── Build FacadeData[] for engine input ─────────────────────────────────────

export function buildFacadesFromInputs(
  facadeInputs: QuoteFacadeInput[],
  estimate: AreaEstimate,
  buildingType: BuildingType,
): FacadeData[] {
  const material = DEFAULT_MATERIAL[buildingType]
  const height = estimate.building_height_m
  const facadesPerBuilding = estimate.num_facades
  return facadeInputs.map((input, globalIndex) => {
    // Cycle per-facade widths within each building (MBR applies to one building)
    const facadeIndexInBuilding = globalIndex % facadesPerBuilding
    const width_m = estimate.facadeWidths_m?.[facadeIndexInBuilding] ?? (estimate.facade_area_m2 / height)
    const area_m2 = Math.round(width_m * height)
    // Build display label: "棟A-A" when multi-building, else just "A"
    const displayLabel = input.buildingLabel ? `棟${input.buildingLabel}-${input.label}` : input.label
    return {
      id: input.id,
      label: displayLabel,
      area_m2,
      material,
      complexity: input.complexity,
      road_closure: false,
      tight_perimeter: input.hasRecesses,
      high_risk_env: input.isHighRisk,
    }
  })
}

/** Fallback: build facades from estimate when no per-facade inputs exist */
export function buildFacades(
  estimate: AreaEstimate,
  buildingType: BuildingType,
): FacadeData[] {
  const material = DEFAULT_MATERIAL[buildingType]
  return Array.from({ length: estimate.num_facades }, (_, i) => ({
    id: String(i + 1),
    label: FACE_LABELS[i] ?? String(i + 1),
    area_m2: estimate.facade_area_m2,
    material,
    complexity: "light" as Complexity,
    road_closure: false,
    tight_perimeter: false,
    high_risk_env: false,
  }))
}

// ─── Engine input mapping ────────────────────────────────────────────────────

export function mapServiceToMissionType(s: ServiceType) {
  const map = { cleaning: "Cleaning", coating: "Coating", inspection: "Inspection" } as const
  return map[s]
}

export function mapTimeSlot(t: TimeSlot): TimeWindow {
  return t as TimeWindow
}

// ─── Overpass polygon perimeter ──────────────────────────────────────────────

export function calcPolygonPerimeter(points: { lat: number; lon: number }[]): number {
  if (points.length < 3) return 0
  let total = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]
    const b = points[(i + 1) % points.length]
    total += haversineM(a.lat, a.lon, b.lat, b.lon)
  }
  return total
}

function haversineM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
