// autoresearch/calibration-runner.mts
// ===================================
// Runs every case in autoresearch/calibration/cases.json against
// evaluateRisk() and computes a continuous metric.
//
// DO NOT let the agent edit this file.
//
// Run via:    npx tsx autoresearch/calibration-runner.mts
// Output:     a single line "METRIC_JSON: { ... }" parsed by evaluate.mjs
//
// Metric design:
//   per-case loss in [0, ~1.6], lower is better
//     - r_level distance (normalized by 4) × 0.5
//     - decision asymmetric cost (under-call > over-call) × 1.0
//     - buffer_ratio out-of-range penalty × 0.3   (skipped if no expected range)
//   weighted mean across cases
//   metric_score = max(0, 1 - mean_weighted_loss)

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { evaluateRisk } from "@openlarm/core"
import type { WeatherRegimeParams } from "@openlarm/core"
import { TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"
import "@openlarm/regions-taiwan"  // self-register

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CASES_PATH = path.resolve(__dirname, "calibration", "cases.json")

type Decision = "GO" | "COND" | "NO_GO"
type RLevel = "R0" | "R1" | "R2" | "R3" | "R4"

// Per-case partial override of WeatherRegimeParams. Plain objects merge
// recursively; arrays and primitives replace wholesale (see deepMerge).
type DeepPartial<T> = T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T

interface CalibCase {
  id: string
  description: string
  weight?: number
  input: any                    // shape matches LARMInput
  expected: {
    decision?: Decision
    r_level?: RLevel
    buffer_ratio_range?: [number, number]
  }
  // Optional per-case partial override. Deep-merged onto TAIWAN_PARAMS_V2_0
  // before passing to evaluateRisk. Scope: this case only — global params
  // and other cases are unaffected. Lets a calibration case declare
  // "evaluate me as if a region adapter had tuned X higher" without
  // editing TAIWAN_PARAMS_V2_0 itself or any spec test vector.
  params_override?: DeepPartial<WeatherRegimeParams>
}

// Tiny recursive merge: plain objects merge key-by-key, arrays/primitives
// replace wholesale. Used to apply CalibCase.params_override onto a base.
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return Object.prototype.toString.call(v) === "[object Object]"
}
function deepMerge<T>(base: T, override: DeepPartial<T>): T {
  if (!isPlainObject(base) || !isPlainObject(override)) return override as T
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const k of Object.keys(override)) {
    const ov = (override as Record<string, unknown>)[k]
    out[k] = isPlainObject(ov)
      ? deepMerge((base as Record<string, unknown>)[k] as never, ov as never)
      : ov
  }
  return out as T
}

const R_ORDER: Record<RLevel, number> = { R0: 0, R1: 1, R2: 2, R3: 3, R4: 4 }

// Asymmetric: under-calling risk costs more than over-calling.
const DECISION_COST: Record<string, number> = {
  "GO|GO": 0.0,    "GO|COND": 0.3,    "GO|NO_GO": 1.0,
  "COND|GO": 0.1,  "COND|COND": 0.0,  "COND|NO_GO": 0.5,
  "NO_GO|GO": 0.5, "NO_GO|COND": 0.2, "NO_GO|NO_GO": 0.0,
}

// Map LARM core "Decision" type to our 3-bucket label.
function bucket(d: string): Decision {
  if (d === "GO") return "GO"
  if (d === "NO_GO") return "NO_GO"
  return "COND"  // COND_A / COND_C / COND_D1 / COND_D2 all bucket to COND
}

function caseLoss(pred: any, expected: CalibCase["expected"]) {
  let loss = 0
  const detail: Record<string, any> = {}

  if (expected.r_level) {
    const predR = pred.risk_level as RLevel
    const dist = Math.abs(R_ORDER[predR] - R_ORDER[expected.r_level]) / 4
    loss += 0.5 * dist
    detail.predicted_r_level = predR
    detail.expected_r_level = expected.r_level
    detail.r_level_distance = dist
  }

  if (expected.decision) {
    const predD = bucket(pred.decision)
    const cost = DECISION_COST[`${predD}|${expected.decision}`] ?? 1.0
    loss += 1.0 * cost
    detail.predicted_decision = predD
    detail.expected_decision = expected.decision
    detail.decision_cost = cost
  }

  if (expected.buffer_ratio_range) {
    const [lo, hi] = expected.buffer_ratio_range
    const b = pred.buffer_ratio
    let pen = 0
    if (b < lo) pen = lo - b
    else if (b > hi) pen = b - hi
    loss += 0.3 * pen
    detail.predicted_buffer_ratio = b
    detail.buffer_penalty = pen
  }

  return { loss, detail }
}

// ---------------------------------------------------------------------------

function main() {
  let cases: CalibCase[]
  try {
    cases = JSON.parse(fs.readFileSync(CASES_PATH, "utf8")).cases
  } catch (e) {
    console.log("METRIC_JSON: " + JSON.stringify({
      metric_score: -1,
      error: `failed to load cases.json: ${String(e)}`,
    }))
    process.exit(2)
  }

  if (!Array.isArray(cases) || cases.length === 0) {
    console.log("METRIC_JSON: " + JSON.stringify({
      metric_score: -1,
      error: "no cases in calibration/cases.json",
      n_cases: 0,
    }))
    process.exit(2)
  }

  let totalW = 0
  let weightedLoss = 0
  const perCase: any[] = []
  let worst: any = null

  for (const c of cases) {
    let pred
    try {
      const params = c.params_override
        ? deepMerge(TAIWAN_PARAMS_V2_0, c.params_override)
        : TAIWAN_PARAMS_V2_0
      pred = evaluateRisk(c.input, { params })
    } catch (e) {
      const row = {
        id: c.id,
        loss: 1.6,
        weight: c.weight ?? 1,
        error: `evaluateRisk threw: ${String(e)}`,
      }
      perCase.push(row)
      weightedLoss += (c.weight ?? 1) * 1.6
      totalW += c.weight ?? 1
      if (!worst || row.loss > worst.loss) worst = row
      continue
    }

    const { loss, detail } = caseLoss(pred, c.expected)
    const w = c.weight ?? 1
    totalW += w
    weightedLoss += w * loss

    const row = {
      id: c.id,
      loss: round(loss),
      weight: w,
      ...detail,
    }
    perCase.push(row)
    if (!worst || loss > worst.loss) worst = row
  }

  const meanLoss = totalW > 0 ? weightedLoss / totalW : 1
  const metric = Math.max(0, 1 - meanLoss)

  const out = {
    metric_score: round(metric),
    avg_weighted_loss: round(meanLoss),
    n_cases: cases.length,
    worst_miss: worst,
    per_case: perCase,
  }
  console.log("METRIC_JSON: " + JSON.stringify(out))
}

function round(x: number) { return Math.round(x * 10000) / 10000 }

main()
