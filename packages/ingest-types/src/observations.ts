import { z } from "zod"

export const NormalizedObservationSchema = z.object({
  ts: z.string(),                    // ISO 8601 with timezone
  source: z.string(),                // 'cwa_aws', 'epa_aq', etc.
  station_id: z.string(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  wind_kmh: z.number().nullable().optional(),
  wind_dir_deg: z.number().min(0).max(360).nullable().optional(),
  gust_kmh: z.number().nullable().optional(),
  temp_c: z.number().nullable().optional(),
  rh_pct: z.number().min(0).max(100).nullable().optional(),
  pressure_hpa: z.number().nullable().optional(),
  rain_mm_10min: z.number().min(0).nullable().optional(),
  rain_mm_1h: z.number().min(0).nullable().optional(),
  rain_mm_24h: z.number().min(0).nullable().optional(),
  qc_flags: z.record(z.unknown()).optional(),
  raw_payload: z.unknown().optional(),
})

export type NormalizedObservation = z.infer<typeof NormalizedObservationSchema>
