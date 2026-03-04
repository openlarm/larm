"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Wind, Droplets, CloudLightning, Thermometer, Radio, Satellite,
  Clock, Zap, Globe, Server,
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
    cwa_thunder: ServiceStatus
    cwa_forecast: ServiceStatus
    cwa_observation: ServiceStatus
  }
  instructions: string
}

type ServiceKey = keyof HealthResponse["services"]

// ─── Service Metadata ────────────────────────────────────────────────────────

interface ServiceMeta {
  label: string
  sublabel: string
  icon: typeof Wind
  group: "open-meteo" | "cwa"
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
  const cwaServices: ServiceKey[] = ["cwa_thunder", "cwa_forecast", "cwa_observation"]

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

          {/* Latency Chart */}
          <LatencyChart services={data.services} />

          {/* Data Flow Architecture */}
          <div className="border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-4">
              <Activity className="h-4 w-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-200">Data Flow Architecture</span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
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
