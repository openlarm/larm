// ─── Next.js Instrumentation Hook ─────────────────────────────────────────────
//
// This file runs once when the Next.js server starts (before any requests).
// It patches the global fetch() to route outgoing HTTPS requests through the
// system proxy (HTTPS_PROXY env var) when running in environments that set it.
//
// Node.js 22's built-in fetch (via undici) does NOT automatically respect
// HTTP_PROXY / HTTPS_PROXY env vars, unlike curl. This instrumentation fills
// that gap so API routes can reach external services in proxied environments.

export async function register() {
  // Only patch when running on the server side and a proxy is configured
  if (process.env.NEXT_RUNTIME === "edge") return
  if (!process.env.HTTPS_PROXY && !process.env.HTTP_PROXY) return

  const proxyUrl = process.env.HTTPS_PROXY || process.env.HTTP_PROXY
  if (!proxyUrl) return

  // Dynamic import to avoid edge-runtime bundle issues
  const { HttpsProxyAgent } = await import("https-proxy-agent")
  const https = await import("https")
  const agent = new HttpsProxyAgent(proxyUrl)

  const noProxy = (process.env.NO_PROXY || process.env.no_proxy || "").split(",").map(h => h.trim())

  function shouldProxy(url: string): boolean {
    return !noProxy.some(host => {
      if (!host) return false
      const h = host.replace(/^\*\./, "")
      return url.includes(h)
    })
  }

  const _originalFetch = globalThis.fetch

  // Replace global fetch with a version that routes HTTPS calls via the proxy
  globalThis.fetch = async function patchedFetch(
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : (input as Request).url

    // Only proxy outgoing HTTPS calls that aren't excluded
    if (!url.startsWith("https://") || !shouldProxy(url)) {
      return _originalFetch(input, init)
    }

    return new Promise<Response>((resolve, reject) => {
      const parsed = new URL(url)
      const reqOptions: Record<string, unknown> = {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: (init?.method as string) || "GET",
        agent,
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; GDS-WeatherProxy/1.0)",
          ...(init?.headers as Record<string, string> | undefined),
        },
      }

      const req = https.request(reqOptions, (res) => {
        const chunks: Buffer[] = []
        res.on("data", (chunk: Buffer) => chunks.push(chunk))
        res.on("end", () => {
          const body = Buffer.concat(chunks)
          const status = res.statusCode ?? 0
          const headers = new Headers(res.headers as Record<string, string>)

          resolve(new Response(body, { status, headers }))
        })
      })
      req.on("error", reject)
      if (init?.body) req.write(init.body as string)
      req.end()
    })
  }
}
