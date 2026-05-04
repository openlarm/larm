export type Freshness = "fresh" | "degraded" | "stale"

export class DataUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "DataUnavailableError"
  }
}

export function classifyFreshness(observedAt: Date, now = new Date()): Freshness {
  const ageMin = (now.getTime() - observedAt.getTime()) / 60_000
  if (ageMin <= 30) return "fresh"
  if (ageMin <= 120) return "degraded"
  if (ageMin <= 360) return "stale"
  throw new DataUnavailableError(`observation is ${Math.round(ageMin)} min old (>6h)`)
}
