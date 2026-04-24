import { evaluateRisk } from "@openlarm/core"
import type {
  ActualOutcome,
  DecisionConfusion,
  HardStopTally,
  RLevelCalibration,
  RunValidationOptions,
  ValidationCase,
  ValidationReport,
  WCodeSlice,
} from "./types.js"
import type { Decision, RiskLevel, WeatherType } from "@openlarm/core"

const DECISIONS: Decision[] = ["GO", "CONDITIONAL", "NO_GO"]
const R_LEVELS: RiskLevel[] = ["R0", "R1", "R2", "R3", "R4"]
const W_CODES: WeatherType[] = ["W0", "W1", "W2", "W3", "W4", "W5"]

/** Completion-probability anchors from spec/LARM-v2.0.md §9. */
const COMPLETION_ANCHOR: Record<RiskLevel, number> = {
  R0: 97,
  R1: 82,
  R2: 60,
  R3: 35,
  R4: 10,
}

/**
 * Is LARM's predicted decision consistent with what actually happened?
 *
 *  LARM GO        + completed          → correct
 *  LARM GO        + aborted/incident   → FALSE POSITIVE (dangerous)
 *  LARM CONDITIONAL + completed        → correct (operator proceeded under conditions)
 *  LARM CONDITIONAL + aborted          → correct (conditions were insufficient)
 *  LARM NO_GO     + aborted/incident   → correct (cautious call validated)
 *  LARM NO_GO     + completed          → FALSE NEGATIVE (over-conservative)
 */
function isDecisionCorrect(predicted: Decision, actual: ActualOutcome): boolean {
  if (predicted === "NO_GO") {
    return !actual.completed || actual.incident
  }
  if (predicted === "CONDITIONAL") {
    // Either outcome is "consistent" with a conditional tier — the tier itself
    // acknowledges uncertainty. Over-conservative or over-permissive would
    // appear in the confusion matrix, but we don't mark it wrong here.
    return true
  }
  // GO
  return actual.completed && !actual.incident
}

/**
 * Classify which hard stop (if any) fired. Returns null if the NO_GO came
 * from the non-hard-stop path (WR matrix, R-level cap, etc.).
 */
function classifyHardStop(
  controls: readonly string[],
): "wind" | "rain" | "edr" | "r4_threshold" | null {
  const joined = controls.join(" | ")
  if (joined.includes("禁止起飛") && joined.includes("風速")) return "wind"
  if (joined.includes("降雨概率")) return "rain"
  if (joined.includes("EDR")) return "edr"
  if (joined.includes("任務不可排程")) return "r4_threshold"
  return null
}

