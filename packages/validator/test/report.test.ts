import { describe, it, expect } from "vitest"
import { formatReport } from "../src/report.ts"
import type { ValidationReport } from "../src/types.ts"

function makeReport(partial: Partial<ValidationReport> = {}): ValidationReport {
  return {
    meta: {
      total_cases: 0,
      date_range: { start: null, end: null },
      params_version: "v2.0",
      larm_version: "v2.0",
      generated_at: "2026-04-24T00:00:00.000Z",
    },
    overall_accuracy: 0,
    decision_confusion: [],
    calibration: [],
    w_code_slices: [],
    hard_stops: { wind: 0, rain: 0, edr: 0, r4_threshold: 0, total: 0 },
    go_then_bad: [],
    nogo_then_ok: [],
    ...partial,
  }
}

describe("formatReport", () => {
  it("renders an empty report with all sections present", () => {
    const text = formatReport(makeReport())
    expect(text).toContain("LARM validation report")
    expect(text).toContain("Total cases       : 0")
    expect(text).toContain("Overall accuracy  : 0.00%")
    expect(text).toContain("Decision confusion")
    expect(text).toContain("Hard stops triggered")
    expect(text).toContain("Cases where LARM said GO but mission failed: 0  ✓")
  })

  it("renders a non-empty confusion matrix", () => {
    const text = formatReport(
      makeReport({
        decision_confusion: [
          {
            predicted: "GO",
            actual_decision: "GO",
            count: 5,
            completed_count: 5,
            aborted_count: 0,
            incident_count: 0,
          },
          {
            predicted: "NO_GO",
            actual_decision: "NO_GO",
            count: 2,
            completed_count: 0,
            aborted_count: 2,
            incident_count: 0,
          },
        ],
      }),
    )
    expect(text).toContain("GO")
    expect(text).toContain("NO_GO")
    expect(text).toMatch(/GO\s+GO\s+5\s+5\s+0\s+0/)
  })

  it("renders calibration rows with sign on delta", () => {
    const text = formatReport(
      makeReport({
        calibration: [
          {
            r_level: "R0",
            count: 10,
            predicted_completion_pct_mean: 97,
            actual_completion_pct_mean: 95,
            delta_pct: 2,
            completed_rate: 0.95,
          },
          {
            r_level: "R2",
            count: 4,
            predicted_completion_pct_mean: 60,
            actual_completion_pct_mean: 70,
            delta_pct: -10,
            completed_rate: 0.7,
          },
        ],
      }),
    )
    expect(text).toContain("+2%")
    expect(text).toContain("-10%")
    expect(text).toContain("95.00%")
  })

  it("renders go-then-bad case ids", () => {
    const text = formatReport(
      makeReport({
        go_then_bad: [
          {
            case_id: "m-2025-04-01",
            r_score: 22,
            r_level: "R1",
            completion_pct: 40,
            incident: true,
          },
        ],
      }),
    )
    expect(text).toContain("m-2025-04-01")
    expect(text).toContain("YES") // incident column
  })
})
