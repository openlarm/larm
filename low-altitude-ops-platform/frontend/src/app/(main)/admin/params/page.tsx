"use client"
// ─── /admin/params — LARM Parameter Management UI ──────────────────────────
//
// Lets operators inspect and override all key LARM model parameters without
// restarting the server.  Overrides are saved to localStorage under the key
// "larm_params_override" and are picked up by model-helpers / risk-engine
// on the next page load via getActiveParams().
//
// Tabs:
//   1. WR Matrix       — 6×5 GO/COND/NOGO click-to-cycle grid
//   2. Wind/Rain Scoring — wind-score table, rain rules, hard-stop, weights
//   3. Weather Classification — ui_infer_thresholds (W1-W5 thresholds)
//   4. Buffer Coefficients   — buffer formula knobs
//
// Bottom bar: Reset to v1.0 defaults | Export JSON | Apply (save to localStorage)

import { useState, useCallback, useEffect } from "react"
import { SlidersHorizontal, RefreshCw, Download, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  getParams,
  WEATHER_REGIME_PARAMS,
  type WeatherRegimeParams,
  type WCode,
  type RLevelKey,
  type WRDecision,
} from "@/lib/engines/weather-regime-params"
import type { RiskLevel, WeatherType } from "@/lib/types"

// ── localStorage helpers ──────────────────────────────────────────────────────

const LS_KEY = "larm_params_override"

function loadOverride(): WeatherRegimeParams | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function saveOverride(p: WeatherRegimeParams) {
  localStorage.setItem(LS_KEY, JSON.stringify(p))
}

function clearOverride() {
  localStorage.removeItem(LS_KEY)
}

// ── Colour helpers ────────────────────────────────────────────────────────────

const DECISION_CYCLE: WRDecision[] = ["go", "cond", "nogo"]

const DECISION_STYLE: Record<WRDecision, string> = {
  go:   "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  cond: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  nogo: "bg-zinc-800/60 text-zinc-600 border-zinc-700/40",
}
const DECISION_LABEL: Record<WRDecision, string> = { go: "GO", cond: "COND", nogo: "✕" }

const W_CODES: WCode[] = ["W0", "W1", "W2", "W3", "W4", "W5"]
const R_KEYS: RLevelKey[] = ["R0", "R1", "R2", "R3", "R4"]
const W_COLORS: Record<WCode, string> = {
  W0: "text-emerald-400", W1: "text-sky-400", W2: "text-yellow-400",
  W3: "text-orange-400", W4: "text-orange-500", W5: "text-red-400",
}

// ── Preview computation ───────────────────────────────────────────────────────

function previewScore(p: WeatherRegimeParams): {
  label: string; wind_comp: number; rain_comp: number; inst_comp: number; pred_disc: number; raw: number; wn: number
} {
  // Scenario: W2, wind=20 km/h, rain_prob=50%, instability=0.45, predictability=0.55
  const wts = p.weather_now_weights
  const windKmh = 20
  let windScore = 0
  for (const row of p.thresholds.wind_score_table) {
    if (windKmh >= row.min_kmh && windKmh <= row.max_kmh) { windScore = row.score; break }
  }
  const windComp  = Math.min(50, windScore * p.thresholds.wind_weight_scale)
  const rainScore = 25  // rain_prob=50% → rule_2
  const instComp  = 0.45 * wts.instability_scale
  const predDisc  = -(0.55 * wts.predictability_discount)
  const raw = wts.wind * windComp + wts.rain * rainScore + wts.instability * instComp + predDisc
  const wn  = Math.max(0, Math.min(50, raw))
  const base = p.regimes["W2"].base_score
  return {
    label: `W2 假設情境 (風 ${windKmh} km/h, 雨機率 50%, 不穩定 0.45)`,
    wind_comp: Math.round(windComp * 10) / 10,
    rain_comp: Math.round(wts.rain * rainScore * 10) / 10,
    inst_comp: Math.round(wts.instability * instComp * 10) / 10,
    pred_disc: Math.round(predDisc * 10) / 10,
    raw: Math.round((base + wn) * 10) / 10,
    wn: Math.round(wn * 10) / 10,
  }
}

// ── Tab types ─────────────────────────────────────────────────────────────────

