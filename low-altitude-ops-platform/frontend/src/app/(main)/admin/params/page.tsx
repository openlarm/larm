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
// Bottom bar: Reset to v2.0 defaults | Export JSON | Apply (save to localStorage)

import { useState, useCallback, useEffect } from "react"
import { SlidersHorizontal, RefreshCw, Download, Save } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  WEATHER_REGIME_PARAMS,
  type WeatherRegimeParams,
  type WCode,
  type RLevelKey,
  type WRDecision,
} from "@/lib/engines/weather-regime-params"
import {
  loadParamOverride,
  saveParamOverride,
  clearParamOverride,
  getParamsWithOverride,
} from "@/lib/params-store"
import type { RiskLevel, WeatherType } from "@/lib/types"

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
  const cap = p.weather_now_weights.weather_now_cap ?? 42
  const wn  = Math.max(0, Math.min(cap, raw))
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

type TabKey = "wr" | "wind_rain" | "classify" | "buffer" | "r_index" | "pricing"

// ── Component ─────────────────────────────────────────────────────────────────

export default function AdminParamsPage() {
  const [params, setParams] = useState<WeatherRegimeParams>(() => getParamsWithOverride())
  const [activeTab, setActiveTab] = useState<TabKey>("wr")
  const [saved, setSaved] = useState(false)
  const [hasOverride, setHasOverride] = useState(false)

  useEffect(() => { setHasOverride(loadParamOverride() !== null) }, [])

  const apply = useCallback(() => {
    saveParamOverride(params)
    setSaved(true)
    setHasOverride(true)
    setTimeout(() => setSaved(false), 2000)
  }, [params])

  const reset = useCallback(() => {
    clearParamOverride()
    setParams(WEATHER_REGIME_PARAMS)
    setHasOverride(false)
  }, [])

  const exportJSON = useCallback(() => {
    const blob = new Blob([JSON.stringify(params, null, 2)], { type: "application/json" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "model_params.json"
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
    { key: "r_index",   label: "R指標",         sublabel: "B/O/E + 完成率" },
    { key: "pricing",   label: "報價",           sublabel: "計費參數" },
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
                    {params.thresholds.wind_score_table.map((row, i) => {
                      const isFirst = i === 0
                      const isLast  = i === params.thresholds.wind_score_table.length - 1
                      const updRow  = (field: "min_kmh" | "max_kmh" | "score", v: number) =>
                        setParams(prev => {
                          const tbl = [...prev.thresholds.wind_score_table]
                          tbl[i] = { ...tbl[i], [field]: v }
                          return { ...prev, thresholds: { ...prev.thresholds, wind_score_table: tbl } }
                        })
                      return (
                        <tr key={i} className="border-t border-zinc-800/60">
                          <td className="pr-3 py-1">
                            {isFirst
                              ? <span className="font-mono text-xs text-zinc-600">0</span>
                              : <input type="number" min={0} max={200} step={1} value={row.min_kmh}
                                  onChange={e => updRow("min_kmh", Number(e.target.value))}
                                  className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-white font-mono text-xs" />
                            }
                          </td>
                          <td className="pr-3 py-1">
                            {isLast
                              ? <span className="font-mono text-xs text-zinc-600">∞</span>
                              : <input type="number" min={0} max={200} step={1} value={row.max_kmh}
                                  onChange={e => updRow("max_kmh", Number(e.target.value))}
                                  className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-white font-mono text-xs" />
                            }
                          </td>
                          <td className="py-1">
                            <input type="number" min={0} max={100} step={1} value={row.score}
                              onChange={e => updRow("score", Number(e.target.value))}
                              className="w-16 bg-zinc-900 border border-zinc-700 rounded px-2 py-0.5 text-white font-mono text-xs" />
                          </td>
                        </tr>
                      )
                    })}
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
                      ["instability_scale_w4", "W4 不穩定放大 (v2.0)"],
                      ["weather_now_cap", "WeatherNow 上限 (v2.0)"],
                      ["w4_time_multiplier", "W4 午後乘數 (v2.0)"],
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
                      ["edr_threshold", "EDR 渦散率 (v2.0)"],
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

              {/* Rain score rules */}
              <section>
                <h3 className="text-sm font-semibold text-zinc-300 mb-1">降雨評分規則</h3>
                <p className="text-[10px] text-zinc-600 mb-2">每條規則匹配後回傳對應分數（0–45），由上往下第一個符合條件為準。</p>
                <table className="text-xs w-full">
                  <thead>
                    <tr className="text-zinc-500 text-[10px]">
                      <th className="text-left pr-2 pb-1">規則</th>
                      <th className="text-left pr-2 pb-1">機率下 (%)</th>
                      <th className="text-left pr-2 pb-1">機率上 (%)</th>
                      <th className="text-left pr-2 pb-1">雨量下 (mm/h)</th>
                      <th className="text-left pr-2 pb-1">雨量上 (mm/h)</th>
                      <th className="text-left pb-1">分數</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-400">
                    {/* rule_0 — dry */}
                    <tr className="border-t border-zinc-800/60">
                      <td className="pr-2 py-1 text-zinc-500">r0 乾燥</td>
                      <td className="pr-2 py-1"><span className="text-zinc-600 font-mono text-[10px]">0</span></td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_0.rain_prob_lt_pct} min={0} max={100} step={5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_0: { ...p.thresholds.rain_score_rules.rule_0, rain_prob_lt_pct: v } } } }))} />
                      </td>
                      <td className="pr-2 py-1"><span className="text-zinc-600 font-mono text-[10px]">0</span></td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_0.rain_mmph_lt} min={0} max={50} step={0.5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_0: { ...p.thresholds.rain_score_rules.rule_0, rain_mmph_lt: v } } } }))} />
                      </td>
                      <td className="py-1"><NumInput value={params.thresholds.rain_score_rules.rule_0.score} min={0} max={100} step={1}
                        onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_0: { ...p.thresholds.rain_score_rules.rule_0, score: v } } } }))} /></td>
                    </tr>
                    {/* rule_1 — light */}
                    <tr className="border-t border-zinc-800/60">
                      <td className="pr-2 py-1 text-zinc-500">r1 小雨</td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_1.rain_prob_gte_pct} min={0} max={100} step={5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_1: { ...p.thresholds.rain_score_rules.rule_1, rain_prob_gte_pct: v } } } }))} />
                      </td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_1.rain_prob_lte_pct} min={0} max={100} step={5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_1: { ...p.thresholds.rain_score_rules.rule_1, rain_prob_lte_pct: v } } } }))} />
                      </td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_1.or_mmph_gte} min={0} max={50} step={0.5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_1: { ...p.thresholds.rain_score_rules.rule_1, or_mmph_gte: v } } } }))} />
                      </td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_1.or_mmph_lte} min={0} max={50} step={0.5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_1: { ...p.thresholds.rain_score_rules.rule_1, or_mmph_lte: v } } } }))} />
                      </td>
                      <td className="py-1"><NumInput value={params.thresholds.rain_score_rules.rule_1.score} min={0} max={100} step={1}
                        onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_1: { ...p.thresholds.rain_score_rules.rule_1, score: v } } } }))} /></td>
                    </tr>
                    {/* rule_2 — moderate */}
                    <tr className="border-t border-zinc-800/60">
                      <td className="pr-2 py-1 text-zinc-500">r2 中雨</td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_2.rain_prob_gte_pct} min={0} max={100} step={5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_2: { ...p.thresholds.rain_score_rules.rule_2, rain_prob_gte_pct: v } } } }))} />
                      </td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_2.rain_prob_lte_pct} min={0} max={100} step={5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_2: { ...p.thresholds.rain_score_rules.rule_2, rain_prob_lte_pct: v } } } }))} />
                      </td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_2.or_mmph_gte} min={0} max={50} step={0.5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_2: { ...p.thresholds.rain_score_rules.rule_2, or_mmph_gte: v } } } }))} />
                      </td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_2.or_mmph_lte} min={0} max={50} step={0.5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_2: { ...p.thresholds.rain_score_rules.rule_2, or_mmph_lte: v } } } }))} />
                      </td>
                      <td className="py-1"><NumInput value={params.thresholds.rain_score_rules.rule_2.score} min={0} max={100} step={1}
                        onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_2: { ...p.thresholds.rain_score_rules.rule_2, score: v } } } }))} /></td>
                    </tr>
                    {/* rule_3 — heavy */}
                    <tr className="border-t border-zinc-800/60">
                      <td className="pr-2 py-1 text-zinc-500">r3 大雨</td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_3.rain_prob_gt_pct} min={0} max={100} step={5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_3: { ...p.thresholds.rain_score_rules.rule_3, rain_prob_gt_pct: v } } } }))} />
                      </td>
                      <td className="pr-2 py-1"><span className="text-zinc-600 font-mono text-[10px]">100</span></td>
                      <td className="pr-2 py-1">
                        <NumInput value={params.thresholds.rain_score_rules.rule_3.or_mmph_gt} min={0} max={100} step={0.5}
                          onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_3: { ...p.thresholds.rain_score_rules.rule_3, or_mmph_gt: v } } } }))} />
                      </td>
                      <td className="pr-2 py-1"><span className="text-zinc-600 font-mono text-[10px]">∞</span></td>
                      <td className="py-1"><NumInput value={params.thresholds.rain_score_rules.rule_3.score} min={0} max={100} step={1}
                        onChange={v => setParams(p => ({ ...p, thresholds: { ...p.thresholds, rain_score_rules: { ...p.thresholds.rain_score_rules, rule_3: { ...p.thresholds.rain_score_rules.rule_3, score: v } } } }))} /></td>
                    </tr>
                  </tbody>
                </table>
              </section>
            </div>
          )}

          {/* ── Tab: Weather Classification ──────────────────────────────── */}
          {activeTab === "classify" && (
            <div className="space-y-5">
              {/* Regime base scores */}
              <section>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">天候基礎分 (Base Score)</h3>
                <p className="text-xs text-zinc-500 mb-2">R_score 的固定底分，反映各天候型態的固有風險高低。</p>
                <div className="grid grid-cols-3 gap-x-6 gap-y-1.5 text-xs text-zinc-400">
                  {W_CODES.map(w => (
                    <label key={w} className="flex items-center justify-between gap-2">
                      <span className={W_COLORS[w]}>{w} {params.regimes[w].name.slice(0, 5)}</span>
                      <NumInput
                        value={params.regimes[w].base_score} min={0} max={40} step={1}
                        onChange={v => setParams(p => ({
                          ...p,
                          regimes: { ...p.regimes, [w]: { ...p.regimes[w], base_score: v } }
                        }))}
                      />
                    </label>
                  ))}
                </div>
              </section>

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

              {/* R-level score mapping */}
              <h3 className="text-sm font-semibold text-zinc-300 mt-5 mb-1">R 等級分數對應 (mapping_r_level)</h3>
              <p className="text-[10px] text-zinc-600 mb-2">R_score 落入哪個區間即判定為該 R 等級。</p>
              <table className="text-xs w-auto">
                <thead>
                  <tr className="text-zinc-500 text-[10px]">
                    <th className="text-left pr-4 pb-1">等級</th>
                    <th className="text-left pr-4 pb-1">min</th>
                    <th className="text-left pb-1">max</th>
                  </tr>
                </thead>
                <tbody className="text-zinc-400">
                  {params.thresholds.mapping_r_level.map((row, i) => {
                    const isFirst = i === 0
                    const isLast  = i === params.thresholds.mapping_r_level.length - 1
                    const updRL = (field: "min" | "max", v: number) =>
                      setParams(prev => {
                        const tbl = [...prev.thresholds.mapping_r_level]
                        tbl[i] = { ...tbl[i], [field]: v }
                        return { ...prev, thresholds: { ...prev.thresholds, mapping_r_level: tbl } }
                      })
                    return (
                      <tr key={i} className="border-t border-zinc-800/60">
                        <td className="pr-4 py-1 font-mono font-bold" style={{ color: ["#34d399","#38bdf8","#fbbf24","#fb923c","#f87171"][i] }}>{row.r_level}</td>
                        <td className="pr-4 py-1">
                          {isFirst
                            ? <span className="font-mono text-zinc-600 text-[10px]">0</span>
                            : <NumInput value={row.min} min={0} max={100} step={1} onChange={v => updRL("min", v)} />
                          }
                        </td>
                        <td className="py-1">
                          {isLast
                            ? <span className="font-mono text-zinc-600 text-[10px]">100</span>
                            : <NumInput value={row.max} min={0} max={100} step={1} onChange={v => updRL("max", v)} />
                          }
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Tab: R指標 ───────────────────────────────────────────── */}
          {activeTab === "r_index" && (
            <div className="space-y-5">
              <p className="text-[11px] text-amber-600/70 border border-amber-900/30 rounded px-3 py-2 bg-amber-950/20">
                ⓘ 以下參數定義於 <code className="font-mono">risk-engine.ts</code>，目前為唯讀參考（不受 localStorage 覆寫影響）。
              </p>

              {/* 完成率估計 */}
              <section>
                <h3 className="text-sm font-semibold text-zinc-300 mb-1">任務完成率估計（completionForRL）</h3>
                <p className="text-[10px] text-zinc-500 mb-2 font-mono">max(5, min(99, base[R] − wIdx × 3))　W 每升一級扣 3%</p>
                <table className="text-xs w-auto">
                  <thead>
                    <tr className="text-zinc-500 text-[10px]">
                      <th className="text-left pr-4 pb-1">R-level</th>
                      <th className="text-right pr-6 pb-1">基礎完成率</th>
                      <th className="text-left pb-1">W0 / W1 / W2 / W3 / W4 / W5</th>
                    </tr>
                  </thead>
                  <tbody className="text-zinc-400">
                    {([
                      ["R0", "97%", "97 / 94 / 91 / 88 / 85 / 82"],
                      ["R1", "82%", "82 / 79 / 76 / 73 / 70 / 67"],
                      ["R2", "60%", "60 / 57 / 54 / 51 / 48 / 45"],
                      ["R3", "35%", "35 / 32 / 29 / 26 / 23 / 20"],
                      ["R4", "10%", "10 / 7 / 5 / 5 / 5 / 5　(min=5)"],
                    ] as [string, string, string][]).map(([rl, base, wRange]) => (
                      <tr key={rl} className="border-t border-zinc-800/60">
                        <td className="pr-4 py-1 font-mono font-bold">{rl}</td>
                        <td className="pr-6 py-1 text-right font-mono">{base}</td>
                        <td className="py-1 text-zinc-500 text-[10px] font-mono">{wRange}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {/* G_score (v2.0, renamed from B_score) */}
              <section>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">G_score 場地風險（上限 20）<span className="text-[10px] text-zinc-500 ml-2">v2.0 — 原 B_score (0–25) 重構為 4 子維度</span></h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1">Structural 結構（上限 10）</p>
                    <table className="text-xs w-full">
                      <tbody className="text-zinc-400">
                        <tr><td colSpan={2} className="text-[10px] text-zinc-600 pt-1">樓層</td></tr>
                        {[["≤ 10 層", "+0"], ["11–20 層", "+3"], ["21–30 層", "+6"], ["> 30 層", "+8"]].map(([tier, pts]) => (
                          <tr key={tier} className="border-t border-zinc-800/40">
                            <td className="py-0.5 pr-4">{tier}</td>
                            <td className="py-0.5 font-mono text-right">{pts}</td>
                          </tr>
                        ))}
                        <tr><td colSpan={2} className="text-[10px] text-zinc-600 pt-2">海拔</td></tr>
                        {[["≤ 100 m", "+0"], ["101–300 m", "+1"], ["301–800 m", "+3"], ["> 800 m", "+5"]].map(([tier, pts]) => (
                          <tr key={tier} className="border-t border-zinc-800/40">
                            <td className="py-0.5 pr-4">{tier}</td>
                            <td className="py-0.5 font-mono text-right">{pts}</td>
                          </tr>
                        ))}
                        <tr><td colSpan={2} className="text-[10px] text-zinc-600 pt-2">立面</td></tr>
                        {[["light", "+2"], ["medium", "+4"], ["heavy", "+6"]].map(([tier, pts]) => (
                          <tr key={tier} className="border-t border-zinc-800/40">
                            <td className="py-0.5 pr-4">{tier}</td>
                            <td className="py-0.5 font-mono text-right">{pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <p className="text-[10px] text-zinc-500 mb-1">Ground Consequence 地面後果（上限 6）— SORA 2.5 iGRC</p>
                    <table className="text-xs w-full">
                      <tbody className="text-zinc-400">
                        {[["assembly 集會區", "6"], ["high_urban 高密度都市", "5"], ["residential 住宅區", "4"], ["light 低密度", "2"], ["isolated 隔離區", "1"]].map(([tier, pts]) => (
                          <tr key={tier} className="border-t border-zinc-800/40">
                            <td className="py-0.5 pr-4">{tier}</td>
                            <td className="py-0.5 font-mono text-right">{pts}</td>
                          </tr>
                        ))}
                        <tr><td colSpan={2} className="text-[10px] text-zinc-600 pt-2">M1 緩解措施 (各 −1, 最多 −3)</td></tr>
                        {[["M1A 降落傘", "−1"], ["M1B 技術緩解", "−1"], ["M1C 運營緩解", "−1"]].map(([item, pts]) => (
                          <tr key={item} className="border-t border-zinc-800/40">
                            <td className="py-0.5 pr-4">{item}</td>
                            <td className="py-0.5 font-mono text-right">{pts}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <p className="text-[10px] text-zinc-500 mb-1 mt-3">TKE 代理（上限 3）</p>
                    <p className="text-[10px] text-zinc-600 mb-1">tke = floor_factor × wind_factor × corridor_factor</p>

                    <p className="text-[10px] text-zinc-500 mb-1 mt-3">Env + Interaction（上限 4）</p>
                    <table className="text-xs w-full">
                      <tbody className="text-zinc-400">
                        {[["鄰近高壓電", "+3"], ["鄰近基地台", "+1"], ["淨空 < 5 m", "+2"]].map(([item, pts]) => (
                          <tr key={item} className="border-t border-zinc-800/40">
                            <td className="py-0.5 pr-4">{item}</td>
                            <td className="py-0.5 font-mono text-right">{pts}</td>
                          </tr>
                        ))}
                        <tr><td colSpan={2} className="text-[10px] text-zinc-600 pt-1">env cap=3, interaction cap=2</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* O_score */}
              <section>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">O_score 作業評分（上限 12）<span className="text-[10px] text-zinc-500 ml-2">v2.0 — 各因子等比縮減 ~20%</span></h3>
                <table className="text-xs w-auto">
                  <tbody className="text-zinc-400">
                    {[
                      ["夜間作業", "+5"], ["週末", "+2"], ["封路需求", "+3"],
                      ["急件 ≤ 3 天", "+5"], ["急件 4–7 天", "+3"],
                      ["高人流密度", "+3"], ["中人流密度", "+2"],
                      ["初級操作員", "+2"],
                      ["長工期疲勞 ≥ 7 天", "+3"], ["長工期疲勞 4–6 天", "+2"],
                    ].map(([item, pts]) => (
                      <tr key={item} className="border-t border-zinc-800/40">
                        <td className="py-0.5 pr-8">{item}</td>
                        <td className="py-0.5 font-mono text-right">{pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>

              {/* E_score */}
              <section>
                <h3 className="text-sm font-semibold text-zinc-300 mb-2">E_score 設備評分（上限 8）<span className="text-[10px] text-zinc-500 ml-2">v2.0 — Block ×3, Warn ×1.5</span></h3>
                <table className="text-xs w-auto mb-2">
                  <tbody className="text-zinc-400">
                    {[["Block 狀態設備", "每件 +3"], ["Warn 狀態設備", "每件 +1.5"], ["OK 狀態設備", "0"]].map(([item, pts]) => (
                      <tr key={item} className="border-t border-zinc-800/40">
                        <td className="py-0.5 pr-8">{item}</td>
                        <td className="py-0.5 font-mono">{pts}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="text-[10px] text-zinc-500 space-y-0.5">
                  <div><span className="text-amber-400">E ≥ 6</span> → CONDITIONAL <span className="text-amber-400">Tier C</span>（主管+客戶確認）</div>
                  <div><span className="text-red-400">E ≥ 8</span> → 強制 CONDITIONAL <span className="text-red-400">Tier C</span>（主管 + 客戶雙方書面確認）</div>
                </div>
              </section>
            </div>
          )}

          {/* ── Tab: 報價 ─────────────────────────────────────────────── */}
          {activeTab === "pricing" && (
            <div className="space-y-5">
              <p className="text-[11px] text-violet-400/70 border border-violet-900/30 rounded px-3 py-2 bg-violet-950/20">
                ⓘ 調整報價參數後點「套用」，Mission Wizard 及 Quote Wizard 皆會連動。版本：<span className="font-mono">{params.pricing.version}</span>
              </p>

              <div className="grid grid-cols-2 gap-6">
                <section>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">基本單價（NTD / ㎡）</h3>
                  <table className="text-xs w-full">
                    <tbody className="text-zinc-400">
                      {([["commercial", "商辦"], ["luxury", "豪宅"], ["house", "透天/獨棟"], ["factory", "廠房"], ["solar", "太陽能板"]] as const).map(([key, label]) => (
                        <tr key={key} className="border-t border-zinc-800/40">
                          <td className="py-1 pr-4">{label} {key}</td>
                          <td className="py-1 text-right">
                            <NumInput value={params.pricing.base_price[key]} min={0} max={999} step={1}
                              onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, base_price: { ...p.pricing.base_price, [key]: v } } }))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">立面複雜度加價（NTD / ㎡）</h3>
                  <table className="text-xs w-full">
                    <tbody className="text-zinc-400">
                      {([["light", "輕度"], ["medium", "中度"], ["heavy", "重度"]] as const).map(([key, label]) => (
                        <tr key={key} className="border-t border-zinc-800/40">
                          <td className="py-1 pr-4">{label} {key}</td>
                          <td className="py-1 text-right">
                            <NumInput value={params.pricing.complexity_surcharge[key]} min={0} max={99} step={1}
                              onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, complexity_surcharge: { ...p.pricing.complexity_surcharge, [key]: v } } }))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">污染類型加價（NTD / ㎡）</h3>
                  <table className="text-xs w-full">
                    <tbody className="text-zinc-400">
                      {([["dust", "粉塵"], ["scale", "水垢"], ["bird", "鳥糞"], ["mold", "黴菌"], ["exhaust", "廢氣排放"], ["grease", "油污"]] as const).map(([key, label]) => (
                        <tr key={key} className="border-t border-zinc-800/40">
                          <td className="py-1 pr-4">{label} {key}</td>
                          <td className="py-1 text-right">
                            <NumInput value={params.pricing.contamination_surcharge[key]} min={0} max={99} step={1}
                              onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, contamination_surcharge: { ...p.pricing.contamination_surcharge, [key]: v } } }))} />
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-zinc-800/40">
                        <td className="py-1 pr-4 text-zinc-500">疊加上限 cap</td>
                        <td className="py-1 text-right">
                          <NumInput value={params.pricing.contamination_cap} min={0} max={99} step={1}
                            onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, contamination_cap: v } }))} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">清潔方式加價（NTD / ㎡）</h3>
                  <table className="text-xs w-full">
                    <tbody className="text-zinc-400">
                      {([["soft", "柔洗"], ["standard", "淨洗"], ["deep", "精洗"]] as const).map(([key, label]) => (
                        <tr key={key} className="border-t border-zinc-800/40">
                          <td className="py-1 pr-4">{label} {key}</td>
                          <td className="py-1 text-right">
                            <NumInput value={params.pricing.cleaning_agent_surcharge[key]} min={-99} max={99} step={1}
                              onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, cleaning_agent_surcharge: { ...p.pricing.cleaning_agent_surcharge, [key]: v } } }))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">每立面條件加價（NTD / ㎡）</h3>
                  <table className="text-xs w-full">
                    <tbody className="text-zinc-400">
                      {([["road_closure", "封路"], ["tight_perimeter", "空間受限"], ["high_risk_env", "高風險環境"], ["adjacent_trees", "鄰樹"], ["tree_extra", "鄰樹影清洗"]] as const).map(([key, label]) => (
                        <tr key={key} className="border-t border-zinc-800/40">
                          <td className="py-1 pr-4">{label}</td>
                          <td className="py-1 text-right">
                            <NumInput value={params.pricing.facade_surcharges[key]} min={0} max={99} step={1}
                              onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, facade_surcharges: { ...p.pricing.facade_surcharges, [key]: v } } }))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">建物條件加價（NTD / ㎡）</h3>
                  <table className="text-xs w-full">
                    <tbody className="text-zinc-400">
                      {([["water_self", "自備用水"], ["power_self", "自備電力"], ["rooftop_not_good", "屋頂條件不佳"]] as const).map(([key, label]) => (
                        <tr key={key} className="border-t border-zinc-800/40">
                          <td className="py-1 pr-4">{label}</td>
                          <td className="py-1 text-right">
                            <NumInput value={params.pricing.supply_surcharges[key]} min={0} max={99} step={1}
                              onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, supply_surcharges: { ...p.pricing.supply_surcharges, [key]: v } } }))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </div>

              <div className="grid grid-cols-3 gap-6">
                <section>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">樓層乘數</h3>
                  <table className="text-xs w-full">
                    <tbody className="text-zinc-400">
                      {params.pricing.floor_multiplier.map((tier, i) => (
                        <tr key={i} className="border-t border-zinc-800/40">
                          <td className="py-1 pr-3">≤ {tier.max_floor >= 9999 ? "∞" : tier.max_floor} 層</td>
                          <td className="py-1 text-right">
                            <NumInput value={tier.multiplier} min={0.1} max={10} step={0.1}
                              onChange={v => setParams(p => ({
                                ...p,
                                pricing: { ...p.pricing, floor_multiplier: p.pricing.floor_multiplier.map((t, j) => j === i ? { ...t, multiplier: v } : t) },
                              }))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">時間窗口乘數</h3>
                  <table className="text-xs w-full">
                    <tbody className="text-zinc-400">
                      {([["day", "日間"], ["weekend", "週末"], ["night", "夜間"]] as const).map(([key, label]) => (
                        <tr key={key} className="border-t border-zinc-800/40">
                          <td className="py-1 pr-3">{label} {key}</td>
                          <td className="py-1 text-right">
                            <NumInput value={params.pricing.time_window_multiplier[key]} min={0.1} max={10} step={0.1}
                              onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, time_window_multiplier: { ...p.pricing.time_window_multiplier, [key]: v } } }))} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>

                <section>
                  <h3 className="text-sm font-semibold text-zinc-300 mb-1">其他參數</h3>
                  <table className="text-xs w-full">
                    <tbody className="text-zinc-400">
                      <tr className="border-t border-zinc-800/40">
                        <td className="py-1 pr-3">急件乘數</td>
                        <td className="py-1 text-right">
                          <NumInput value={params.pricing.urgent_multiplier} min={1} max={5} step={0.01}
                            onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, urgent_multiplier: v } }))} />
                        </td>
                      </tr>
                      <tr className="border-t border-zinc-800/40">
                        <td className="py-1 pr-3">最低訂單金額</td>
                        <td className="py-1 text-right">
                          <NumInput value={params.pricing.min_order} min={0} max={999999} step={1000}
                            onChange={v => setParams(p => ({ ...p, pricing: { ...p.pricing, min_order: v } }))} />
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </section>
              </div>

              <div className="text-xs text-zinc-600 border-t border-zinc-800 pt-3 space-y-1">
                <div>總額 = round(小計 × 樓層 × 時間 × 急件)</div>
                <div className="text-amber-500/70">v2.0: 複合乘數上限 = {params.quote_max_multiplier ?? 4.5}× — 超過則需人工審查</div>
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
              <PreviewRow label="+ Base(W2)=11 → R_score" value={preview.raw} highlight />
            </div>
            <div className="mt-3 text-[10px] text-zinc-600">* G/O/E 分項未計入（假設=0）</div>
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
          重設為 v2.0 預設值
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
