import { createClient } from "@supabase/supabase-js"
import { createDb } from "./db.js"
import { buildSchedule, startScheduler } from "./scheduler.js"
import { startHealthServer } from "./health.js"
import type { StorageClient } from "./scheduler.js"

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error("DATABASE_URL required")

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required")
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

const STORAGE_BUCKET = "cwa-radar"

async function ensureBucket(name: string): Promise<void> {
  const { error } = await supabase.storage.createBucket(name, { public: false })
  if (error && !error.message.includes("already exists")) {
    throw new Error(`Failed to create bucket ${name}: ${error.message}`)
  }
}

const storage: StorageClient = {
  async upload(path: string, body: Blob, opts?: { contentType?: string }) {
    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, body, { contentType: opts?.contentType, upsert: true })
    if (error) throw error
    return {
      path: data.path,
      fullPath: `${STORAGE_BUCKET}/${data.path}`,
      size: body.size,
    }
  },
}

await ensureBucket(STORAGE_BUCKET)

const db = createDb(DATABASE_URL)
const schedule = buildSchedule({ storage })

startScheduler(db, schedule)
startHealthServer(db.sql, Number(process.env.PORT ?? 3000))

console.log(`[worker] started with ${schedule.length} scheduled jobs`)

process.on("SIGTERM", async () => {
  console.log("[worker] SIGTERM received, shutting down")
  await db.sql.end({ timeout: 5 })
  process.exit(0)
})
