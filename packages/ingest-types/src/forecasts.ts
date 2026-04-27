import { z } from "zod"

export const NormalizedForecastSchema = z.object({
  issued_at: z.string(),
  valid_at: z.string(),
  source: z.string(),
  lat: z.number(),
  lng: z.number(),
  region_id: z.string().nullable().optional(),
  wind_kmh: z.number().nullable().optional(),
  wind_dir_deg: z.number().nullable().optional(),
  gust_kmh: z.number().nullable().optional(),
  rain_prob_pct: z.number().min(0).max(100).nullable().optional(),
  rain_mmph: z.number().min(0).nullable().optional(),
  weather_code: z.string().nullable().optional(),
  raw_payload: z.unknown().optional(),
})

export type NormalizedForecast = z.infer<typeof NormalizedForecastSchema>

export const NormalizedEnsembleSchema = z.object({
  issued_at: z.string(),
  valid_at: z.string(),
  source: z.string(),
  lat: z.number(),
  lng: z.number(),
  variable: z.enum(["wind_kmh", "rain_mm", "temp_c", "gust_kmh"]),
  p10: z.number().nullable(),
  p50: z.number().nullable(),
  p90: z.number().nullable(),
  member_count: z.number().int(),
})

export type NormalizedEnsemble = z.infer<typeof NormalizedEnsembleSchema>
