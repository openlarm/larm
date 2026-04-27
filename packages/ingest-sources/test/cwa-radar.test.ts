import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { runCwaRadar } from "../src/cwa/radar"
import type { IngestDb } from "@openlarm/ingest-types"
import type { StorageClient } from "../src/util/storage"

describe("runCwaRadar", () => {
  const fakeImage = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

  let mockDb: IngestDb
  let mockStorage: StorageClient

  beforeEach(() => {
    vi.stubEnv("CWA_API_KEY", "test-key")

    mockStorage = {
      upload: vi.fn(async (path: string, blob: Blob) => ({
        path,
        fullPath: `cwa-radar/${path}`,
        size: blob.size,
      })),
    } satisfies Partial<StorageClient> as StorageClient

    mockDb = {
      insertGridded: vi.fn(async () => 1),
      recordFetchStart: vi.fn(async () => ({ id: 1, startedAt: new Date() })),
      recordFetchEnd: vi.fn(async () => {}),
      upsertObservations: vi.fn(),
      upsertForecasts: vi.fn(),
      upsertEnsemble: vi.fn(),
      upsertLightning: vi.fn(),
      getBudget: vi.fn(),
      incrementBudget: vi.fn(),
    } satisfies Partial<IngestDb> as IngestDb

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(fakeImage, {
          status: 200,
          headers: { "content-type": "image/png" },
        }),
      ),
    )
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it("uploads PNG to storage and inserts metadata row", async () => {
    const fixedNow = new Date("2026-04-27T02:00:00.000Z") // 10:00 +08:00 in UTC
    await runCwaRadar({
      db: mockDb,
      now: () => fixedNow,
      storage: mockStorage,
    })

    expect(mockStorage.upload).toHaveBeenCalledOnce()
    const [uploadedPath] = (mockStorage.upload as ReturnType<typeof vi.fn>).mock.calls[0] as [string, Blob]
    expect(uploadedPath).toMatch(/^2026-04-27\/cwa-radar-\d{14}\.png$/)

    expect(mockDb.insertGridded).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "cwa_radar",
        variable: "reflect",
      }),
    )
  })

  it("skips upload + insert when fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 503 })),
    )

    await expect(
      runCwaRadar({ db: mockDb, now: () => new Date(), storage: mockStorage }),
    ).rejects.toThrow("CWA radar HTTP 503")

    expect(mockDb.recordFetchEnd).toHaveBeenCalledWith(
      1,
      "failed",
      expect.objectContaining({ error_message: expect.any(String) }),
    )
    expect(mockStorage.upload).not.toHaveBeenCalled()
    expect(mockDb.insertGridded).not.toHaveBeenCalled()
  })

  it("preserves stack trace in error_message on storage failure", async () => {
    const storageError = new Error("bucket not found")
    ;(mockStorage.upload as ReturnType<typeof vi.fn>).mockRejectedValueOnce(storageError)

    await expect(
      runCwaRadar({ db: mockDb, now: () => new Date(), storage: mockStorage }),
    ).rejects.toThrow("bucket not found")

    const [, , payload] = (mockDb.recordFetchEnd as ReturnType<typeof vi.fn>).mock.calls[0] as [number, string, { error_message: string }]
    expect(payload.error_message).toContain("bucket not found")
    expect(payload.error_message).toContain("Error:")
  })
})
