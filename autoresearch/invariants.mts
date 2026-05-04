// autoresearch/invariants.mts
// ===========================
// Probes against TAIWAN_PARAMS_V2_0 + evaluateRisk to enforce structural
// safety properties the agent could otherwise game.
//
// DO NOT let the agent edit this file.
//
// Run via:    npx tsx autoresearch/invariants.mts
// Output:     a single line "INVARIANTS_JSON: { ... }" parsed by evaluate.mjs

import { TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"
import { evaluateRisk } from "@openlarm/core"
import type { LARMInput } from "@openlarm/core"
import "@openlarm/regions-taiwan"  // self-registers

type Check = { name: string; passed: boolean; msg: string }

const P = TAIWAN_PARAMS_V2_0
const checks: Check[] = []

function add(name: string, passed: boolean, msg: string) {
  checks.push({ name, passed, msg: passed ? "ok" : msg })
}

// ---------------------------------------------------------------------------
// structural invariants on the params object
// ---------------------------------------------------------------------------

// 1. weather_now weights sum to 1.0
{
  const w = P.weather_now_weights
  const s = w.wind + w.rain + w.instability
  add(
    "weather_now_weights_sum_to_one",
    Math.abs(s - 1.0) < 0.02,
    `wind+rain+instability = ${s.toFixed(4)}, want ~1.0 (epsilon 0.02)`,
  )
  add(
    "weather_now_weights_in_unit_interval",
    [w.wind, w.rain, w.instability].every(v => v >= 0 && v <= 1),
    `weights out of [0,1]: wind=${w.wind} rain=${w.rain} inst=${w.instability}`,
  )
}

// 2. wind_score_table is monotonic and contiguous
{
  const t = P.thresholds.wind_score_table
  let monotonic = true
  let contiguous = true
  for (let i = 1; i < t.length; i++) {
    if (t[i].score < t[i - 1].score) monotonic = false
    if (t[i].min_kmh !== t[i - 1].max_kmh + 1) contiguous = false
  }
  add("wind_score_table_monotonic", monotonic,
      "wind score table not monotonically non-decreasing")
  add("wind_score_table_contiguous", contiguous,
      "wind score table has gaps or overlaps between rows")
}

// 3. mapping_r_level partitions [0, 100] without gaps/overlaps
{
  const m = P.thresholds.mapping_r_level
  let ok = m[0].min === 0 && m[m.length - 1].max === 100
  for (let i = 1; i < m.length; i++) {
    if (m[i].min !== m[i - 1].max + 1) { ok = false; break }
  }
  add("mapping_r_level_partition", ok,
      `R-level mapping not a clean [0..100] partition`)
}

// 4. hard-stop thresholds within safety floor (catches the agent silently
//    weakening hard stops to chase metric)
{
  const hs = P.thresholds.hard_stop
  add("hard_stop_wind_floor",   hs.wind_kmh   >= 35 && hs.wind_kmh   <= 41,
      `hard_stop.wind_kmh=${hs.wind_kmh} outside [35, 41]`)
  add("hard_stop_rain_floor",   hs.rain_mmph  >= 8  && hs.rain_mmph  <= 12,
      `hard_stop.rain_mmph=${hs.rain_mmph} outside [8, 12]`)
  add("hard_stop_rain_prob",    hs.rain_prob_pct >= 50 && hs.rain_prob_pct <= 70,
      `hard_stop.rain_prob_pct=${hs.rain_prob_pct} outside [50, 70]`)
  add("hard_stop_edr_floor",    hs.edr_threshold >= 0.7 && hs.edr_threshold <= 0.85,
      `hard_stop.edr_threshold=${hs.edr_threshold} outside [0.7, 0.85]`)
}

// 5. WR matrix: W1/R0 must not be "nogo" (v1.1 Bug 3 regression)
{
  const cell = P.wr_matrix.W1?.R0
  add("wr_matrix_w1_r0_not_nogo", cell !== "nogo",
      `wr_matrix.W1.R0 = ${JSON.stringify(cell)}, must not be "nogo"`)
}

// 6. EDR adjustments monotonic in min_edr; top entry must not exceed hard stop
{
  const edr = P.edr_thresholds
  let mon = true
  for (let i = 1; i < edr.length; i++) {
    if (edr[i].min_edr <= edr[i - 1].min_edr) mon = false
    if (edr[i].adj    <  edr[i - 1].adj)      mon = false
  }
  add("edr_thresholds_monotonic", mon,
      `edr_thresholds not monotonic`)
  add("edr_thresholds_at_or_below_hard_stop",
      edr[edr.length - 1].min_edr <= P.thresholds.hard_stop.edr_threshold,
      `top edr_thresholds.min_edr=${edr[edr.length - 1].min_edr} > hard_stop=${P.thresholds.hard_stop.edr_threshold}`)
}

// 7. buffer coefficients sane
{
  const b = P.buffer_coefficients
  add("buffer_min_lt_max", b.min < b.max,
      `buffer min=${b.min} not < max=${b.max}`)
  add("buffer_max_capped", b.max <= 0.6,
      `buffer.max=${b.max} > 0.6 (sane upper bound)`)
}

// ---------------------------------------------------------------------------
// behavioural invariants — black-box probes against evaluateRisk()
// ---------------------------------------------------------------------------

const benignInput: LARMInput = {
  weather_30d: {
    wind_mean_kmh: 8, wind_p90_kmh: 20, gust_p90_kmh: null,
    rain_days_30: 3, heavy_rain_days_30: 0,
    instability_index: 0.2, predictability_score: 0.85,
  },
  weather_today: {
    wind_now_kmh: 5, gust_now_kmh: null,
    rain_prob_today_pct: 10, rain_mmph_forecast: 0,
    thunder_risk: 0, forecast_confidence: 80,
  },
  building: {
    site_altitude_m: 15, building_floors: 5, building_height_m: 18,
    facade_complexity: "light", clearance_m: 3,
    near_hv_power: 0, near_base_station: 0, wind_channel_effect: 0,
    rooftop_condition: "good",
    crowd_density: "low", region_exposure: null,
  },
}

// 8. EDR > 0.8 must always force NO_GO regardless of everything else
try {
  const r = evaluateRisk(
    {
      ...benignInput,
      weather_today: { ...benignInput.weather_today, edr: 0.9 } as any,
    },
    { params: P },
  )
  add("edr_hard_stop_triggers", r.decision === "NO_GO",
      `EDR=0.9 returned decision=${r.decision}, expected NO_GO`)
} catch (e) {
  add("edr_hard_stop_triggers", false, `evaluateRisk threw: ${String(e)}`)
}

// 9. Wind ≥ 39 km/h hard stop
try {
  const r = evaluateRisk(
    {
      ...benignInput,
      weather_today: { ...benignInput.weather_today, wind_now_kmh: 40 },
    },
    { params: P },
  )
  add("wind_hard_stop_triggers", r.decision === "NO_GO",
      `wind=40 km/h returned decision=${r.decision}, expected NO_GO`)
} catch (e) {
  add("wind_hard_stop_triggers", false, `evaluateRisk threw: ${String(e)}`)
}

// 10. Rain > 10 mm/h AND prob > 60% hard stop
try {
  const r = evaluateRisk(
    {
      ...benignInput,
      weather_today: {
        ...benignInput.weather_today,
        rain_mmph_forecast: 15, rain_prob_today_pct: 85,
      },
    },
    { params: P },
  )
  add("rain_hard_stop_triggers", r.decision === "NO_GO",
      `rain=15mm/h@85% returned decision=${r.decision}, expected NO_GO`)
} catch (e) {
  add("rain_hard_stop_triggers", false, `evaluateRisk threw: ${String(e)}`)
}

// 11. risk_score monotonic in wind_now_kmh
try {
  const winds = [3, 8, 15, 22, 30]
  let last = -1
  let mono = true
  for (const w of winds) {
    const r = evaluateRisk(
      { ...benignInput, weather_today: { ...benignInput.weather_today, wind_now_kmh: w } },
      { params: P },
    )
    if (r.risk_score < last - 0.01) { mono = false; break }
    last = r.risk_score
  }
  add("risk_score_monotonic_in_wind", mono,
      "risk_score not monotonic in wind_now_kmh holding everything else fixed")
} catch (e) {
  add("risk_score_monotonic_in_wind", false, `evaluateRisk threw: ${String(e)}`)
}

// 12. b_score backward-compat alias === g_score
try {
  const r = evaluateRisk(benignInput, { params: P })
  const r2 = r as any
  add("b_score_alias_equals_g_score",
      r2.b_score === r2.g_score,
      `b_score=${r2.b_score} != g_score=${r2.g_score}`)
} catch (e) {
  add("b_score_alias_equals_g_score", false, `evaluateRisk threw: ${String(e)}`)
}

// ---------------------------------------------------------------------------
// emit
// ---------------------------------------------------------------------------

const allPassed = checks.every(c => c.passed)
const summary = { passed: allPassed, n: checks.length, results: checks }
console.log("INVARIANTS_JSON: " + JSON.stringify(summary))
process.exit(allPassed ? 0 : 2)
