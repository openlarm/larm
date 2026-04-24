import type { LARMInput, Decision, RiskLevel, WeatherType } from "@openlarm/core"

/**
 * What actually happened on a mission — the ground truth LARM's prediction
 * is being compared against.
 */
export interface ActualOutcome {
  /** Did the mission complete as planned? */
  completed: boolean
  /** 0–100 % of planned work finished. `completed: true` implies ≥ 95 by convention. */
  completion_pct: number
  /** What the operator actually did at go-time. */
  decision_taken: Decision
  /** Did anything unsafe happen? (crash, emergency land, airspace intrusion, injury, etc.) */
  incident: boolean
  /** Optional free-form notes from the operator or reviewer. */
  notes?: string
}

/**
 * One historical mission record: the input as LARM would have received it,
 * plus the actual outcome.
 */
export interface ValidationCase {
  id: string
  /** ISO date, for date-range reporting. */
  date?: string
  input: LARMInput
  actual_outcome: ActualOutcome
}

/** Decision-level confusion cell. */
export interface DecisionConfusion {
  predicted: Decision
  actual_decision: Decision
  count: number
  completed_count: number
  aborted_count: number
  incident_count: number
}

/** Per-R-level calibration bucket. */
export interface RLevelCalibration {
  r_level: RiskLevel
  count: number
  predicted_completion_pct_mean: number
  actual_completion_pct_mean: number
  delta_pct: number // predicted − actual; positive = over-optimistic
  completed_rate: number // proportion completed:true
}

/** Per-W-code slice. */
export interface WCodeSlice {
  w_code: WeatherType
  count: number
  correct_decisions: number
  accuracy: number
  completed_rate: number
}

/** Hard-stop trigger tally. */
export interface HardStopTally {
  /** Count of cases where LARM forced NO_GO for this reason. */
  wind: number
  rain: number
  edr: number
  r4_threshold: number
  /** Cases that hit any hard stop. */
  total: number
}

export interface ValidationReport {
  meta: {
    total_cases: number
    date_range: { start: string | null; end: string | null }
    params_version: string
    larm_version: string
    generated_at: string
  }

  /**
   * High-level decision accuracy — proportion of cases where LARM's decision
   * matches what actually happened (GO+completed, CONDITIONAL+completed,
   * NO_GO+aborted/incident all count as "LARM was right"; other combinations
   * are errors).
   */
  overall_accuracy: number

  /** 3×3 confusion matrix (LARM-predicted × operator's-actual decision). */
  decision_confusion: DecisionConfusion[]

  /** Calibration by R-level. Empty R-levels are omitted. */
  calibration: RLevelCalibration[]

  /** Per-W-code accuracy slice. Empty W-codes are omitted. */
  w_code_slices: WCodeSlice[]

  /** Hard-stop trigger counts. */
  hard_stops: HardStopTally

  /**
   * Cases where LARM said GO but the mission aborted or had an incident.
   * These are the most safety-critical errors to inspect.
   */
  go_then_bad: Array<{
    case_id: string
    r_score: number
    r_level: RiskLevel
    completion_pct: number
    incident: boolean
  }>

  /**
   * Cases where LARM said NO_GO but the mission (if flown anyway) completed
   * cleanly. These are over-conservative calls.
   */
  nogo_then_ok: Array<{
    case_id: string
    r_score: number
    r_level: RiskLevel
    completion_pct: number
  }>
}

export interface RunValidationOptions {
  /** Override the parameters used for each `evaluateRisk` call. */
  params?: Parameters<typeof import("@openlarm/core").evaluateRisk>[1]
}
