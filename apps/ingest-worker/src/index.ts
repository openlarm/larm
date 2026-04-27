import { createDb } from "./db.js"
import { buildSchedule, startScheduler } from "./scheduler.js"
import { startHealthServer } from "./health.js"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error("DATABASE_URL required")

const db = createDb(DATABASE_URL)
const schedule = buildSchedule()

startScheduler(db, schedule)
startHealthServer(db.sql, Number(process.env.PORT ?? 3000))

console.log(`[worker] started with ${schedule.length} scheduled jobs`)

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received, shutting down")
  await db.sql.end({ timeout: 5 })
  process.exit(0)
})
