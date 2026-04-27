const CWA_SENTINEL = -99
export function cleanCwaValue(v: number | null | undefined): number | null {
  if (v === null || v === undefined) return null
  if (v === CWA_SENTINEL || v <= -90) return null
  return v
}

export function isPlausibleWind(kmh: number | null): boolean {
  if (kmh === null) return true
  return kmh >= 0 && kmh <= 200
}

export function isPlausibleTemp(c: number | null): boolean {
  if (c === null) return true
  return c >= -40 && c <= 60
}
