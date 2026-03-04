// ─── Pricing Parameters (configurable via Admin Params UI) ────────────────────
//
// Mirrors the pattern of weather-regime-params.ts:
// - Default values defined here
// - getPricingParams() reads localStorage override on client, falls back to defaults on server
// - Admin Params UI pricing tab writes to localStorage key "pricing_params_override"

import type { BuildingType, Complexity, Contamination, CleaningAgent, TimeWindow, RooftopAccess } from "@/lib/types"

// ─── Interface ───────────────────────────────────────────────────────────────

export interface PricingParams {
  /** Base unit prices per building type (NTD/m²) */
  base_price: Record<BuildingType, number>

  /** Facade complexity surcharge (NTD/m²) */
  complexity_surcharge: Record<Complexity, number>

  /** Contamination type surcharge — stackable (NTD/m²) */
  contamination_surcharge: Record<Contamination, number>
  /** Max stacked contamination surcharge per m² */
  contamination_cap: number

  /** Cleaning agent surcharge (NTD/m²) */
  cleaning_agent_surcharge: Record<CleaningAgent, number>

  /** Per-facade condition surcharges (NTD/m²) */
  facade_surcharges: {
    road_closure: number
    tight_perimeter: number
    high_risk_env: number
    adjacent_trees: number
    tree_extra: number        // additional surcharge for cleaning tree-covered floors
  }

  /** Building-level supply surcharges (NTD/m²) */
  supply_surcharges: {
    water_self: number
    power_self: number
    rooftop_not_good: number
  }

  /** Floor multiplier thresholds */
  floor_multiplier: { max_floor: number; multiplier: number }[]

  /** Time window multiplier */
  time_window_multiplier: Record<TimeWindow, number>

  /** Urgent job multiplier (applied when deadline ≤ 30 days) */
  urgent_multiplier: number

  /** Minimum order amount (NTD) */
  min_order: number

  /** Version tag */
  version: string
}

// ─── Defaults ────────────────────────────────────────────────────────────────

export const PRICING_PARAMS_DEFAULT: PricingParams = {
  base_price: {
    commercial: 30,
    luxury: 33,
    house: 200,
    factory: 28,
    solar: 8,
  },

  complexity_surcharge: {
    none: 0,
    light: 4,
    medium: 6,
    heavy: 8,
  },

  contamination_surcharge: {
    dust: 0,
    scale: 7,
    bird: 4,
    mold: 5,
    exhaust: 6,
    grease: 12,
  },
  contamination_cap: 15,

  cleaning_agent_surcharge: {
    water: 0,
    neutral: 3,
    acid: 10,
    alkali: 10,
  },

  facade_surcharges: {
    road_closure: 4,
    tight_perimeter: 6,
    high_risk_env: 7,
    adjacent_trees: 5,
    tree_extra: 10,
  },

  supply_surcharges: {
    water_self: 7,
    power_self: 7,
    rooftop_not_good: 12,
  },

  floor_multiplier: [
    { max_floor: 10,  multiplier: 1.0 },
    { max_floor: 20,  multiplier: 1.3 },
    { max_floor: 30,  multiplier: 2.0 },
    { max_floor: 9999, multiplier: 3.0 },
  ],

  time_window_multiplier: {
    day: 1.0,
    weekend: 1.2,
    night: 1.5,
  },

  urgent_multiplier: 1.33,

  min_order: 15000,

  version: "v1.0",
}

// ─── LocalStorage key ────────────────────────────────────────────────────────

const LS_KEY = "pricing_params_override"

// ─── Reader ──────────────────────────────────────────────────────────────────

export function getPricingParams(): PricingParams {
  if (typeof window === "undefined") return PRICING_PARAMS_DEFAULT
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return PRICING_PARAMS_DEFAULT
    return { ...PRICING_PARAMS_DEFAULT, ...JSON.parse(raw) }
  } catch {
    return PRICING_PARAMS_DEFAULT
  }
}
