import type { ValidationReport } from "./types.js"

function pct(v: number): string {
  return `${(v * 100).toFixed(2)}%`
}

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + " ".repeat(n - s.length)
}

/**
 * Render a ValidationReport as a human-readable text block.
 */
export function formatReport(report: ValidationReport): string {
  const lines: string[] = []

  lines.push("LARM validation report")
  lines.push("=".repeat(60))
  lines.push("")
  lines.push(`Total cases       : ${report.meta.total_cases}`)
  if (report.meta.date_range.start && report.meta.date_range.end) {
    lines.push(
      `Date range        : ${report.meta.date_range.start} … ${report.meta.date_range.end}`,
    )
  }
  lines.push(
    `LARM version      : ${report.meta.larm_version} (params: ${report.meta.params_version})`,
  )
  lines.push(`Generated at      : ${report.meta.generated_at}`)
  lines.push("")

  lines.push(`Overall accuracy  : ${pct(report.overall_accuracy)}`)
  lines.push("")

  // Decision confusion matrix
  lines.push("Decision confusion (LARM predicted × operator actual)")
  lines.push("-".repeat(60))
  lines.push(
    "  " +
      pad("predicted", 14) +
      pad("actual", 14) +
      pad("count", 8) +
      pad("completed", 11) +
      pad("aborted", 9) +
      "incidents",
  )
  for (const c of report.decision_confusion) {
    lines.push(
      "  " +
        pad(c.predicted, 14) +
        pad(c.actual_decision, 14) +
        pad(String(c.count), 8) +
        pad(String(c.completed_count), 11) +
        pad(String(c.aborted_count), 9) +
        String(c.incident_count),
    )
  }
  lines.push("")

  // R-level calibration
  if (report.calibration.length > 0) {
    lines.push("R-level calibration (predicted vs actual completion %)")
    lines.push("-".repeat(60))
    lines.push(
      "  " +
        pad("R-level", 10) +
        pad("N", 6) +
        pad("predicted", 11) +
        pad("actual", 11) +
        pad("Δ (over-)", 11) +
        "completed%",
    )
    for (const c of report.calibration) {
      const deltaSign = c.delta_pct > 0 ? "+" : ""
      lines.push(
        "  " +
          pad(c.r_level, 10) +
          pad(String(c.count), 6) +
          pad(`${c.predicted_completion_pct_mean}%`, 11) +
          pad(`${c.actual_completion_pct_mean}%`, 11) +
          pad(`${deltaSign}${c.delta_pct}%`, 11) +
          pct(c.completed_rate),
      )
    }
    lines.push("")
  }

  // W-code slices
  if (report.w_code_slices.length > 0) {
    lines.push("W-code slices")
    lines.push("-".repeat(60))
    lines.push(
      "  " +
        pad("W-code", 10) +
        pad("N", 6) +
        pad("accuracy", 12) +
        "completed%",
    )
    for (const w of report.w_code_slices) {
      lines.push(
        "  " +
          pad(w.w_code, 10) +
          pad(String(w.count), 6) +
          pad(pct(w.accuracy), 12) +
          pct(w.completed_rate),
      )
    }
    lines.push("")
  }

  // Hard stops
  lines.push("Hard stops triggered")
  lines.push("-".repeat(60))
  lines.push(`  wind ≥ 39 km/h              : ${report.hard_stops.wind}`)
  lines.push(`  rain-rate × probability     : ${report.hard_stops.rain}`)
  lines.push(`  EDR > 0.8 (turbulence)      : ${report.hard_stops.edr}`)
  lines.push(`  R_score > r4_nogo_threshold : ${report.hard_stops.r4_threshold}`)
  lines.push(`  total hard-stop NO_GO       : ${report.hard_stops.total}`)
  lines.push("")

  // Safety-critical error buckets
  if (report.go_then_bad.length > 0) {
    lines.push(
      `Cases where LARM said GO but mission aborted or had incident (${report.go_then_bad.length})`,
    )
    lines.push("-".repeat(60))
    lines.push(
      "  " +
        pad("case id", 24) +
        pad("R-score", 10) +
        pad("R-level", 10) +
        pad("completed%", 12) +
        "incident",
    )
    for (const c of report.go_then_bad) {
      lines.push(
        "  " +
          pad(c.case_id, 24) +
          pad(String(c.r_score), 10) +
          pad(c.r_level, 10) +
          pad(`${c.completion_pct}%`, 12) +
          (c.incident ? "YES" : "no"),
      )
    }
    lines.push("")
  } else {
    lines.push("Cases where LARM said GO but mission failed: 0  ✓")
    lines.push("")
  }

  if (report.nogo_then_ok.length > 0) {
    lines.push(
      `Cases where LARM said NO_GO but mission completed cleanly (${report.nogo_then_ok.length})`,
    )
    lines.push("-".repeat(60))
    lines.push(
      "  " +
        pad("case id", 24) +
        pad("R-score", 10) +
        pad("R-level", 10) +
        "completed%",
    )
    for (const c of report.nogo_then_ok) {
      lines.push(
        "  " +
          pad(c.case_id, 24) +
          pad(String(c.r_score), 10) +
          pad(c.r_level, 10) +
          `${c.completion_pct}%`,
      )
    }
    lines.push("")
  }

  return lines.join("\n")
}
