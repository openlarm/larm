import type { IngestDb } from "@openlarm/ingest-types"

export class BudgetExceededError extends Error {
  constructor(source: string, used: number, capacity: number) {
    super(`${source} daily budget exhausted: ${used}/${capacity}`)
    this.name = "BudgetExceededError"
  }
}

export async function checkAndConsumeBudget(
  db: IngestDb,
  source: string,
  capacity: number,
  cost = 1
): Promise<void> {
  const { used } = await db.getBudget(source)
  if (used + cost > capacity) {
    throw new BudgetExceededError(source, used, capacity)
  }
  await db.incrementBudget(source, cost)
}
