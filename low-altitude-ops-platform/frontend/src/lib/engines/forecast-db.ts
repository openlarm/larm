// ─── IndexedDB wrapper for Forecast Accuracy Training ────────────────────────
// Database: "larm_forecast_db"
//   Store: "forecast_log"   → ForecastLogEntry records
//   Store: "bias_corrections" → ForecastBiasCorrection records
//
// Client-side only. All methods are no-ops if IndexedDB is unavailable (SSR).

import type { ForecastLogEntry, ForecastBiasCorrection } from "../types"

const DB_NAME = "larm_forecast_db"
const DB_VERSION = 1
const STORE_LOG = "forecast_log"
const STORE_BIAS = "bias_corrections"

function isClient(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined"
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_LOG)) {
        const logStore = db.createObjectStore(STORE_LOG, { keyPath: "id" })
        logStore.createIndex("date", "date", { unique: false })
        logStore.createIndex("location_key", "location_key", { unique: false })
        logStore.createIndex("lead_days", "lead_days", { unique: false })
      }
      if (!db.objectStoreNames.contains(STORE_BIAS)) {
        db.createObjectStore(STORE_BIAS, { keyPath: "location_key" })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

// ─── Forecast Log Operations ────────────────────────────────────────────────

export async function putLogEntries(entries: ForecastLogEntry[]): Promise<void> {
  if (!isClient() || entries.length === 0) return
  const db = await openDB()
  const tx = db.transaction(STORE_LOG, "readwrite")
  const store = tx.objectStore(STORE_LOG)
  for (const entry of entries) {
    store.put(entry)
  }
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getLogEntry(id: string): Promise<ForecastLogEntry | undefined> {
  if (!isClient()) return undefined
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOG, "readonly")
    const req = tx.objectStore(STORE_LOG).get(id)
    req.onsuccess = () => { db.close(); resolve(req.result as ForecastLogEntry | undefined) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function getLogEntriesByDate(date: string): Promise<ForecastLogEntry[]> {
  if (!isClient()) return []
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOG, "readonly")
    const idx = tx.objectStore(STORE_LOG).index("date")
    const req = idx.getAll(date)
    req.onsuccess = () => { db.close(); resolve(req.result as ForecastLogEntry[]) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function getLogEntriesByLocation(
  locationKey: string,
  sinceDate?: string,
): Promise<ForecastLogEntry[]> {
  if (!isClient()) return []
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOG, "readonly")
    const idx = tx.objectStore(STORE_LOG).index("location_key")
    const req = idx.getAll(locationKey)
    req.onsuccess = () => {
      db.close()
      let results = req.result as ForecastLogEntry[]
      if (sinceDate) {
        results = results.filter(e => e.date >= sinceDate)
      }
      resolve(results)
    }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function getAllLogEntries(): Promise<ForecastLogEntry[]> {
  if (!isClient()) return []
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOG, "readonly")
    const req = tx.objectStore(STORE_LOG).getAll()
    req.onsuccess = () => { db.close(); resolve(req.result as ForecastLogEntry[]) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function deleteOldLogEntries(beforeDate: string): Promise<number> {
  if (!isClient()) return 0
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_LOG, "readwrite")
    const store = tx.objectStore(STORE_LOG)
    const req = store.openCursor()
    let deleted = 0
    req.onsuccess = () => {
      const cursor = req.result
      if (cursor) {
        const entry = cursor.value as ForecastLogEntry
        if (entry.date < beforeDate) {
          cursor.delete()
          deleted++
        }
        cursor.continue()
      }
    }
    tx.oncomplete = () => { db.close(); resolve(deleted) }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

// ─── Bias Corrections Operations ────────────────────────────────────────────

export async function putBiasCorrection(correction: ForecastBiasCorrection): Promise<void> {
  if (!isClient()) return
  const db = await openDB()
  const tx = db.transaction(STORE_BIAS, "readwrite")
  tx.objectStore(STORE_BIAS).put(correction)
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { db.close(); resolve() }
    tx.onerror = () => { db.close(); reject(tx.error) }
  })
}

export async function getBiasCorrection(locationKey: string): Promise<ForecastBiasCorrection | undefined> {
  if (!isClient()) return undefined
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BIAS, "readonly")
    const req = tx.objectStore(STORE_BIAS).get(locationKey)
    req.onsuccess = () => { db.close(); resolve(req.result as ForecastBiasCorrection | undefined) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

export async function getAllBiasCorrections(): Promise<ForecastBiasCorrection[]> {
  if (!isClient()) return []
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_BIAS, "readonly")
    const req = tx.objectStore(STORE_BIAS).getAll()
    req.onsuccess = () => { db.close(); resolve(req.result as ForecastBiasCorrection[]) }
    req.onerror = () => { db.close(); reject(req.error) }
  })
}

// ─── Utility ────────────────────────────────────────────────────────────────

export function toLocationKey(lat: number, lng: number): string {
  return `${Math.round(lat * 100) / 100},${Math.round(lng * 100) / 100}`
}

export async function getLogStats(): Promise<{
  total_entries: number
  locations: string[]
  oldest_date: string | null
  newest_date: string | null
  entries_with_actuals: number
}> {
  const entries = await getAllLogEntries()
  if (entries.length === 0) {
    return { total_entries: 0, locations: [], oldest_date: null, newest_date: null, entries_with_actuals: 0 }
  }
  const locations = [...new Set(entries.map(e => e.location_key))]
  const dates = entries.map(e => e.date).sort()
  return {
    total_entries: entries.length,
    locations,
    oldest_date: dates[0],
    newest_date: dates[dates.length - 1],
    entries_with_actuals: entries.filter(e => e.actual != null).length,
  }
}
