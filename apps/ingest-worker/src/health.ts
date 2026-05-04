import http from "http"
import type postgres from "postgres"

const PROCESS_START = Date.now()

export function startHealthServer(
  sql: ReturnType<typeof postgres>,
  port = 3000
): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/healthz") {
      try {
        const sources = await sql`
          SELECT source, last_success, consecutive_failures FROM meta_sources
        `
        const ageMs = Date.now() - PROCESS_START
        const inWarmup = ageMs < 3_600_000

        const stale = (sources as unknown as Array<{ last_success: string | null; consecutive_failures: number }>).filter(
          (s) => {
            // Warmup grace period: don't penalize sources that haven't had their first success yet
            if (!s.last_success && inWarmup) return false
            if (!s.last_success) return true
            if (Date.now() - new Date(s.last_success).getTime() > 3_600_000) return true
            if (s.consecutive_failures >= 3) return true
            return false
          }
        )
        const status = stale.length === 0 ? 200 : 503
        res.writeHead(status, { "content-type": "application/json" })
        res.end(
          JSON.stringify({
            status: status === 200 ? "ok" : "degraded",
            uptime_s: Math.floor(process.uptime()),
            sources,
            stale_count: stale.length,
          })
        )
      } catch (err) {
        res.writeHead(503).end(JSON.stringify({ status: "error", error: String(err) }))
      }
      return
    }
    res.writeHead(404).end()
  })
  server.listen(port, "0.0.0.0", () => console.log(`[health] listening on 0.0.0.0:${port}`))
  return server
}
