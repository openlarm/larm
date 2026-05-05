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

// 3b. ROUND-2 LOCK: R-level boundaries must stay at canonical spec values.
//     Round 1 agent found that shifting boundaries (e.g. 21→30) was the
//     cheapest way to move metric, at the cost of breaking spec §6.1 and
//     making historical R-level reports inconsistent. Lock them.
//     Spec canonical: R0=0–20, R1=21–40, R2=41–65, R3=66–85, R4=86–100.
{
  const m = P.thresholds.mapping_r_level
  const canonical = [
    { r_level: "R0", min: 0,  max: 20  },
    { r_level: "R1", min: 21, max: 40  },
    { r_level: "R2", min: 41, max: 65  },
    { r_level: "R3", min: 66, max: 85  },
    { r_level: "R4", min: 86, max: 100 },
  ]
  let canonicalOk = m.length === canonical.length
  if (canonicalOk) {
    for (let i = 0; i < canonical.length; i++) {
      if (m[i].r_level !== canonical[i].r_level
       || m[i].min     !== canonical[i].min
       || m[i].max     !== canonical[i].max) { canonicalOk = false; break }
    }
  }
  add("mapping_r_level_canonical_spec_boundaries",
      canonicalOk,
      `R-level boundaries must stay at canonical spec §6.1 values ` +
      `(R0:0–20, R1:21–40, R2:41–65, R3:66–85, R4:86–100); got ${JSON.stringify(m)}`)
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

// 5b. ROUND-2 LOCK: W0 (穩定高壓晴朗型) low-risk cells must not be "nogo".
//     Round 1 agent flipped W0/R2 to nogo to chase metric, which contradicts
//     LARM's design philosophy: stable high-pressure clear weather is the
//     SAFEST regime. If R2 risk under W0 means nogo, the W/R matrix itself
//     has lost meaning. W0/R0, W0/R1, W0/R2 must remain non-nogo.
{
  const w0 = P.wr_matrix.W0 ?? {}
  const w0_r0_ok = w0.R0 !== "nogo"
  const w0_r1_ok = w0.R1 !== "nogo"
  const w0_r2_ok = w0.R2 !== "nogo"
  add("wr_matrix_w0_low_risk_not_nogo",
      w0_r0_ok && w0_r1_ok && w0_r2_ok,
      `W0 (stable clear) R0/R1/R2 must not be "nogo": got ` +
      `R0=${w0.R0}, R1=${w0.R1}, R2=${w0.R2}`)
}

// 5c. ROUND-2 LOCK: WR matrix structural shape.
//     The W-regime rows are NOT simply monotonic in R-level — by design,
//     under bad regimes (W2–W5) the R0 cell can be "nogo" because a very
//     low score under bad weather is suspicious (likely missing data),
//     while R2 reverts to "cond" once enough risk shows up to validate.
//     What we DO require:
//       (a) R4 column is always "nogo" (top risk under any regime)
//       (b) W0.R4 is "nogo" (sanity: even calmest regime nogos at R4)
//       (c) for each row, "go" decisions can only appear at R0 or R1,
//           never at R2/R3/R4 (those must be cond or nogo)
{
  const rows = Object.entries(P.wr_matrix)
  let r4_all_nogo = rows.every(([_, row]: any) => row.R4 === "nogo")
  let no_go_above_r1 = rows.every(([_, row]: any) =>
    row.R2 !== "go" && row.R3 !== "go" && row.R4 !== "go")
  add("wr_matrix_r4_always_nogo", r4_all_nogo,
      `R4 column must be nogo for every regime`)
  add("wr_matrix_no_go_above_r1", no_go_above_r1,
      `decision "go" must not appear at R2/R3/R4 in any regime`)
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

// 7d. v2.1 (RFC Recommendation A): env-hazards params sanity.
//     New fields env_hazards_cap and env_hazard_points were added to
//     g_score_config so region calibration can flex them. Prevent the
//     agent from setting nonsense values.
{
  const cfg = P.g_score_config
  add("g_score_env_interaction_cap_in_band",
      cfg.env_hazards_cap >= 1 && cfg.env_hazards_cap <= 8,
      `env_hazards_cap=${cfg.env_hazards_cap} outside [1, 8]`)
  const pts = cfg.env_hazard_points
  add("g_score_env_hazard_points_non_negative",
      pts.near_hv_power >= 0 && pts.near_base_station >= 0 && pts.narrow_clearance >= 0,
      `env_hazard_points has negative: hv=${pts.near_hv_power} base=${pts.near_base_station} narrow=${pts.narrow_clearance}`)
  // No single hazard point may exceed the inner cap; otherwise a single
  // flag trivially saturates. Baseline (3,1,2) ≤ cap=3 ✓.
  add("g_score_env_hazard_points_le_cap",
      pts.near_hv_power <= cfg.env_hazards_cap
      && pts.near_base_station <= cfg.env_hazards_cap
      && pts.narrow_clearance <= cfg.env_hazards_cap,
      `each env_hazard_point must be ≤ env_hazards_cap=${cfg.env_hazards_cap}: ` +
      `hv=${pts.near_hv_power} base=${pts.near_base_station} narrow=${pts.narrow_clearance}`)
}

// 7e. v2.1 (RFC Recommendation A applied to o_score): o_score flag points
//     param-ization. Prevent the agent from setting nonsense values once
//     the new o_score_flag_points field exists in WeatherRegimeParams.
{
  const fp = P.o_score_flag_points
  const allPts = [
    fp.night, fp.weekend, fp.road_closure,
    fp.urgent_critical, fp.urgent_warn,
    fp.crowd_high, fp.crowd_medium,
    fp.operator_junior, fp.operator_mid, fp.operator_senior,
    fp.long_mission_critical, fp.long_mission_warn,
  ]
  add("o_score_flag_points_non_negative",
      allPts.every(v => v >= 0),
      `o_score_flag_points has negative entry: ${JSON.stringify(fp)}`)

  // Threshold ordering: urgent_critical_max_days ≤ urgent_warn_max_days
  // so the critical band is a subset of the warn band; symmetrically for
  // long_mission thresholds (warn must trigger BEFORE critical).
  add("o_score_thresholds_ordered",
      fp.urgent_critical_max_days <= fp.urgent_warn_max_days
      && fp.long_mission_warn_min_days <= fp.long_mission_critical_min_days,
      `o_score thresholds out of order: urgent_critical_max=${fp.urgent_critical_max_days} ` +
      `> urgent_warn_max=${fp.urgent_warn_max_days}, OR long_mission_warn_min=${fp.long_mission_warn_min_days} ` +
      `> long_mission_critical_min=${fp.long_mission_critical_min_days}`)

  // No single flag may exceed o_score_cap; otherwise one flag trivially
  // saturates the cap and the rest become dead. Baseline max single
  // contribution is 5 (night, urgent_critical) ≤ cap=12 ✓.
  add("o_score_individual_flag_le_cap",
      allPts.every(v => v <= P.o_score_cap),
      `each o_score_flag_points value must be ≤ o_score_cap=${P.o_score_cap}: ${JSON.stringify(fp)}`)
}

// 7b. ROUND-2 LOCK: regime base_score ordering. The W-regimes are
//     ordered by background risk: W0 (clear) lowest, W5 (typhoon)
//     highest. base_score must respect that ordering — agent should
//     not be able to e.g. set W0.base_score > W4.base_score to
//     redirect cases through the W matrix.
{
  const r = P.regimes
  const ordered = r.W0.base_score <= r.W1.base_score
                  && r.W0.base_score <= r.W2.base_score
                  && r.W0.base_score <= r.W3.base_score
                  && r.W0.base_score <= r.W4.base_score
                  && r.W0.base_score <= r.W5.base_score
                  && r.W5.base_score >= Math.max(r.W1.base_score, r.W2.base_score, r.W3.base_score, r.W4.base_score)
  add("regime_base_score_ordering",
      ordered,
      `W0 must have lowest, W5 highest base_score: ` +
      `W0=${r.W0.base_score} W1=${r.W1.base_score} W2=${r.W2.base_score} ` +
      `W3=${r.W3.base_score} W4=${r.W4.base_score} W5=${r.W5.base_score}`)
}

// 7c. ROUND-2 LOCK: rain hard-stop conjunction must keep its design.
//     mmph threshold and prob threshold must both be defensible:
//     8 ≤ mmph ≤ 12, 50 ≤ prob ≤ 70. Agent attempted to widen this
//     in round 1 to push thunder cases to NO_GO via rain alone.
//     Already partially covered by check 4 above; this is the AND-shape lock.
{
  const hs = P.thresholds.hard_stop
  // Rain hard-stop only triggers via the conjunction. As long as both
  // thresholds are within their bands, the AND shape is preserved.
  // (Engine-level enforcement of "AND" is in risk-engine.ts and out of
  // params scope; we just confirm thresholds remain meaningful.)
  add("rain_hard_stop_thresholds_meaningful",
      hs.rain_mmph >= 8 && hs.rain_prob_pct >= 50,
      `rain hard-stop too lenient: mmph=${hs.rain_mmph}, prob=${hs.rain_prob_pct}`)
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
