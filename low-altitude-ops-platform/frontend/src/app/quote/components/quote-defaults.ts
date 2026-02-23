// ─── Quick Quote: mapping tables, smart defaults, area estimation ────────────

import type {
  BuildingType, FacadeData, FacadeMaterial, Complexity,
  Contamination, RiskLevel, TimeWindow,
} from "@/lib/types"

// ─── Business-friendly labels → engine values ────────────────────────────────

export type ServiceType = "cleaning" | "coating" | "inspection"
export type DirtLevel = "light" | "moderate" | "heavy"
export type TimeSlot = "day" | "weekend" | "night"

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

export const DIRT_OPTIONS: { value: DirtLevel; label: string; desc: string }[] = [
  { value: "light", label: "輕微", desc: "灰塵 / 水漬" },
  { value: "moderate", label: "中度", desc: "鏽斑 / 青苔" },
  { value: "heavy", label: "嚴重", desc: "油汙 / 重度附著" },
]

export const TIME_SLOT_OPTIONS: { value: TimeSlot; label: string }[] = [
  { value: "day", label: "一般白天" },
  { value: "weekend", label: "週末 / 假日" },
  { value: "night", label: "夜間施工" },
]

// ─── Mapping tables ─────────────────────────────────────────────────────────

const DIRT_MAP: Record<DirtLevel, Contamination> = {
  light: "dust", moderate: "scale", heavy: "grease",
}

const DEFAULT_MATERIAL: Record<BuildingType, FacadeMaterial> = {
  commercial: "glass", luxury: "stone", house: "tile", factory: "metal", solar: "solar",
}

const DEFAULT_COMPLEXITY: Record<BuildingType, Complexity> = {
  commercial: "light", luxury: "medium", house: "none", factory: "none", solar: "none",
}

// ─── Default building dimensions (fallback when no map data) ─────────────────

interface BuildingDefaults {
  width_m: number
  depth_m: number
}

const BUILDING_DIMENSIONS: Record<BuildingType, BuildingDefaults> = {
  commercial: { width_m: 25, depth_m: 25 },
  luxury: { width_m: 20, depth_m: 20 },
  house: { width_m: 5, depth_m: 15 },
  factory: { width_m: 50, depth_m: 30 },
  solar: { width_m: 10, depth_m: 5 },
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
  facade_width_m: number
  building_height_m: number
  facade_area_m2: number
  total_area_m2: number
  num_facades: number
}

const FLOOR_HEIGHT_M = 3.5

/** Estimate from Overpass building polygon perimeter */
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

/** Fallback: estimate from default building dimensions */
export function estimateFromDefaults(
  buildingType: BuildingType,
  floors: number,
  numFacades: number,
): AreaEstimate {
  const dims = BUILDING_DIMENSIONS[buildingType]
  const perimeter = 2 * (dims.width_m + dims.depth_m)
  return estimateFromPerimeter(perimeter, floors, numFacades, "default")
}

/** Estimate from user-drawn rectangle on map (width × depth in meters) */
export function estimateFromRect(
  width_m: number,
  depth_m: number,
  floors: number,
  numFacades: number,
): AreaEstimate {
  const perimeter = 2 * (width_m + depth_m)
  return estimateFromPerimeter(perimeter, floors, numFacades, "manual-draw")
}

// ─── Build FacadeData[] for engine input ─────────────────────────────────────

const FACE_LABELS = ["A", "B", "C", "D", "E", "F"]

export function buildFacades(
  estimate: AreaEstimate,
  buildingType: BuildingType,
): FacadeData[] {
  const material = DEFAULT_MATERIAL[buildingType]
  const complexity = DEFAULT_COMPLEXITY[buildingType]

  return Array.from({ length: estimate.num_facades }, (_, i) => ({
    id: String(i + 1),
    label: FACE_LABELS[i] ?? String(i + 1),
    area_m2: estimate.facade_area_m2,
    material,
    complexity,
    road_closure: false,
    tight_perimeter: false,
    high_risk_env: false,
  }))
}

// ─── Build full engine inputs from quote form ────────────────────────────────

export interface QuoteFormData {
  clientName: string
  address: string
  lat: number
  lng: number
  serviceType: ServiceType
  urgent: boolean
  buildingType: BuildingType
  floors: number
  numFacades: number
  dirtLevel: DirtLevel
  timeSlot: TimeSlot
  overrideWidthM?: number   // manual override for facade width
}

export function mapServiceToMissionType(s: ServiceType) {
  const map = { cleaning: "Cleaning", coating: "Coating", inspection: "Inspection" } as const
  return map[s]
}

export function mapTimeSlot(t: TimeSlot): TimeWindow {
  return t as TimeWindow
}

export function mapDirtLevel(d: DirtLevel): Contamination {
  return DIRT_MAP[d]
}

// ─── Overpass building perimeter calculation ─────────────────────────────────

/** Calculate perimeter in meters from a polygon (array of {lat, lon} points) */
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
  const R = 6371000 // meters
  const dLat = (lat2 - lat1) * (Math.PI / 180)
  const dLon = (lon2 - lon1) * (Math.PI / 180)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) *
    Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}