type TabKey = "wr" | "wind_rain" | "classify" | "buffer"

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminParamsPage() {
  const [params, setParams] = useState<WeatherRegimeParams>(() => loadOverride() ?? getParams())
  const [activeTab, setActiveTab] = useState<TabKey>("wr")
  const [saved, setSaved] = useState(false)
  const [hasOverride, setHasOverride] = useState(false)

  useEffect(() => { setHasOverride(!!loadOverride()) }, [])

  const apply = useCallback(() => {
    saveOverride(params)
    setSaved(true)
    setHasOverride(true)
    setTimeout(() => setSaved(false), 2000)
  }, [params])

  const reset = useCallback(() => {
    clearOverride()
    setParams(WEATHER_REGIME_PARAMS)
    setHasOverride(false)
  }, [])

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(params, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "larm_params.json"
    a.click()
  }, [params])

  // ── WR Matrix cell toggle ─────────────────────────────────────────────────
  const toggleWR = useCallback((w: WCode, r: RLevelKey) => {
    setParams(prev => {
      const cur = prev.wr_matrix[w][r]
      const next = DECISION_CYCLE[(DECISION_CYCLE.indexOf(cur) + 1) % 3]
      return {
        ...prev,
        wr_matrix: { ...prev.wr_matrix, [w]: { ...prev.wr_matrix[w], [r]: next } },
      }
    })
  }, [])

  // ── Numeric field updater ─────────────────────────────────────────────────
  function setNested<T extends object>(
    key: keyof WeatherRegimeParams,
    field: keyof T,
    value: number,
  ) {
    setParams(prev => ({
      ...prev,
      [key]: { ...(prev[key] as T), [field]: value },
    }))
  }

  const preview = previewScore(params)

  const TABS: { key: TabKey; label: string; sublabel: string }[] = [
    { key: "wr",        label: "WR 矩陣",      sublabel: "GO / COND / NOGO" },
    { key: "wind_rain", label: "風雨評分",      sublabel: "分級 + 權重" },
    { key: "classify",  label: "天候分類",      sublabel: "W1-W5 閾值" },
    { key: "buffer",    label: "緩衝係數",      sublabel: "Buffer formula" },
  ]

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
      {/* Header */}
      <div className="flex items-start gap-3 mb-6">
        <SlidersHorizontal className="w-6 h-6 text-violet-400 mt-0.5 shrink-0" />
        <div>
          <h1 className="text-xl font-bold">Model Params — 模型參數</h1>
          <p className="text-sm text-zinc-400 mt-0.5">
            調整後點「套用」存入瀏覽器，頁面重載即生效。
            {hasOverride && <span className="ml-2 text-amber-400">● 已有覆寫值</span>}
          </p>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Left: tabs + content */}
        <div className="flex-1 min-w-0">
          {/* Tab bar */}
          <div className="flex gap-1 border-b border-zinc-800 mb-4">
            {TABS.map(t => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={cn(
                  "px-4 py-2 text-sm rounded-t-md transition-colors",
                  activeTab === t.key
                    ? "bg-zinc-800 text-white border-b-2 border-violet-500"
                    : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                {t.label}
                <span className="ml-1 text-[10px] text-zinc-600">{t.sublabel}</span>
              </button>
            ))}
          </div>

          {/* ── Tab: WR Matrix ───────────────────────────────────────────── */}
          {activeTab === "wr" && (
            <div>
              <p className="text-xs text-zinc-500 mb-3">點擊儲存格循環切換 GO → COND → ✕</p>
              <table className="text-xs border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th className="text-zinc-500 text-right pr-2 w-8"></th>
                    {R_KEYS.map(r => (
                      <th key={r} className="text-zinc-400 font-mono text-center w-16">{r}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {W_CODES.map(w => (
                    <tr key={w}>
                      <td className={cn("font-mono font-bold text-right pr-2", W_COLORS[w])}>{w}</td>
                      {R_KEYS.map(r => {
                        const dec = params.wr_matrix[w][r]
                        return (
                          <td key={r}>
                            <button
                              onClick={() => toggleWR(w, r as RLevelKey)}
                              className={cn(
                                "w-full py-1.5 rounded border text-[11px] font-medium transition-all hover:opacity-80",
                                DECISION_STYLE[dec]
                              )}
                            >
                              {DECISION_LABEL[dec]}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Tab: Wind / Rain Scoring ─────────────────────────────────── */}
          {activeTab === "wind_rain" && (
            <div className="space-y-6">
              {/* Wind score table */}
              <section>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">風速分級 → 分數</h3>
                <table className="text-xs w-auto">
                  <thead>
                    <tr className="text-zinc-500">
                      <th className="text-left pr-4">min km/h</th>
                      <th className="text-left pr-4">max km/h</th>
                      <th className="text-left">score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {params.thresholds.wind_score_table.map((row, i) => (
                      <tr key={i} className="border-t border-zinc-800/60">
                        <td className="pr-4 py-1 font-mono text-zinc-300">{row.min_kmh}</td>
                        <td className="pr-4 py-1 font-mono text-zinc-300">{row.max_kmh === 999 ? "∞" : row.max_kmh}</td>
                        <td className="py-1">
                          <input
                            type="number" min={0} max={100} step={1}
                            value={row.score}
                            onChange={e => {
                              const v = Number(e.target.value)
                              setParams(prev => {
                                const tbl = [...prev.thresholds.wind_score_table]
                                tbl[i] = { ...tbl[i], score: v }
                                return { ...prev, thresholds: { ...prev.thresholds, wind_score_table: tbl } }
                              })
                            }}
                            className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-white font-mono text-xs"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <label className="flex items-center gap-2 mt-2 text-xs text-zinc-400">
                  風速評分乘數 (wind_weight_scale)
                  <NumInput
                    value={params.thresholds.wind_weight_scale} min={0} max={2} step={0.05}
                    onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, wind_weight_scale: v } }))}
                  />
                </label>
              </section>

              {/* WeatherNow weights */}
              <section>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">WeatherNow 分項權重</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-zinc-400">
                  {(
                    [
                      ["wind", "風速權重"],
                      ["rain", "降雨權重"],
                      ["instability", "不穩定指數權重"],
                      ["instability_scale", "不穩定指數放大倍數"],
                      ["predictability_discount", "預測性折扣倍數"],
                      ["thunder_add", "雷雨加成分"],
                      ["ensemble_low_conf_threshold", "低信心門檻 (%)"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="flex items-center justify-between gap-2">
                      <span>{label}</span>
                      <NumInput
                        value={params.weather_now_weights[field]}
                        min={field === "ensemble_low_conf_threshold" ? 0 : 0}
                        max={field === "ensemble_low_conf_threshold" ? 100 : 50}
                        step={field === "ensemble_low_conf_threshold" ? 5 : 0.05}
                        onChange={v => setNested("weather_now_weights", field, v)}
                      />
                    </label>
                  ))}
                </div>
              </section>

              {/* Hard stop */}
              <section>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">硬停門檻</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-zinc-400">
                  {(
                    [
                      ["wind_kmh", "風速 (km/h)"],
                      ["rain_mmph", "雨量 (mm/h)"],
                      ["rain_prob_pct", "降雨機率 (%)"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="flex items-center justify-between gap-2">
                      <span>{label}</span>
                      <NumInput
                        value={params.thresholds.hard_stop[field]} min={0} max={200} step={1}
                        onChange={v => setParams(p => ({
                          ...p,
                          thresholds: { ...p.thresholds, hard_stop: { ...p.thresholds.hard_stop, [field]: v } }
                        }))}
                      />
                    </label>
                  ))}
                </div>
              </section>
            </div>
          )}

          {/* ── Tab: Weather Classification ──────────────────────────────── */}
          {activeTab === "classify" && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">UI 天候推斷閾值（ui_infer_thresholds）</h3>
              <p className="text-xs text-zinc-500 mb-3">用於 Climate 頁面和任務嚮導 Step 5 的即時天候顯示。</p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-zinc-400">
                {(
                  [
                    ["W5_wind_now_kmh", "W5 風速門檻 (km/h)"],
                    ["W5_gust_p90_kmh", "W5 陣風 P90 門檻 (km/h)"],
                    ["W4_rain_prob_pct", "W4 降雨機率門檻 (%)"],
                    ["W3_rain_days", "W3 降雨天數門檻"],
                    ["W3_rain_prob_pct", "W3 降雨機率門檻 (%)"],
                    ["W2_rain_days", "W2 降雨天數門檻"],
                    ["W2_rain_prob_pct", "W2 降雨機率門檻 (%)"],
                    ["W1_wind_now_kmh", "W1 風速門檻 (km/h)"],
                    ["W1_wind_p90_kmh", "W1 P90 風速門檻 (km/h)"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center justify-between gap-2">
                    <span>{label}</span>
                    <NumInput
                      value={params.ui_infer_thresholds[field]} min={0} max={100} step={1}
                      onChange={v => setNested("ui_infer_thresholds", field, v)}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* ── Tab: Buffer Coefficients ──────────────────────────────────── */}
          {activeTab === "buffer" && (
            <div>
              <h3 className="text-sm font-semibold text-zinc-300 mb-3">Buffer Ratio 公式係數</h3>
              <p className="text-xs text-zinc-500 mb-3 font-mono">
                buffer = base + score/score_divisor + vol[W] + (1-regime_conf)×regime_conf_penalty + (1-ens_conf/100)×ensemble_penalty
              </p>
              <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-xs text-zinc-400">
                {(
                  [
                    ["base", "基礎值 (base)"],
                    ["score_divisor", "分數除數 (score_divisor)"],
                    ["regime_conf_penalty", "天候置信度懲罰 (regime_conf_penalty)"],
                    ["ensemble_penalty", "集合模型懲罰 (ensemble_penalty)"],
                    ["min", "最小值 (min)"],
                    ["max", "最大值 (max)"],
                  ] as const
                ).map(([field, label]) => (
                  <label key={field} className="flex items-center justify-between gap-2">
                    <span>{label}</span>
                    <NumInput
                      value={params.buffer_coefficients[field]}
                      min={0} max={field === "score_divisor" ? 1000 : 1}
                      step={field === "score_divisor" ? 10 : 0.01}
                      onChange={v => setNested("buffer_coefficients", field, v)}
                    />
                  </label>
                ))}
              </div>

              {/* Volatility add per W */}
              <h3 className="text-sm font-semibold text-zinc-300 mt-5 mb-2">波動緩衝加成 (volatility_buffer_add)</h3>
              <div className="grid grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-zinc-400">
                {W_CODES.map(w => (
                  <label key={w} className="flex items-center justify-between gap-2">
                    <span className={W_COLORS[w]}>{w}</span>
                    <NumInput
                      value={params.volatility_buffer_add[w]} min={0} max={0.30} step={0.01}
                      onChange={v => setParams(p => ({
                        ...p,
                        volatility_buffer_add: { ...p.volatility_buffer_add, [w]: v }
                      }))}
                    />
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Live preview panel */}
        <div className="w-64 shrink-0">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 text-xs sticky top-6">
            <div className="text-zinc-400 font-semibold mb-2 text-[11px] uppercase tracking-wider">即時預覽</div>
            <div className="text-zinc-500 mb-3 leading-snug">{preview.label}</div>
            <div className="space-y-1">
              <PreviewRow label="風速分項" value={preview.wind_comp} />
              <PreviewRow label="降雨分項" value={preview.rain_comp} />
              <PreviewRow label="不穩定分項" value={preview.inst_comp} />
              <PreviewRow label="預測性折扣" value={preview.pred_disc} signed />
              <div className="border-t border-zinc-800 my-1.5" />
              <PreviewRow label="WeatherNow" value={preview.wn} highlight />
              <PreviewRow label="+ Base(W2)=12 → R_score" value={preview.raw} highlight />
            </div>
            <div className="mt-3 text-[10px] text-zinc-600">* B/O/E 分項未計入（假設=0）</div>
          </div>
        </div>
      </div>

      {/* Bottom action bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-zinc-950/95 border-t border-zinc-800 px-6 py-3 flex items-center gap-3">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          重設為 v1.0 預設值
        </button>
        <button
          onClick={exportJSON}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          匯出 JSON
        </button>
        <div className="flex-1" />
        {saved && <span className="text-emerald-400 text-xs">✓ 已套用</span>}
        <button
          onClick={apply}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white transition-colors"
        >
          <Save className="w-3.5 h-3.5" />
          套用
        </button>
      </div>

      {/* Spacer for fixed bottom bar */}
      <div className="h-16" />
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

function NumInput({
  value, min, max, step, onChange
}: { value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number" min={min} max={max} step={step}
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      className="w-20 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-white font-mono text-xs text-right"
    />
  )
}

function PreviewRow({ label, value, highlight, signed }: { label: string; value: number; highlight?: boolean; signed?: boolean }) {
  return (
    <div className={cn("flex justify-between", highlight ? "text-violet-300" : "text-zinc-400")}>
      <span>{label}</span>
      <span className="font-mono">{signed && value > 0 ? "+" : ""}{value}</span>
    </div>
  )
}