function dateRange(cases: ValidationCase[]): {
  start: string | null
  end: string | null
} {
  const dates = cases
    .map((c) => c.date)
    .filter((d): d is string => typeof d === "string" && d.length > 0)
    .sort()
  return {
    start: dates[0] ?? null,
    end: dates[dates.length - 1] ?? null,
  }
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

/**
 * Run LARM against every case, produce a report.
 *
 * Pure function: same input → same report (modulo `generated_at` timestamp).
 */
export function runValidation(
  cases: ValidationCase[],
  options: RunValidationOptions = {},
): ValidationReport {
  // Initialise decision confusion cells (3 × 3)
  const confusion = new Map<string, DecisionConfusion>()
  for (const p of DECISIONS) {
    for (const a of DECISIONS) {
      confusion.set(`${p}|${a}`, {
        predicted: p,
        actual_decision: a,
        count: 0,
        completed_count: 0,
        aborted_count: 0,
        incident_count: 0,
      })
    }
  }

  const byRLevel: Record<
    RiskLevel,
    { completion_pcts_predicted: number[]; completion_pcts_actual: number[]; completed: number }
  > = {
    R0: { completion_pcts_predicted: [], completion_pcts_actual: [], completed: 0 },
    R1: { completion_pcts_predicted: [], completion_pcts_actual: [], completed: 0 },
    R2: { completion_pcts_predicted: [], completion_pcts_actual: [], completed: 0 },
    R3: { completion_pcts_predicted: [], completion_pcts_actual: [], completed: 0 },
    R4: { completion_pcts_predicted: [], completion_pcts_actual: [], completed: 0 },
  }

  const byWCode: Record<WeatherType, { count: number; correct: number; completed: number }> = {
    W0: { count: 0, correct: 0, completed: 0 },
    W1: { count: 0, correct: 0, completed: 0 },
    W2: { count: 0, correct: 0, completed: 0 },
    W3: { count: 0, correct: 0, completed: 0 },
    W4: { count: 0, correct: 0, completed: 0 },
    W5: { count: 0, correct: 0, completed: 0 },
  }

  const hardStops: HardStopTally = {
    wind: 0,
    rain: 0,
    edr: 0,
    r4_threshold: 0,
    total: 0,
  }

  const goThenBad: ValidationReport["go_then_bad"] = []
  const nogoThenOk: ValidationReport["nogo_then_ok"] = []

  let correctCount = 0
  let paramsVersion = ""
  let larmVersion = ""

  for (const c of cases) {
    const r = evaluateRisk(c.input, options.params)
    paramsVersion = paramsVersion || r.versions.weather_regime_params_version
    larmVersion = larmVersion || r.versions.larm_version

    // Decision confusion
    const key = `${r.decision}|${c.actual_outcome.decision_taken}`
    const cell = confusion.get(key)
    if (cell) {
      cell.count++
      if (c.actual_outcome.completed) cell.completed_count++
      else cell.aborted_count++
      if (c.actual_outcome.incident) cell.incident_count++
    }

    // Overall accuracy
    if (isDecisionCorrect(r.decision, c.actual_outcome)) correctCount++

    // R-level calibration
    const rBucket = byRLevel[r.risk_level]
    rBucket.completion_pcts_predicted.push(COMPLETION_ANCHOR[r.risk_level])
    rBucket.completion_pcts_actual.push(c.actual_outcome.completion_pct)
    if (c.actual_outcome.completed) rBucket.completed++

    // W-code slice
    const wBucket = byWCode[r.w_code]
    wBucket.count++
    if (isDecisionCorrect(r.decision, c.actual_outcome)) wBucket.correct++
    if (c.actual_outcome.completed) wBucket.completed++

    // Hard-stop tally
    if (r.decision === "NO_GO") {
      const hs = classifyHardStop(r.controls)
      if (hs) {
        hardStops[hs]++
        hardStops.total++
      }
    }

    // Safety-critical case buckets
    if (r.decision === "GO" && (!c.actual_outcome.completed || c.actual_outcome.incident)) {
      goThenBad.push({
        case_id: c.id,
        r_score: r.risk_score,
        r_level: r.risk_level,
        completion_pct: c.actual_outcome.completion_pct,
        incident: c.actual_outcome.incident,
      })
    }
    if (r.decision === "NO_GO" && c.actual_outcome.completed && !c.actual_outcome.incident) {
      nogoThenOk.push({
        case_id: c.id,
        r_score: r.risk_score,
        r_level: r.risk_level,
        completion_pct: c.actual_outcome.completion_pct,
      })
    }
  }

  const calibration: RLevelCalibration[] = R_LEVELS.flatMap((rl) => {
    const b = byRLevel[rl]
    if (b.completion_pcts_predicted.length === 0) return []
    const predMean = mean(b.completion_pcts_predicted)
    const actMean = mean(b.completion_pcts_actual)
    return [
      {
        r_level: rl,
        count: b.completion_pcts_predicted.length,
        predicted_completion_pct_mean: Math.round(predMean * 100) / 100,
        actual_completion_pct_mean: Math.round(actMean * 100) / 100,
        delta_pct: Math.round((predMean - actMean) * 100) / 100,
        completed_rate:
          Math.round((b.completed / b.completion_pcts_predicted.length) * 10000) / 10000,
      },
    ]
  })

  const wSlices: WCodeSlice[] = W_CODES.flatMap((w) => {
    const b = byWCode[w]
    if (b.count === 0) return []
    return [
      {
        w_code: w,
        count: b.count,
        correct_decisions: b.correct,
        accuracy: Math.round((b.correct / b.count) * 10000) / 10000,
        completed_rate: Math.round((b.completed / b.count) * 10000) / 10000,
      },
    ]
  })

  return {
    meta: {
      total_cases: cases.length,
      date_range: dateRange(cases),
      params_version: paramsVersion,
      larm_version: larmVersion,
      generated_at: new Date().toISOString(),
    },
    overall_accuracy:
      cases.length === 0 ? 0 : Math.round((correctCount / cases.length) * 10000) / 10000,
    decision_confusion: Array.from(confusion.values()).filter((c) => c.count > 0),
    calibration,
    w_code_slices: wSlices,
    hard_stops: hardStops,
    go_then_bad: goThenBad,
    nogo_then_ok: nogoThenOk,
  }
}
