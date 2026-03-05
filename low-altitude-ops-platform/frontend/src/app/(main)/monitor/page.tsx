"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Wind, Droplets, CloudLightning, Thermometer, Radio, Satellite,
  Clock, Zap, Globe, Server, TrendingDown, TrendingUp, Minus,
  Database, Download, BarChart3, Target,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { VersionBar } from "@/components/layout/VersionBar"

// ─── Types ───────────────────────────────────────────────────────────────────

interface ServiceStatus {
  ok: boolean
  endpoint: string
  plan: "paid" | "free" | "n/a"
  latency_ms: number | null
  error?: string
  sample?: Record<string, unknown>
}

interface HealthResponse {
  status: "ok" | "degraded"
  meteo_plan: "paid" | "free"
  cwa_enabled: boolean
  checked_at: string
  services: {
    forecast: ServiceStatus
    archive: ServiceStatus
    ensemble: ServiceStatus
    jma: ServiceStatus
    seasonal: ServiceStatus
    cwa_thunder: ServiceStatus
    cwa_forecast: ServiceStatus
    cwa_observation: ServiceStatus
  }
  instructions: string
}

type ServiceKey = keyof HealthResponse["services"]

interface AccuracySummaryData {
  stats: {
    total_entries: number
    locations: string[]
    oldest_date: string | null
    newest_date: string | null
    entries_with_actuals: number
  }
  corrections: Array<{
    location_key: string
    updated_at: string
    sample_count: number
    buckets: {
      lead_1_3: { wind_bias_kmh: number; wind_mae_kmh: number; rain_hit_rate: number; sample_count: number }
      lead_4_7: { wind_bias_kmh: number; wind_mae_kmh: number; rain_hit_rate: number; sample_count: number }
      lead_8_14: { wind_bias_kmh: number; wind_mae_kmh: number; rain_hit_rate: number; sample_count: number }
    }
  }>
  summary: {
    overall_wind_mae: number
    overall_rain_hit_rate: number
    trend: "improving" | "stable" | "degrading"
    daily_mae: Array<{ date: string; mae: number }>
    buckets: {
      lead_1_3: { wind_bias_kmh: number; wind_mae_kmh: number; rain_hit_rate: number; sample_count: number }
      lead_4_7: { wind_bias_kmh: number; wind_mae_kmh: number; rain_hit_rate: number; sample_count: number }
      lead_8_14: { wind_bias_kmh: number; wind_mae_kmh: number; rain_hit_rate: number; sample_count: number }
    }
  } | null
}

// ─── Service Metadata ────────────────────────────────────────────────────────

interface ServiceMeta {
  label: string
  sublabel: string
  icon: typeof Wind
  group: "open-meteo" | "cwa" | "extended"
  description: string
}

const SERVICE_META: Record<ServiceKey, ServiceMeta> = {
  forecast: {
    label: "Forecast API",
    sublabel: "14 天預報",
    icon: Wind,
    group: "open-meteo",
    description: "Open-Meteo 14-day daily forecast (wind, rain, weather code)",
  },
  archive: {
    label: "Archive API",
    sublabel: "30 天歷史",
    icon: Clock,
    group: "open-meteo",
    description: "ERA5 / IFS archive for 30-day rolling statistics",
  },
  ensemble: {
    label: "Ensemble API",
    sublabel: "ECMWF 集成預報",
    icon: Satellite,
    group: "open-meteo",
    description: "ECMWF IFS 50-member ensemble for P10/P50/P90 confidence",
  },
  jma: {
    label: "JMA Forecast",
    sublabel: "日本氣象廳 5km",
    icon: Target,
    group: "extended",
    description: "JMA MSM (5km, 78h) + GSM (20km, 11d) high-resolution model for Taiwan cross-validation",
  },
  seasonal: {
    label: "Seasonal Forecast",
    sublabel: "1-6 個月預報",
    icon: BarChart3,
    group: "extended",
    description: "ECMWF SEAS5 seasonal forecast (monthly P10/P50/P90 for wind, rain, temperature)",
  },
  cwa_thunder: {
    label: "Thunder Detection",
    sublabel: "雷雨偵測",
    icon: CloudLightning,
    group: "cwa",
    description: "F-C0032-001 county-level weather forecast for thunder risk",
  },
  cwa_forecast: {
    label: "Township Forecast",
    sublabel: "鄉鎮預報交叉比對",
    icon: Droplets,
    group: "cwa",
    description: "F-D0047-091 township-level WS/WD/PoP12h for cross-validation",
  },
  cwa_observation: {
    label: "Station Observation",
    sublabel: "即時測站觀測",
    icon: Thermometer,
    group: "cwa",
    description: "O-A0003-001 real-time data from nearest weather station",
  },
}

