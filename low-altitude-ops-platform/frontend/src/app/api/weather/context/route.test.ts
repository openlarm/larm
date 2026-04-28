import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/db", () => ({
  db: {
    sql: vi.fn(async () => []),
  },
}))

import { GET } from "./route"

describe("GET /api/weather/context", () => {
  it("returns 503 when DB has no fresh observations", async () => {
    const req = new Request("http://localhost/api/weather/context?lat=25&lng=121")
    const res = await GET(req)
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toMatch(/unavailable/i)
  })

  it("returns 400 when lat/lng are missing", async () => {
    const req = new Request("http://localhost/api/weather/context")
    const res = await GET(req)
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/lat/)
  })
})
