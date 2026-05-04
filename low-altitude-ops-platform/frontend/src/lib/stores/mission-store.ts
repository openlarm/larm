import type { Mission, MissionStatus } from "@/lib/types"
import { SYSTEM_VERSIONS } from "@/lib/mock-data"

const STORAGE_KEY = "gds_missions_v1"

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  time: string
  event: string
  version: string
  actor: string
}

export interface SavedMission extends Partial<Mission> {
  id: string
  status: MissionStatus
  created_at: string
  updated_at: string
  audit: AuditEntry[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function genId(): string {
  const d = new Date().toISOString().slice(0, 10).replace(/-/g, "")
  const n = Math.floor(Math.random() * 900 + 100)
  return `M-${d}-${n}`
}

function timeLabel(): string {
  return new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit" })
}

function buildAudit(m: Partial<Mission>): AuditEntry[] {
  const t = timeLabel()
  const larmVer = m.risk?.versions?.larm_version ?? SYSTEM_VERSIONS.ruleset
  const actor = "系統"

  const entries: AuditEntry[] = []

  entries.push({ time: t, event: "Mission Created", version: larmVer, actor })

  if (m.address) {
    entries.push({
      time: t,
      event: `Address Parsed · ${m.address.city}${m.address.district}`,
      version: larmVer, actor: "System",
    })
  }

  if (m.airspace) {
    entries.push({
      time: t,
      event: `Airspace Check: ${m.airspace.status}`,
      version: larmVer, actor: "System",
    })
  }

  if (m.building) {
    entries.push({
      time: t,
      event: `Building Data Submitted · ${m.building.height_floors}F ${m.building.building_type}`,
      version: larmVer, actor,
    })
  }

  if (m.facades && m.facades.length > 0) {
    const totalArea = m.facades.reduce((s, f) => s + f.area_m2, 0)
    entries.push({
      time: t,
      event: `Facade Scope: ${m.facades.length} faces · ${totalArea.toLocaleString()}㎡ total`,
      version: larmVer, actor,
    })
  }

  if (m.weather) {
    const dates = m.selected_dates?.join(", ") ?? m.selected_date ?? "—"
    entries.push({
      time: t,
      event: `Weather Window Selected · ${dates} · ${m.weather.weather_type}`,
      version: larmVer, actor,
    })
  }

  if (m.risk) {
    entries.push({
      time: t,
      event: `Risk Evaluated · ${m.risk.w_code ?? m.risk.weather_type}–${m.risk.risk_level} · ${m.risk.decision}`,
      version: larmVer, actor: "System",
    })
  }

  if (m.time_estimate) {
    const h = Math.floor(m.time_estimate.total_minutes / 60)
    const min = m.time_estimate.total_minutes % 60
    entries.push({
      time: t,
      event: `Time Estimated · ${h}h ${min}m · ${m.time_estimate.suggested_days} days`,
      version: `time_${SYSTEM_VERSIONS.time_model}`, actor: "System",
    })
  }

  if (m.pricing) {
    entries.push({
      time: t,
      event: `Quote Generated · ${m.pricing.quote_code} · ${m.pricing.total.toLocaleString()} NTD`,
      version: `pricing_${SYSTEM_VERSIONS.pricing}`, actor: "System",
    })
  }

  entries.push({ time: t, event: "Mission Plan Generated", version: larmVer, actor })
  entries.push({ time: t, event: "Status → MISSION_READY", version: larmVer, actor: "System" })

  return entries
}

// ─── Store API ────────────────────────────────────────────────────────────────

export function getMissions(): SavedMission[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedMission[]) : []
  } catch {
    return []
  }
}

export function getMission(id: string): SavedMission | null {
  return getMissions().find(m => m.id === id) ?? null
}

export function saveMission(m: Partial<Mission>): SavedMission {
  const id = genId()
  const ts = new Date().toISOString()
  const status: MissionStatus =
    m.risk?.decision === "CONDITIONAL" ? "PENDING_APPROVAL" : "MISSION_READY"

  const saved: SavedMission = {
    ...m,
    id,
    status,
    created_at: ts,
    updated_at: ts,
    audit: buildAudit(m),
  }

  const all = getMissions()
  all.unshift(saved)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {
    // quota exceeded — silently skip
  }
  return saved
}

export function updateMissionStatus(id: string, status: MissionStatus): void {
  const all = getMissions()
  const idx = all.findIndex(m => m.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], status, updated_at: new Date().toISOString() }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}
