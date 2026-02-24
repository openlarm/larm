import type {
  BuildingType, Complexity, Contamination, RiskLevel,
  TimeWindow, Supply, FacadeData, PricingResult, PricingLineItem,
} from "@/lib/types"

// ─── Base unit prices (NTD/m²) ────────────────────────────────────────────────

const BASE_PRICE: Record<BuildingType, number> = {
  commercial: 30, luxury: 33, house: 200, factory: 28, solar: 8,
}

// ─── Per-face surcharges ──────────────────────────────────────────────────────

const COMPLEXITY_SURCHARGE: Record<Complexity, number> = {
  none: 0, light: 4, medium: 6, heavy: 8,
}

// ─── Project-wide surcharges ──────────────────────────────────────────────────

const CONTAMINATION_SURCHARGE: Record<Contamination, number> = {
  dust: 0, scale: 7, mold: 5, bird: 8, grease: 12, multi: 15,
}

const CONTAMINATION_CAP = 15

// ─── Multipliers ──────────────────────────────────────────────────────────────

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
  contamination: Contamination
  timeWindow: TimeWindow
  riskLevel: RiskLevel
  waterSupply: Supply
  powerSupply: Supply
  urgent: boolean
}

export function generateQuote(input: PricingEngineInput): PricingResult {
  const { buildingType, floors, facades, contamination, timeWindow, riskLevel, urgent } = input

  const basePrice = BASE_PRICE[buildingType]
  const contaminationSurcharge = Math.min(CONTAMINATION_SURCHARGE[contamination], CONTAMINATION_CAP)
  const lineItems: PricingLineItem[] = []

  let subtotal = 0

  for (const facade of facades) {
    const complexitySurcharge = COMPLEXITY_SURCHARGE[facade.complexity]
    const roadSurcharge = facade.road_closure ? 4 : 0
    const tightSurcharge = facade.tight_perimeter ? 6 : 0
    const riskEnvSurcharge = facade.high_risk_env ? 7 : 0

    const unitPrice =
      basePrice +
      complexitySurcharge +
      roadSurcharge +
      tightSurcharge +
      riskEnvSurcharge +
      contaminationSurcharge

    const facetSubtotal = facade.area_m2 * unitPrice
    subtotal += facetSubtotal

    lineItems.push({
      code: `FACE-${facade.id}`,
      label: `立面 ${facade.label}（${facade.area_m2}㎡）`,
      unit_price: unitPrice,
      area_m2: facade.area_m2,
      subtotal: facetSubtotal,
    })
  }

  // Ensure minimum order
  if (subtotal < MIN_ORDER) {
    const topup = MIN_ORDER - subtotal
    lineItems.push({ code: "MIN-ORDER", label: "最低作業費用補差", subtotal: topup })
    subtotal = MIN_ORDER
  }

  // Multipliers
  const mFloor = FLOOR_MULTIPLIER(floors)
  const mTime = TIME_WINDOW_MULTIPLIER[timeWindow]
  const mRisk = RISK_MULTIPLIER[riskLevel] ?? 1.0
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
