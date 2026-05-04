import { describe, it, expect, vi } from "vitest"
import { buildSchedule, runOnceForTest } from "../src/scheduler"

describe("scheduler", () => {
  it("registers a cron entry per source", () => {
    const mockStorage = {
      upload: async () => ({ path: "p", fullPath: "fp", size: 0 }),
    }
    const schedule = buildSchedule({ storage: mockStorage })
    expect(schedule.length).toBeGreaterThanOrEqual(6)
    expect(schedule.find((s) => s.name === "cwa_aws")).toBeDefined()
    expect(schedule.find((s) => s.name === "open_meteo_forecast")).toBeDefined()
  })

  it("runs a job once and logs duration", async () => {
    const fakeRun = vi.fn(async () => ({ rows_written: 10, rows_rejected: 0, duration_ms: 50 }))
    const fakeDb = {
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
    } as any
    const result = await runOnceForTest({ name: "test_source", run: fakeRun }, fakeDb)
    expect(result.status).toBe("ok")
    expect(fakeRun).toHaveBeenCalledOnce()
  })

  it("marks status=failed on throw", async () => {
    const fakeRun = vi.fn(async () => { throw new Error("boom") })
    const fakeDb = {
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
    } as any
    const result = await runOnceForTest({ name: "test_source", run: fakeRun }, fakeDb)
    expect(result.status).toBe("failed")
  })
})
