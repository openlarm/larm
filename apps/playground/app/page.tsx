"use client"

import { useMemo, useState } from "react"
import { evaluateRisk } from "@openlarm/core"
import type {
  LARMInput,
  Weather30dInput,
  WeatherTodayInput,
  BuildingSiteInput,
  OperationalContextInput,
  Complexity,
  PopulationDensityClass,
  RegionExposure,
  SORAMitigation,
} from "@openlarm/core"
import { TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"

// Canonical R-level palette (spec §2)
const R_COLORS = {
  R0: "text-emerald-400 bg-emerald-500/10 border-emerald-500/30",
  R1: "text-sky-400 bg-sky-500/10 border-sky-500/30",
  R2: "text-amber-400 bg-amber-500/10 border-amber-500/30",
  R3: "text-orange-400 bg-orange-500/10 border-orange-500/30",
  R4: "text-red-400 bg-red-500/10 border-red-500/30",
}

const DECISION_COLORS: Record<string, string> = {
  GO: "text-emerald-400 bg-emerald-500/15 border-emerald-500/40",
  CONDITIONAL: "text-amber-400 bg-amber-500/15 border-amber-500/40",
  NO_GO: "text-red-400 bg-red-500/15 border-red-500/40",
}

interface Inputs {
  // Weather 30d
  wind_p90_kmh: number
  gust_p90_kmh: number
  rain_days_30: number
  heavy_rain_days_30: number
  instability_index: number
  predictability_score: number

  // Weather today
  wind_now_kmh: number
  rain_prob_today_pct: number
  rain_mmph_forecast: number
  thunder_risk: 0 | 1
  forecast_confidence: number
  edr: number

  // Building site
  site_altitude_m: number
  building_floors: number
  facade_complexity: Complexity
  clearance_m: number
  near_hv_power: 0 | 1
  wind_channel_effect: 0 | 1
  population_density_class: PopulationDensityClass
  region_exposure: RegionExposure | ""
  sora_m1a: boolean
  sora_m1b: boolean
  sora_m1c: boolean

  // Operational
  time_window: "day" | "night"
  weekend: 0 | 1
  urgent_days: number | null
  road_closure_needed: 0 | 1

  // Equipment — simplified: block count + warn count
  block_count: number
  warn_count: number
}

const DEFAULT_INPUTS: Inputs = {
  wind_p90_kmh: 22,
  gust_p90_kmh: 30,
  rain_days_30: 5,
  heavy_rain_days_30: 1,
  instability_index: 0.3,
  predictability_score: 0.75,
  wind_now_kmh: 16,
  rain_prob_today_pct: 20,
  rain_mmph_forecast: 0,
  thunder_risk: 0,
  forecast_confidence: 80,
  edr: 0.2,
  site_altitude_m: 25,
  building_floors: 10,
  facade_complexity: "medium",
  clearance_m: 8,
  near_hv_power: 0,
  wind_channel_effect: 0,
  population_density_class: "residential",
  region_exposure: "",
  sora_m1a: false,
  sora_m1b: false,
  sora_m1c: false,
  time_window: "day",
  weekend: 0,
  urgent_days: null,
  road_closure_needed: 0,
  block_count: 0,
  warn_count: 0,
}

function toLARMInput(i: Inputs): LARMInput {
  const mitigations: SORAMitigation[] = []
  if (i.sora_m1a) mitigations.push("M1A")
  if (i.sora_m1b) mitigations.push("M1B")
  if (i.sora_m1c) mitigations.push("M1C")

  const weather_30d: Weather30dInput = {
    wind_mean_kmh: Math.round(i.wind_p90_kmh * 0.6),
    wind_p90_kmh: i.wind_p90_kmh,
    gust_p90_kmh: i.gust_p90_kmh,
    rain_days_30: i.rain_days_30,
    heavy_rain_days_30: i.heavy_rain_days_30,
    instability_index: i.instability_index,
    predictability_score: i.predictability_score,
  }

  const weather_today: WeatherTodayInput = {
    wind_now_kmh: i.wind_now_kmh,
    gust_now_kmh: null,
    rain_prob_today_pct: i.rain_prob_today_pct,
    rain_mmph_forecast: i.rain_mmph_forecast,
    thunder_risk: i.thunder_risk,
    forecast_confidence: i.forecast_confidence,
    edr: i.edr,
  }

  const building: BuildingSiteInput = {
    site_altitude_m: i.site_altitude_m,
    building_floors: i.building_floors,
    building_height_m: i.building_floors * 3.2,
    facade_complexity: i.facade_complexity,
    clearance_m: i.clearance_m,
    near_hv_power: i.near_hv_power,
    near_base_station: 0,
    wind_channel_effect: i.wind_channel_effect,
    rooftop_condition: null,
    population_density_class: i.population_density_class,
    sora_mitigations: mitigations,
    region_exposure: i.region_exposure === "" ? null : i.region_exposure,
    crowd_density: null,
  }

  const operational: OperationalContextInput = {
    time_window: i.time_window,
    weekend: i.weekend,
    urgent_days: i.urgent_days,
    road_closure_needed: i.road_closure_needed,
    multi_day_split: null,
    operator_experience_level: null,
  }

  const nowIso = new Date().toISOString()
  const stubEquipment = (
    id: string,
    name: string,
    status: "block" | "warn",
  ) => ({
    id,
    name,
    type: "drone" as const,
    serial: "PLAYGROUND",
    health_status: status,
    last_calibrated: nowIso,
    calibration_expires: nowIso,
    last_maintenance: nowIso,
  })
  const equipment = [
    ...Array.from({ length: i.block_count }, (_, idx) =>
      stubEquipment(`block-${idx}`, `Block device ${idx + 1}`, "block"),
    ),
    ...Array.from({ length: i.warn_count }, (_, idx) =>
      stubEquipment(`warn-${idx}`, `Warn device ${idx + 1}`, "warn"),
    ),
  ]

  return { weather_30d, weather_today, building, operational, equipment }
}

export default function Playground() {
  const [inputs, setInputs] = useState<Inputs>(DEFAULT_INPUTS)

  const { result, error } = useMemo(() => {
    try {
      const r = evaluateRisk(toLARMInput(inputs), { params: TAIWAN_PARAMS_V2_0 })
      return { result: r, error: null }
    } catch (e) {
      return { result: null, error: e instanceof Error ? e.message : String(e) }
    }
  }, [inputs])

  const reset = () => setInputs(DEFAULT_INPUTS)

  return (
    <main className="max-w-7xl mx-auto px-6 py-8">
      <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <span className="text-zinc-100">LARM</span>
            <span className="text-sm font-mono text-zinc-500 mt-1">
              Playground · v2.0
            </span>
          </h1>
          <p className="text-zinc-400 mt-2 text-sm max-w-2xl">
            Slide the inputs on the left. The R-score and decision on the right
            update live using{" "}
            <code className="text-zinc-300 bg-zinc-800 px-1 rounded">
              @openlarm/core
            </code>{" "}
            with{" "}
            <code className="text-zinc-300 bg-zinc-800 px-1 rounded">
              @openlarm/regions-taiwan
            </code>{" "}
            calibration. Not a substitute for pilot-in-command judgment —
            decision-support only.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={reset}
            className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
          >
            Reset to defaults
          </button>
          <a
            href="https://github.com/openlarm/larm"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-400 hover:text-zinc-100 hover:border-zinc-500"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      <div className="grid md:grid-cols-2 gap-6">
        <InputPanel inputs={inputs} setInputs={setInputs} />
        <ResultPanel result={result} error={error} />
      </div>

      <footer className="mt-12 text-xs text-zinc-600 border-t border-zinc-800 pt-4">
        Apache License 2.0 · See{" "}
        <a
          href="https://github.com/openlarm/larm/blob/main/LEGAL/DISCLAIMER.md"
          className="underline"
        >
          LEGAL/DISCLAIMER.md
        </a>{" "}
        for the authoritative safety notice. The Playground runs entirely in
        your browser — no data is sent to a server.
      </footer>
    </main>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function InputPanel({
  inputs,
  setInputs,
}: {
  inputs: Inputs
  setInputs: (i: Inputs) => void
}) {
  const u = <K extends keyof Inputs>(key: K, value: Inputs[K]) =>
    setInputs({ ...inputs, [key]: value })

  return (
    <div className="space-y-6">
      <Section title="Weather · 30-day context">
        <Slider
          label="Wind P90 (km/h)"
          value={inputs.wind_p90_kmh}
          min={0}
          max={60}
          step={1}
          onChange={(v) => u("wind_p90_kmh", v)}
          hint="90th-percentile wind over past 30 days. ≥39 triggers W5 typhoon regime."
        />
        <Slider
          label="Gust P90 (km/h)"
          value={inputs.gust_p90_kmh}
          min={0}
          max={80}
          step={1}
          onChange={(v) => u("gust_p90_kmh", v)}
        />
        <Slider
          label="Rain days (of 30)"
          value={inputs.rain_days_30}
          min={0}
          max={30}
          step={1}
          onChange={(v) => u("rain_days_30", v)}
          hint="≥15 days + heavy rain ≥3 → W3 梅雨滯留"
        />
        <Slider
          label="Heavy rain days"
          value={inputs.heavy_rain_days_30}
          min={0}
          max={10}
          step={1}
          onChange={(v) => u("heavy_rain_days_30", v)}
        />
        <Slider
          label="Instability index"
          value={inputs.instability_index}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => u("instability_index", v)}
          hint="0.70+ with heavy rain triggers W4 午後熱對流"
        />
        <Slider
          label="Predictability score"
          value={inputs.predictability_score}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => u("predictability_score", v)}
          hint="Higher = more predictable climate → lower WeatherNow discount"
        />
      </Section>

      <Section title="Weather · Today">
        <Slider
          label="Wind now (km/h)"
          value={inputs.wind_now_kmh}
          min={0}
          max={60}
          step={1}
          onChange={(v) => u("wind_now_kmh", v)}
          hint="≥39 → hard-stop NO-GO"
          danger={inputs.wind_now_kmh >= 39}
        />
        <Slider
          label="Rain probability (%)"
          value={inputs.rain_prob_today_pct}
          min={0}
          max={100}
          step={5}
          onChange={(v) => u("rain_prob_today_pct", v)}
        />
        <Slider
          label="Rain rate (mm/h)"
          value={inputs.rain_mmph_forecast}
          min={0}
          max={25}
          step={0.5}
          onChange={(v) => u("rain_mmph_forecast", v)}
          hint={
            inputs.rain_mmph_forecast > 10 && inputs.rain_prob_today_pct > 60
              ? "> 10 mm/h AND prob > 60% → hard-stop NO-GO"
              : undefined
          }
          danger={
            inputs.rain_mmph_forecast > 10 && inputs.rain_prob_today_pct > 60
          }
        />
        <Slider
          label="Forecast confidence (%)"
          value={inputs.forecast_confidence}
          min={0}
          max={100}
          step={5}
          onChange={(v) => u("forecast_confidence", v)}
          hint="<55% triggers conservative P90 wind usage"
        />
        <Slider
          label="EDR (turbulence)"
          value={inputs.edr}
          min={0}
          max={1}
          step={0.05}
          onChange={(v) => u("edr", v)}
          hint="> 0.8 → hard-stop NO-GO (extreme turbulence)"
          danger={inputs.edr > 0.8}
        />
        <Toggle
          label="Thunder risk"
          value={inputs.thunder_risk === 1}
          onChange={(v) => u("thunder_risk", v ? 1 : 0)}
        />
      </Section>

      <Section title="Building · Ground">
        <Slider
          label="Site altitude (m)"
          value={inputs.site_altitude_m}
          min={0}
          max={1500}
          step={10}
          onChange={(v) => u("site_altitude_m", v)}
        />
        <Slider
          label="Building floors"
          value={inputs.building_floors}
          min={1}
          max={50}
          step={1}
          onChange={(v) => u("building_floors", v)}
        />
        <Select
          label="Facade complexity"
          value={inputs.facade_complexity}
          options={["light", "medium", "heavy"]}
          onChange={(v) => u("facade_complexity", v as Complexity)}
        />
        <Slider
          label="Clearance (m)"
          value={inputs.clearance_m}
          min={0}
          max={30}
          step={1}
          onChange={(v) => u("clearance_m", v)}
          hint="< 5 m = tight operating corridor"
        />
        <Select
          label="Population density (SORA iGRC)"
          value={inputs.population_density_class}
          options={[
            "isolated",
            "light",
            "residential",
            "high_urban",
            "assembly",
          ]}
          onChange={(v) =>
            u("population_density_class", v as PopulationDensityClass)
          }
        />
        <div className="grid grid-cols-3 gap-2">
          <Toggle
            label="M1A"
            value={inputs.sora_m1a}
            onChange={(v) => u("sora_m1a", v)}
          />
          <Toggle
            label="M1B"
            value={inputs.sora_m1b}
            onChange={(v) => u("sora_m1b", v)}
          />
          <Toggle
            label="M1C"
            value={inputs.sora_m1c}
            onChange={(v) => u("sora_m1c", v)}
          />
        </div>
        <Toggle
          label="Near HV power line"
          value={inputs.near_hv_power === 1}
          onChange={(v) => u("near_hv_power", v ? 1 : 0)}
        />
        <Toggle
          label="Wind channel effect"
          value={inputs.wind_channel_effect === 1}
          onChange={(v) => u("wind_channel_effect", v ? 1 : 0)}
        />
        <Select
          label="Region exposure"
          value={inputs.region_exposure || "(none)"}
          options={[
            "(none)",
            "windward",
            "leeward",
            "coastal",
            "rooftop_open",
          ]}
          onChange={(v) =>
            u(
              "region_exposure",
              v === "(none)" ? "" : (v as RegionExposure),
            )
          }
        />
      </Section>

      <Section title="Operational context">
        <Select
          label="Time window"
          value={inputs.time_window}
          options={["day", "night"]}
          onChange={(v) =>
            u("time_window", v as Inputs["time_window"])
          }
        />
        <Toggle
          label="Weekend operation"
          value={inputs.weekend === 1}
          onChange={(v) => u("weekend", v ? 1 : 0)}
        />
        <Slider
          label="Urgent days (null = not urgent)"
          value={inputs.urgent_days ?? 0}
          min={0}
          max={30}
          step={1}
          onChange={(v) => u("urgent_days", v === 0 ? null : v)}
          hint="≤3 → +5 points, ≤7 → +3"
        />
        <Toggle
          label="Road closure required"
          value={inputs.road_closure_needed === 1}
          onChange={(v) => u("road_closure_needed", v ? 1 : 0)}
        />
      </Section>

      <Section title="Equipment status">
        <Slider
          label="Block devices (severely degraded)"
          value={inputs.block_count}
          min={0}
          max={5}
          step={1}
          onChange={(v) => u("block_count", v)}
          hint="Each +3 · E_score ≥8 triggers CONDITIONAL-C"
        />
        <Slider
          label="Warn devices (wear flagged)"
          value={inputs.warn_count}
          min={0}
          max={10}
          step={1}
          onChange={(v) => u("warn_count", v)}
          hint="Each +1.5"
        />
      </Section>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function ResultPanel({
  result,
  error,
}: {
  result: ReturnType<typeof evaluateRisk> | null
  error: string | null
}) {
  if (error || !result) {
    return (
      <div className="sticky top-8 space-y-4">
        <div className="p-4 border border-red-500/30 bg-red-500/10 rounded text-sm text-red-300">
          <strong className="block mb-1">Input error</strong>
          {error ?? "Result unavailable."}
        </div>
      </div>
    )
  }

  const rlColor = R_COLORS[result.risk_level]
  const decisionColor = DECISION_COLORS[result.decision] ?? ""

  return (
    <div className="sticky top-8 space-y-4">
      <div className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            R-score
          </span>
          <span className="text-xs font-mono text-zinc-500">
            {result.w_code} · {result.internal_grade}
            {result.conditional_tier ? ` · Tier ${result.conditional_tier}` : ""}
          </span>
        </div>
        <div className="text-6xl font-bold tabular-nums tracking-tight text-zinc-100">
          {result.risk_score}
          <span className="text-2xl text-zinc-600 ml-1">/ 100</span>
        </div>

        {/* R-score bar */}
        <div className="mt-4 relative h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div className="absolute inset-0 r-gradient opacity-40" />
          <div
            className="absolute top-0 left-0 h-full r-gradient transition-all duration-300"
            style={{ width: `${result.risk_score}%` }}
          />
        </div>
        <div className="flex justify-between text-xs font-mono text-zinc-600 mt-1.5">
          <span>R0·20</span>
          <span>R1·40</span>
          <span>R2·65</span>
          <span>R3·85</span>
          <span>R4·100</span>
        </div>

        <div className="grid grid-cols-2 gap-3 mt-5">
          <Badge
            label={result.risk_level}
            className={`${rlColor} text-lg py-2.5`}
          />
          <Badge
            label={result.decision.replace("_", "-")}
            className={`${decisionColor} text-lg py-2.5 font-bold`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
          <Stat
            label="Buffer"
            value={`${(result.buffer_ratio * 100).toFixed(1)}%`}
          />
          <Stat
            label="Confidence"
            value={`${(result.regime_confidence * 100).toFixed(0)}%`}
          />
        </div>
      </div>

      <div className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-5">
        <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
          Component breakdown
        </h3>
        <div className="space-y-1.5">
          <ComponentBar
            label={`Base(${result.w_code})`}
            value={result.base_w}
            max={22}
            color="bg-indigo-500"
          />
          <ComponentBar
            label="WeatherNow"
            value={result.weather_now}
            max={42}
            color="bg-cyan-500"
          />
          <ComponentBar
            label="G_score"
            value={result.g_score}
            max={20}
            color="bg-emerald-500"
          />
          <ComponentBar
            label="O_score"
            value={result.o_score}
            max={12}
            color="bg-amber-500"
          />
          <ComponentBar
            label="E_score"
            value={result.e_score}
            max={8}
            color="bg-red-500"
          />
        </div>
      </div>

      {result.controls.length > 0 && (
        <div className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-5">
          <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-3">
            Recommended controls
          </h3>
          <ul className="space-y-1.5 text-sm text-zinc-300">
            {result.controls.map((c, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-zinc-600">·</span>
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <details className="border border-zinc-800 rounded-lg bg-zinc-900/60 p-5">
        <summary className="cursor-pointer text-xs uppercase tracking-wider text-zinc-500 hover:text-zinc-300">
          Explanation trace ({result.explanations.length})
        </summary>
        <div className="mt-3 space-y-2">
          {result.explanations.map((e, i) => (
            <div
              key={i}
              className="text-xs grid grid-cols-[auto_1fr_auto] gap-3 py-1 border-t border-zinc-800 first:border-t-0 pt-2"
            >
              <span className="text-zinc-400 font-medium">{e.factor}</span>
              <span className="text-zinc-600 truncate" title={e.note}>
                {typeof e.value === "number" ? e.value : String(e.value)}
              </span>
              <span className="font-mono text-zinc-300">
                {e.score >= 0 ? "+" : ""}
                {typeof e.score === "number" ? e.score.toFixed(1) : e.score}
              </span>
            </div>
          ))}
        </div>
      </details>

      <div className="text-[10px] font-mono text-zinc-600 text-center">
        {result.versions.larm_version} ·{" "}
        {result.versions.weather_regime_params_version} ·{" "}
        {new Date(result.evaluated_at).toISOString().slice(11, 19)}Z
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section className="border border-zinc-800 rounded-lg bg-zinc-900/40 p-5 space-y-3">
      <h2 className="text-xs uppercase tracking-wider text-zinc-500">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
  danger,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  hint?: string
  danger?: boolean
}) {
  return (
    <label className="block">
      <div className="flex justify-between text-xs mb-1">
        <span className="text-zinc-400">{label}</span>
        <span
          className={`font-mono ${danger ? "text-red-400" : "text-zinc-300"}`}
        >
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full accent-current ${
          danger ? "text-red-500" : "text-zinc-400"
        }`}
      />
      {hint && (
        <div
          className={`text-[11px] mt-1 ${
            danger ? "text-red-400" : "text-zinc-600"
          }`}
        >
          {hint}
        </div>
      )}
    </label>
  )
}

function Toggle({
  label,
  value,
  onChange,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center gap-2 text-xs cursor-pointer select-none py-1">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-zinc-300"
      />
      <span className={value ? "text-zinc-200" : "text-zinc-500"}>{label}</span>
    </label>
  )
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
}) {
  return (
    <label className="block text-xs">
      <div className="text-zinc-400 mb-1">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-zinc-200"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    </label>
  )
}

function Badge({ label, className }: { label: string; className: string }) {
  return (
    <div
      className={`text-center font-mono tracking-wide py-2 rounded border ${className}`}
    >
      {label}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-zinc-800 bg-zinc-950/60 rounded px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-zinc-500">
        {label}
      </div>
      <div className="font-mono text-zinc-200 mt-0.5">{value}</div>
    </div>
  )
}

function ComponentBar({
  label,
  value,
  max,
  color,
}: {
  label: string
  value: number
  max: number
  color: string
}) {
  const pct = Math.min(100, (value / max) * 100)
  return (
    <div>
      <div className="flex justify-between text-xs mb-0.5">
        <span className="text-zinc-400">{label}</span>
        <span className="font-mono text-zinc-300">
          {value.toFixed(1)}
          <span className="text-zinc-600"> / {max}</span>
        </span>
      </div>
      <div className="h-1.5 bg-zinc-800 rounded overflow-hidden">
        <div
          className={`h-full ${color} transition-all duration-300`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
