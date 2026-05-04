// CWA uses -99 as the canonical missing-value sentinel, plus -991, -995, etc.
// for various calibration codes. Anything ≤ -90 is treated as missing.
export function cleanCwaValue(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (v <= -90) return null
  return v
}

export function isPlausibleWind(kmh: number | null): boolean {
  if (kmh === null) return true
  // Taiwan AWS records: sustained ~216 km/h (Lan-Yu typhoons), gusts can hit ~280 km/h.
  // Above this is almost certainly sensor failure, not a real reading.
  return kmh >= 0 && kmh <= 280
}

export function isPlausibleTemp(c: number | null): boolean {
  if (c === null) return true
  return c >= -40 && c <= 60
}
