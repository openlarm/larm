import http from "http"
import type postgres from "postgres"

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
        const stale = (sources as unknown as Array<{ last_success: string | null; consecutive_failures: number }>).filter(
          (s) => !s.last_success || Date.now() - new Date(s.last_success).getTime() > 3_600_000
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
  server.listen(port, () => console.log(`[health] listening on :${port}`))
  return server
}