// ─── Helper Components ───────────────────────────────────────────────────────

function StatusIndicator({ ok, error }: { ok: boolean; error?: string }) {
  if (error && !ok) {
    return (
      <div className="flex items-center gap-1.5">
        <XCircle className="h-4 w-4 text-red-400" />
        <span className="text-xs text-red-400 font-medium">Error</span>
      </div>
    )
  }
  if (ok) {
    return (
      <div className="flex items-center gap-1.5">
        <CheckCircle className="h-4 w-4 text-emerald-400" />
        <span className="text-xs text-emerald-400 font-medium">Online</span>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-1.5">
      <AlertTriangle className="h-4 w-4 text-amber-400" />
      <span className="text-xs text-amber-400 font-medium">Degraded</span>
    </div>
  )
}

function LatencyBadge({ ms }: { ms: number | null }) {
  if (ms == null) return <span className="text-xs text-zinc-600">—</span>
  const color =
    ms < 500 ? "text-emerald-400" :
    ms < 2000 ? "text-amber-400" :
    "text-red-400"
  return (
    <span className={cn("text-xs font-mono", color)}>
      {ms}ms
    </span>
  )
}

function PlanBadge({ plan }: { plan: "paid" | "free" | "n/a" }) {
  const styles = {
    paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    free: "bg-sky-500/10 text-sky-400 border-sky-500/20",
    "n/a": "bg-zinc-500/10 text-zinc-500 border-zinc-500/20",
  }
  return (
    <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-medium uppercase", styles[plan])}>
      {plan}
    </span>
  )
}

function SampleData({ sample }: { sample?: Record<string, unknown> }) {
  if (!sample || Object.keys(sample).length === 0) return null
  return (
    <div className="mt-3 p-2 bg-zinc-900/50 rounded text-[11px] font-mono text-zinc-500 space-y-0.5">
      {Object.entries(sample).map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="text-zinc-600">{k}:</span>
          <span className="text-zinc-400 truncate max-w-[200px]">{String(v)}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Service Card ────────────────────────────────────────────────────────────

function ServiceCard({ serviceKey, status }: { serviceKey: ServiceKey; status: ServiceStatus }) {
  const meta = SERVICE_META[serviceKey]
  const Icon = meta.icon
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      className={cn(
        "border rounded-lg p-4 transition-colors cursor-pointer",
        status.ok
          ? "border-zinc-800 hover:border-zinc-700"
          : status.error
          ? "border-red-500/30 bg-red-500/5 hover:border-red-500/50"
          : "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/50"
      )}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <div className={cn(
            "p-2 rounded-md",
            status.ok ? "bg-zinc-800" : status.error ? "bg-red-500/10" : "bg-amber-500/10"
          )}>
            <Icon className={cn(
              "h-4 w-4",
              status.ok ? "text-zinc-300" : status.error ? "text-red-400" : "text-amber-400"
            )} />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-100">{meta.label}</div>
            <div className="text-[10px] text-zinc-500">{meta.sublabel}</div>
          </div>
        </div>
        <StatusIndicator ok={status.ok} error={status.error} />
      </div>

      {/* Metrics row */}
      <div className="flex items-center gap-4 mt-3">
        <div className="flex items-center gap-1.5">
          <Zap className="h-3 w-3 text-zinc-600" />
          <LatencyBadge ms={status.latency_ms} />
        </div>
        <PlanBadge plan={status.plan} />
      </div>

      {/* Error message */}
      {status.error && (
        <div className="mt-2 p-2 bg-red-500/5 border border-red-500/20 rounded text-xs text-red-300 break-all">
          {status.error}
        </div>
      )}

      {/* Expandable details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-zinc-800 space-y-2">
          <div className="text-xs text-zinc-400">{meta.description}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
            <Globe className="h-3 w-3" />
            <span className="font-mono truncate">{status.endpoint}</span>
          </div>
          <SampleData sample={status.sample} />
        </div>
      )}
    </div>
  )
}

// ─── Overall Status Banner ───────────────────────────────────────────────────

function OverallBanner({ data }: { data: HealthResponse }) {
  const services = Object.values(data.services)
  const online = services.filter(s => s.ok).length
  const total = services.length
  const allOk = online === total

  return (
    <div className={cn(
      "border rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3",
      allOk
        ? "border-emerald-500/30 bg-emerald-500/5"
        : "border-amber-500/30 bg-amber-500/5"
    )}>
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-2.5 rounded-lg",
          allOk ? "bg-emerald-500/10" : "bg-amber-500/10"
        )}>
          {allOk
            ? <CheckCircle className="h-5 w-5 text-emerald-400" />
            : <AlertTriangle className="h-5 w-5 text-amber-400" />
          }
        </div>
        <div>
          <div className={cn("text-sm font-semibold", allOk ? "text-emerald-400" : "text-amber-400")}>
            {allOk ? "All Systems Operational" : "Some Services Degraded"}
          </div>
          <div className="text-xs text-zinc-400 mt-0.5">
            {online}/{total} services online
            {data.cwa_enabled ? "" : " · CWA disabled (no API key)"}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 text-xs text-zinc-500">
        <div className="flex items-center gap-1.5">
          <Server className="h-3 w-3" />
          <span>Open-Meteo: <span className={cn("font-medium", data.meteo_plan === "paid" ? "text-emerald-400" : "text-sky-400")}>{data.meteo_plan}</span></span>
        </div>
        <span className="text-zinc-700">|</span>
        <div className="flex items-center gap-1.5">
          <Radio className="h-3 w-3" />
          <span>CWA: <span className={cn("font-medium", data.cwa_enabled ? "text-emerald-400" : "text-zinc-600")}>{data.cwa_enabled ? "enabled" : "disabled"}</span></span>
        </div>
      </div>
    </div>
  )
}

// ─── Latency Chart (mini bar chart) ──────────────────────────────────────────

function LatencyChart({ services }: { services: HealthResponse["services"] }) {
  const entries = Object.entries(services)
    .filter(([, s]) => s.latency_ms != null)
    .sort(([, a], [, b]) => (b.latency_ms ?? 0) - (a.latency_ms ?? 0))

  if (entries.length === 0) return null

  const maxMs = Math.max(...entries.map(([, s]) => s.latency_ms ?? 0), 1)

  return (
    <div className="border border-zinc-800 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <Zap className="h-4 w-4 text-zinc-400" />
        <span className="text-sm font-medium text-zinc-200">Response Latency</span>
      </div>
      <div className="space-y-2">
        {entries.map(([key, s]) => {
          const meta = SERVICE_META[key as ServiceKey]
          const pct = ((s.latency_ms ?? 0) / maxMs) * 100
          const color =
            (s.latency_ms ?? 0) < 500 ? "bg-emerald-500" :
            (s.latency_ms ?? 0) < 2000 ? "bg-amber-500" :
            "bg-red-500"
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-[11px] text-zinc-400 w-28 truncate">{meta.label}</span>
              <div className="flex-1 h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${pct}%` }} />
              </div>
              <LatencyBadge ms={s.latency_ms} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function MonitorPage() {
  const [data, setData] = useState<HealthResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchHealth = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch("/api/weather/health", { cache: "no-store" })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json: HealthResponse = await res.json()
      setData(json)
      setLastRefresh(new Date())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  // Auto-refresh every 60 seconds
  useEffect(() => {
    if (!autoRefresh) return
    const interval = setInterval(fetchHealth, 60_000)
    return () => clearInterval(interval)
  }, [autoRefresh, fetchHealth])

  const meteoServices: ServiceKey[] = ["forecast", "archive", "ensemble"]
  const extendedServices: ServiceKey[] = ["jma", "seasonal"]
  const cwaServices: ServiceKey[] = ["cwa_thunder", "cwa_forecast", "cwa_observation"]

  // Forecast accuracy tracking state
  const [recording, setRecording] = useState(false)
  const [recordResult, setRecordResult] = useState<string | null>(null)
  const [accuracyData, setAccuracyData] = useState<AccuracySummaryData | null>(null)

  // Load accuracy data from IndexedDB on mount
  useEffect(() => {
    loadAccuracyData()
  }, [])

  async function loadAccuracyData() {
    try {
      const { computeAccuracySummary } = await import("@/lib/engines/forecast-tracker")
      const { getLogStats, getAllBiasCorrections } = await import("@/lib/engines/forecast-db")
      const stats = await getLogStats()
      const corrections = await getAllBiasCorrections()
      if (stats.total_entries === 0) {
        setAccuracyData({ stats, corrections: [], summary: null })
        return
      }
      // Use first location for summary
      const locationKey = stats.locations[0]
      const summary = await computeAccuracySummary(locationKey, 90)
      setAccuracyData({ stats, corrections, summary })
    } catch {
      // IndexedDB not available or no data
    }
  }

  async function handleRecordToday() {
    setRecording(true)
    setRecordResult(null)
    try {
      // Default to Taipei coordinates
      const lat = 25.034
      const lng = 121.564
      const res = await fetch("/api/weather/forecast-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const apiData = await res.json()

      const { recordForecasts, computeAndStoreBiasCorrection } = await import("@/lib/engines/forecast-tracker")
      const { toLocationKey } = await import("@/lib/engines/forecast-db")
      const result = await recordForecasts(lat, lng, apiData)
      const locKey = toLocationKey(lat, lng)
      await computeAndStoreBiasCorrection(locKey)

      setRecordResult(`Recorded ${result.recorded} forecasts, backfilled ${result.backfilled} actuals`)
      await loadAccuracyData()
    } catch (e) {
      setRecordResult(`Error: ${String(e)}`)
    } finally {
      setRecording(false)
    }
  }

  async function handleExportCSV() {
    try {
      const { getAllLogEntries } = await import("@/lib/engines/forecast-db")
      const { logEntriesToCSV } = await import("@/lib/engines/forecast-tracker")
      const entries = await getAllLogEntries()
      const csv = logEntriesToCSV(entries)
      const blob = new Blob([csv], { type: "text/csv" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `forecast-log-${new Date().toISOString().split("T")[0]}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent
    }
  }

  return (
    <div className="p-4 sm:p-8">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Activity className="h-6 w-6 text-zinc-400" />
            System Monitor
          </h1>
          <p className="text-sm text-zinc-400 mt-0.5">外部數據源與 API 健康狀態監控</p>
        </div>
        <div className="flex items-center gap-3">
          <VersionBar />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={cn(
                "text-[10px] px-2 py-1 rounded border transition-colors",
                autoRefresh
                  ? "border-emerald-500/30 text-emerald-400 bg-emerald-500/5"
                  : "border-zinc-700 text-zinc-500 hover:text-zinc-300"
              )}
            >
              {autoRefresh ? "Auto 60s" : "Manual"}
            </button>
            <button
              onClick={fetchHealth}
              disabled={loading}
              className="p-1.5 rounded-md border border-zinc-700 text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors disabled:opacity-50"
              title="Refresh now"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && !data && (
        <div className="border border-red-500/30 bg-red-500/5 rounded-lg p-6 flex flex-col items-center gap-3 text-center">
          <XCircle className="h-8 w-8 text-red-400" />
          <div className="text-sm text-red-300">Failed to reach health endpoint</div>
          <div className="text-xs text-zinc-500 font-mono">{error}</div>
          <button
            onClick={fetchHealth}
            className="mt-2 px-4 py-1.5 rounded-md border border-zinc-700 text-sm text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="border border-zinc-800 rounded-lg py-16 flex flex-col items-center gap-3">
          <div className="h-6 w-6 rounded-full border-2 border-zinc-600 border-t-zinc-300 animate-spin" />
          <p className="text-sm text-zinc-500">Checking all services...</p>
        </div>
      )}

      {/* Main content */}
      {data && (
        <div className="space-y-6">
          {/* Overall status banner */}
          <OverallBanner data={data} />

          {/* Last checked */}
          {lastRefresh && (
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Clock className="h-3 w-3" />
              <span>Last checked: {lastRefresh.toLocaleTimeString("zh-TW", { hour12: false })}</span>
              {data.checked_at && (
                <span className="text-zinc-700 ml-1">
                  (server: {new Date(data.checked_at).toLocaleTimeString("zh-TW", { hour12: false })})
                </span>
              )}
            </div>
          )}

          {/* Open-Meteo Services */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Globe className="h-4 w-4 text-sky-400" />
              <h2 className="text-sm font-semibold text-zinc-200">Open-Meteo</h2>
              <PlanBadge plan={data.meteo_plan} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {meteoServices.map(key => (
                <ServiceCard key={key} serviceKey={key} status={data.services[key]} />
              ))}
            </div>
          </div>

          {/* CWA Services */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Radio className="h-4 w-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-zinc-200">CWA 中央氣象署</h2>
              <span className={cn(
                "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-medium",
                data.cwa_enabled
                  ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                  : "bg-zinc-500/10 text-zinc-500 border-zinc-500/20"
              )}>
                {data.cwa_enabled ? "ENABLED" : "DISABLED"}
              </span>
            </div>
            {!data.cwa_enabled && (
              <div className="mb-3 p-3 border border-zinc-800 rounded-lg bg-zinc-900/50 text-xs text-zinc-400">
                <span className="text-zinc-500 font-medium">Setup:</span>{" "}
                Add <code className="px-1 py-0.5 bg-zinc-800 rounded text-amber-400 font-mono">CWA_API_KEY=your_key</code> to{" "}
                <code className="px-1 py-0.5 bg-zinc-800 rounded font-mono">.env.local</code> to enable CWA data sources.
                Free API key available at{" "}
                <span className="text-sky-400">opendata.cwa.gov.tw</span>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {cwaServices.map(key => (
                <ServiceCard key={key} serviceKey={key} status={data.services[key]} />
              ))}
            </div>
          </div>

          {/* Extended Models (JMA + Seasonal) */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-zinc-200">Extended Models</h2>
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-medium bg-violet-500/10 text-violet-400 border-violet-500/20">
                NEW
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {extendedServices.map(key => (
                <ServiceCard key={key} serviceKey={key} status={data.services[key]} />
              ))}
            </div>
          </div>

          {/* Forecast Accuracy Dashboard */}
          <div className="border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-cyan-400" />
                <span className="text-sm font-medium text-zinc-200">Forecast Accuracy Training</span>
                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] border font-medium bg-cyan-500/10 text-cyan-400 border-cyan-500/20">
                  BETA
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleExportCSV}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] border border-zinc-700 rounded text-zinc-400 hover:text-zinc-200 hover:border-zinc-600 transition-colors"
                >
                  <Download className="h-3 w-3" />
                  CSV
                </button>
                <button
                  onClick={handleRecordToday}
                  disabled={recording}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md border font-medium transition-colors",
                    recording
                      ? "border-zinc-700 text-zinc-500 cursor-wait"
                      : "border-cyan-500/30 text-cyan-400 bg-cyan-500/5 hover:bg-cyan-500/10"
                  )}
                >
                  {recording ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <Database className="h-3 w-3" />
                  )}
                  Record Today
                </button>
              </div>
            </div>

            {recordResult && (
              <div className={cn(
                "mb-3 p-2 rounded text-xs border",
                recordResult.startsWith("Error")
                  ? "border-red-500/20 bg-red-500/5 text-red-300"
                  : "border-emerald-500/20 bg-emerald-500/5 text-emerald-300"
              )}>
                {recordResult}
              </div>
            )}

            {!accuracyData || accuracyData.stats.total_entries === 0 ? (
              <div className="py-8 text-center space-y-2">
                <Database className="h-8 w-8 text-zinc-700 mx-auto" />
                <div className="text-sm text-zinc-500">No forecast data recorded yet</div>
                <div className="text-xs text-zinc-600">
                  Click &quot;Record Today&quot; to start capturing daily forecasts.
                  Over time, the system will compute accuracy metrics and bias corrections.
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Stats overview */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-zinc-900/50 rounded-lg">
                    <div className="text-[10px] text-zinc-500 uppercase">Total Records</div>
                    <div className="text-lg font-semibold text-zinc-200 mt-1">
                      {accuracyData.stats.total_entries}
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-900/50 rounded-lg">
                    <div className="text-[10px] text-zinc-500 uppercase">With Actuals</div>
                    <div className="text-lg font-semibold text-zinc-200 mt-1">
                      {accuracyData.stats.entries_with_actuals}
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-900/50 rounded-lg">
                    <div className="text-[10px] text-zinc-500 uppercase">Wind MAE</div>
                    <div className="text-lg font-semibold text-zinc-200 mt-1">
                      {accuracyData.summary ? `${accuracyData.summary.overall_wind_mae} km/h` : "—"}
                    </div>
                  </div>
                  <div className="p-3 bg-zinc-900/50 rounded-lg">
                    <div className="text-[10px] text-zinc-500 uppercase">Rain Hit Rate</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-lg font-semibold text-zinc-200">
                        {accuracyData.summary ? `${Math.round(accuracyData.summary.overall_rain_hit_rate * 100)}%` : "—"}
                      </span>
                      {accuracyData.summary && (
                        <span className="flex items-center gap-0.5 text-xs">
                          {accuracyData.summary.trend === "improving" && <TrendingDown className="h-3 w-3 text-emerald-400" />}
                          {accuracyData.summary.trend === "degrading" && <TrendingUp className="h-3 w-3 text-red-400" />}
                          {accuracyData.summary.trend === "stable" && <Minus className="h-3 w-3 text-zinc-500" />}
                          <span className={cn("text-[10px]",
                            accuracyData.summary.trend === "improving" ? "text-emerald-400" :
                            accuracyData.summary.trend === "degrading" ? "text-red-400" : "text-zinc-500"
                          )}>
                            {accuracyData.summary.trend}
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Lead Days Breakdown */}
                {accuracyData.summary && (
                  <div>
                    <div className="text-xs text-zinc-400 mb-2">Lead Days Breakdown (MAE / Bias)</div>
                    <div className="grid grid-cols-3 gap-3">
                      {(["lead_1_3", "lead_4_7", "lead_8_14"] as const).map(bucket => {
                        const b = accuracyData.summary!.buckets[bucket]
                        const label = bucket === "lead_1_3" ? "1-3 days" : bucket === "lead_4_7" ? "4-7 days" : "8-14 days"
                        return (
                          <div key={bucket} className="p-3 bg-zinc-900/50 rounded-lg border border-zinc-800">
                            <div className="text-[10px] text-zinc-500 font-medium">{label}</div>
                            <div className="mt-2 space-y-1">
                              <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">MAE</span>
                                <span className="text-zinc-200 font-mono">{b.wind_mae_kmh} km/h</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">Bias</span>
                                <span className={cn("font-mono",
                                  b.wind_bias_kmh > 0 ? "text-amber-400" : b.wind_bias_kmh < 0 ? "text-sky-400" : "text-zinc-400"
                                )}>
                                  {b.wind_bias_kmh > 0 ? "+" : ""}{b.wind_bias_kmh}
                                </span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">Rain Hit</span>
                                <span className="text-zinc-200 font-mono">{Math.round(b.rain_hit_rate * 100)}%</span>
                              </div>
                              <div className="flex justify-between text-xs">
                                <span className="text-zinc-500">Samples</span>
                                <span className="text-zinc-400 font-mono">{b.sample_count}</span>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Sparkline - simple bar chart of daily MAE */}
                {accuracyData.summary && accuracyData.summary.daily_mae.length > 0 && (
                  <div>
                    <div className="text-xs text-zinc-400 mb-2">Daily Wind MAE Trend</div>
                    <div className="flex items-end gap-[2px] h-16 p-2 bg-zinc-900/50 rounded-lg">
                      {accuracyData.summary.daily_mae.slice(-30).map((d, i) => {
                        const maxMAE = Math.max(...accuracyData.summary!.daily_mae.slice(-30).map(x => x.mae), 1)
                        const pct = (d.mae / maxMAE) * 100
                        return (
                          <div
                            key={i}
                            className={cn(
                              "flex-1 rounded-t-sm min-w-[3px]",
                              d.mae < 3 ? "bg-emerald-500/60" : d.mae < 6 ? "bg-amber-500/60" : "bg-red-500/60"
                            )}
                            style={{ height: `${Math.max(pct, 5)}%` }}
                            title={`${d.date}: ${d.mae} km/h`}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Data range info */}
                <div className="text-[11px] text-zinc-600 flex items-center gap-4">
                  <span>Date range: {accuracyData.stats.oldest_date} — {accuracyData.stats.newest_date}</span>
                  <span>Locations: {accuracyData.stats.locations.length}</span>
                </div>
              </div>
            )}
          </div>

          {/* Latency Chart */}
          <LatencyChart services={data.services} />

          {/* Data Flow Architecture */}
          <div className="border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-200">Data Flow Architecture</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs">
              {/* Open-Meteo pipeline */}
              <div className="p-3 bg-zinc-900/50 rounded-lg space-y-2">
                <div className="text-sky-400 font-medium mb-2">Open-Meteo Pipeline</div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <span>ERA5 Archive (30d hourly) → Weather30dInput</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <span>Forecast API (14d daily) → WeatherTodayInput[]</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-sky-400" />
                  <span>Ensemble (50 members) → P10/P90/Confidence</span>
                </div>
                <div className="mt-2 pt-2 border-t border-zinc-800 text-zinc-500">
                  Cache: Archive 1hr | Forecast 30min | Ensemble 30min
                </div>
              </div>
              {/* Extended Models pipeline */}
              <div className="p-3 bg-zinc-900/50 rounded-lg space-y-2">
                <div className="text-violet-400 font-medium mb-2">Extended Models</div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                  <span>JMA MSM (5km, 78h) → Cross-Validation</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                  <span>JMA GSM (20km, 11d) → Extended Range</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-violet-400" />
                  <span>SEAS5 (6 months) → Seasonal Outlook</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-cyan-400" />
                  <span>Accuracy Training → Bias Correction</span>
                </div>
                <div className="mt-2 pt-2 border-t border-zinc-800 text-zinc-500">
                  Cache: JMA 30min | Seasonal 24hr | Training: local
                </div>
              </div>
              {/* CWA pipeline */}
              <div className="p-3 bg-zinc-900/50 rounded-lg space-y-2">
                <div className="text-amber-400 font-medium mb-2">CWA Pipeline</div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>F-C0032-001 → Thunder Risk Enhancement</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>F-D0047-091 → Cross-Validation (WS/WD/PoP)</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400" />
                  <span>O-A0003-001 → Real-time Station Observation</span>
                </div>
                <div className="mt-2 pt-2 border-t border-zinc-800 text-zinc-500">
                  Cache: Forecast 30min | Observation 10min
                </div>
              </div>
            </div>
            {/* LARM flow */}
            <div className="mt-3 p-3 bg-zinc-900/50 rounded-lg text-xs text-zinc-400">
              <span className="text-emerald-400 font-medium">LARM v1.1:</span>{" "}
              R_score = Base(W) + WeatherNow(0-50) + B_score(0-25) + O_score(0-15) + E_score(0-10) → R0-R4 → GO / CONDITIONAL / NO-GO
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
