import type {
  BuildingType, Complexity, Contamination, RiskLevel,
  TimeWindow, Supply, FacadeData, PricingResult, PricingLineItem,
  CleaningAgent, RooftopAccess,
} from "@/lib/types"

// ─── Base unit prices (NTD/m²) ────────────────────────────────────────────────

const BASE_PRICE: Record<BuildingType, number> = {
  commercial: 30, luxury: 33, house: 200, factory: 28, solar: 8,
}

// ─── Per-face surcharges (Section B) ─────────────────────────────────────────

const COMPLEXITY_SURCHARGE: Record<Complexity, number> = {
  none: 0, light: 4, medium: 6, heavy: 8,
}
// road_closure: +4, tight_perimeter: +6, high_risk_env: +7, adjacent_trees: +5 applied inline
// waterSupply SelfSupply: +7, powerSupply SelfSupply: +7, rooftopAccess !Good: +12

// ─── Project-wide surcharges (Section C) ─────────────────────────────────────

const CONTAMINATION_SURCHARGE: Record<Contamination, number> = {
  dust: 0, scale: 7, bird: 4, mold: 5, exhaust: 6, grease: 12,
}
const CONTAMINATION_CAP = 15 // max stacked contamination surcharge per m²

const CLEANING_AGENT_SURCHARGE: Record<CleaningAgent, number> = {
  water: 0, neutral: 3, acid: 10, alkali: 10,
}

// ─── Multipliers (Section D) ──────────────────────────────────────────────────

const FLOOR_MULTIPLIER = (floors: number) =>
  floors > 30 ? 3.0 : floors > 20 ? 2.0 : floors > 10 ? 1.3 : 1.0

const TIME_WINDOW_MULTIPLIER: Record<TimeWindow, number> = {
  day: 1.0, weekend: 1.2, night: 1.5,
}

const RISK_MULTIPLIER: Record<RiskLevel, number | null> = {
  R0: 1.00, R1: 1.05, R2: 1.15, R3: 1.40, R4: null,
}

const MIN_ORDER = 15000 // NTD

// ─── Main function ────────────────────────────────────────────────────────────

export interface PricingEngineInput {
  buildingType: BuildingType
  floors: number
  facades: FacadeData[]
  contamination: Contamination[]      // stackable; surcharges summed, capped at 15
  cleaningAgent: CleaningAgent        // project-wide cleaning agent type
  timeWindow: TimeWindow
  riskLevel: RiskLevel
  waterSupply: Supply
  powerSupply: Supply
  rooftopAccess: RooftopAccess
  urgent: boolean
}

export function generateQuote(input: PricingEngineInput): PricingResult {
  const {
    buildingType, floors, facades, contamination, cleaningAgent,
    timeWindow, riskLevel, waterSupply, powerSupply, rooftopAccess, urgent,
  } = input

  const basePrice = BASE_PRICE[buildingType]

  // ── Section C: project-wide unit price adders (same for every face) ──────
  const contaminationSurcharge = Math.min(
    contamination.reduce((sum, c) => sum + CONTAMINATION_SURCHARGE[c], 0),
    CONTAMINATION_CAP,
  )
  const cleaningAgentSurcharge = CLEANING_AGENT_SURCHARGE[cleaningAgent]
  const projectWideSurcharge = contaminationSurcharge + cleaningAgentSurcharge

  // ── Section B: building-level per-face adders (same value for every face) ─
  const waterSurcharge   = waterSupply   === "SelfSupply" ? 7  : 0
  const powerSurcharge   = powerSupply   === "SelfSupply" ? 7  : 0
  const rooftopSurcharge = rooftopAccess !== "Good"       ? 12 : 0

  const lineItems: PricingLineItem[] = []
  let subtotal = 0

  for (const facade of facades) {
    const complexitySurcharge = COMPLEXITY_SURCHARGE[facade.complexity]
    const roadSurcharge       = facade.road_closure    ? 4 : 0
    const tightSurcharge      = facade.tight_perimeter ? 6 : 0
    const riskEnvSurcharge    = facade.high_risk_env   ? 7 : 0
    const treeSurcharge       = facade.adjacent_trees  ? 5 : 0   // whole-face access surcharge

    const unitPrice =
      basePrice +
      complexitySurcharge +
      roadSurcharge +
      tightSurcharge +
      riskEnvSurcharge +
      treeSurcharge +
      waterSurcharge +
      powerSurcharge +
      rooftopSurcharge +
      projectWideSurcharge

    // ── Tree-floor area handling ────────────────────────────────────────────
    // tree_area_m2: m² covered by adjacent trees
    // clean_tree_floors: true → include those m² at unitPrice+10; false → exclude them
    let effectiveArea: number
    let facetSubtotal: number
    let itemLabel: string

    if (facade.adjacent_trees && facade.tree_area_m2 > 0) {
      if (facade.clean_tree_floors) {
        const normalArea = facade.area_m2 - facade.tree_area_m2
        facetSubtotal =
          normalArea * unitPrice +
          facade.tree_area_m2 * (unitPrice + 10)
        effectiveArea = facade.area_m2
        itemLabel = `立面 ${facade.label}（${facade.area_m2}㎡，含鄰樹${facade.tree_area_m2}㎡×+10）`
      } else {
        effectiveArea = facade.area_m2 - facade.tree_area_m2
        facetSubtotal = effectiveArea * unitPrice
        itemLabel = `立面 ${facade.label}（${effectiveArea}㎡，鄰樹${facade.tree_area_m2}㎡不計）`
      }
    } else {
      effectiveArea = facade.area_m2
      facetSubtotal = effectiveArea * unitPrice
      itemLabel = `立面 ${facade.label}（${facade.area_m2}㎡）`
    }

    subtotal += facetSubtotal
    lineItems.push({
      code: `FACE-${facade.id}`,
      label: itemLabel,
      unit_price: effectiveArea > 0 ? Math.round(facetSubtotal / effectiveArea) : unitPrice,
      area_m2: effectiveArea,
      subtotal: facetSubtotal,
    })
  }

  // Ensure minimum order
  if (subtotal < MIN_ORDER) {
    const topup = MIN_ORDER - subtotal
    lineItems.push({ code: "MIN-ORDER", label: "最低作業費用補差", subtotal: topup })
    subtotal = MIN_ORDER
  }

  // ── Section D: multipliers ────────────────────────────────────────────────
  const mFloor  = FLOOR_MULTIPLIER(floors)
  const mTime   = TIME_WINDOW_MULTIPLIER[timeWindow]
  const mRisk   = RISK_MULTIPLIER[riskLevel] ?? 1.0
  const mUrgent = urgent ? 1.33 : 1.0

  const multiplier = mFloor * mTime * mRisk * mUrgent
  const total = Math.round(subtotal * multiplier)

  const today = new Date()
  const validUntil = new Date(today)
  validUntil.setDate(today.getDate() + 30)
  const quoteCode = `Q-${today.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`

  return {
    line_items: lineItems,
    subtotal: Math.round(subtotal),
    multiplier: Math.round(multiplier * 100) / 100,
    multiplier_breakdown: {
      floor: mFloor,
      time_window: mTime,
      risk: mRisk,
      urgent: mUrgent,
    },
    total,
    currency: "NTD",
    quote_code: quoteCode,
    valid_until: validUntil.toISOString().split("T")[0],
    pricing_version: "v1.0",
  }
}
