#!/usr/bin/env node
// autoresearch/evaluate.mjs
// =========================
// Orchestrator. Runs four stages and aggregates a single decision JSON
// the agent reads to decide keep/revert.
//
//   0. build:        npm run build --workspaces --if-present
//                    (catches TypeScript errors immediately; required
//                    because @openlarm/* packages resolve through dist)
//   1. conformance:  npm test --workspaces --if-present
//                    (runs all 55 vitest tests including the 10 spec
//                    test vectors at packages/core/test/risk-engine.golden.test.ts)
//   2. invariants:   tsx autoresearch/invariants.mts
//   3. metric:       tsx autoresearch/calibration-runner.mts
//
// All four must succeed for the change to be kept; metric must strictly
// improve. The agent's revert logic lives in program.md, not here.
//
// Usage:
//   node autoresearch/evaluate.mjs            # human readable, focused build+test
//   node autoresearch/evaluate.mjs --json     # machine readable (for the agent)
//   node autoresearch/evaluate.mjs --no-build # skip the build step (faster reruns)
//   node autoresearch/evaluate.mjs --full     # also build+test the Next.js app
//                                             # (slower; run before merging, not every iter)
//
// Focused mode (default) builds + tests only @openlarm/core and
// @openlarm/regions-taiwan: ~9s. Full mode also builds + tests the
// Next.js frontend: ~125s. The agent should use focused mode in the
// inner loop and the human should run --full periodically.

import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { existsSync } from "node:fs"
import { performance } from "node:perf_hooks"

const __dirname = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(__dirname, "..")

const isJsonMode = process.argv.includes("--json")
const skipBuild  = process.argv.includes("--no-build")
const fullMode   = process.argv.includes("--full")

const FOCUSED_PKGS = ["--workspace=@openlarm/core", "--workspace=@openlarm/regions-taiwan"]
const ALL_PKGS     = ["--workspaces", "--if-present"]
const PKG_ARGS     = fullMode ? ALL_PKGS : FOCUSED_PKGS

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function run(cmd, args, opts = {}) {
  const t0 = performance.now()
  const r = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    env: { ...process.env, FORCE_COLOR: "0" },
    ...opts,
  })
  return {
    code: r.status,
    stdout: r.stdout ?? "",
    stderr: r.stderr ?? "",
    elapsed_sec: (performance.now() - t0) / 1000,
    error: r.error ? String(r.error) : null,
  }
}

// Resolve tsx: prefer locally installed.
const LOCAL_TSX = resolve(REPO_ROOT, "node_modules", ".bin", "tsx")
function tsx(scriptRelPath) {
  if (existsSync(LOCAL_TSX)) {
    return run(LOCAL_TSX, [scriptRelPath])
  }
  return run("npx", ["--yes", "tsx", scriptRelPath])
}

function tailLines(text, n) {
  const lines = (text || "").split("\n").filter(Boolean)
  return lines.slice(-n).join("\n")
}

function extractJsonLine(stdout, marker) {
  for (const line of stdout.split("\n")) {
    const idx = line.indexOf(marker)
    if (idx >= 0) {
      const jsonStr = line.slice(idx + marker.length).trim()
      try { return JSON.parse(jsonStr) }
      catch (e) { return { _parse_error: String(e), _raw: jsonStr.slice(0, 200) } }
    }
  }
  return null
}

function round(x) { return Math.round(x * 1000) / 1000 }

// ---------------------------------------------------------------------------
// 0. build
// ---------------------------------------------------------------------------

function runBuild() {
  if (skipBuild) return { passed: true, skipped: true, elapsed_sec: 0 }
  const r = run("npm", ["run", "build", ...PKG_ARGS, "--silent"])
  return {
    passed: r.code === 0,
    elapsed_sec: r.elapsed_sec,
    tail: r.code === 0 ? null : tailLines(r.stdout + "\n" + r.stderr, 30),
  }
}

// ---------------------------------------------------------------------------
// 1. conformance: vitest across all workspaces
// ---------------------------------------------------------------------------

function checkConformance() {
  const r = run("npm", ["test", ...PKG_ARGS, "--silent"])
  return {
    passed: r.code === 0,
    elapsed_sec: r.elapsed_sec,
    tail: r.code === 0 ? null : tailLines(r.stdout + "\n" + r.stderr, 30),
  }
}

// ---------------------------------------------------------------------------
// 2. invariants
// ---------------------------------------------------------------------------

function checkInvariants() {
  const r = tsx("autoresearch/invariants.mts")
  const parsed = extractJsonLine(r.stdout, "INVARIANTS_JSON:")
  if (!parsed) {
    return {
      passed: false,
      elapsed_sec: r.elapsed_sec,
      error: "could not parse INVARIANTS_JSON line",
      stderr_tail: tailLines(r.stderr, 20),
    }
  }
  return { ...parsed, elapsed_sec: r.elapsed_sec }
}

// ---------------------------------------------------------------------------
// 3. calibration metric
// ---------------------------------------------------------------------------

function checkCalibration() {
  const r = tsx("autoresearch/calibration-runner.mts")
  const parsed = extractJsonLine(r.stdout, "METRIC_JSON:")
  if (!parsed) {
    return {
      metric_score: -1,
      elapsed_sec: r.elapsed_sec,
      error: "could not parse METRIC_JSON line",
      stderr_tail: tailLines(r.stderr, 20),
    }
  }
  return { ...parsed, elapsed_sec: r.elapsed_sec }
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

const t0 = performance.now()

const build = runBuild()
const conformance  = build.passed ? checkConformance()  : { passed: false, skipped: true }
const invariants   = build.passed && conformance.passed ? checkInvariants()  : { passed: false, skipped: true }
const calibration  = build.passed && conformance.passed && invariants.passed === true
                       ? checkCalibration()
                       : { skipped: true, metric_score: -1 }

const totalElapsed = (performance.now() - t0) / 1000

const out = {
  build: {
    passed: build.passed,
    skipped: build.skipped === true,
    elapsed_sec: round(build.elapsed_sec ?? 0),
    tail: build.passed ? null : build.tail,
  },
  conformance: {
    passed: conformance.passed === true,
    skipped: conformance.skipped === true,
    elapsed_sec: round(conformance.elapsed_sec ?? 0),
    tail: conformance.passed ? null : conformance.tail,
  },
  invariants_passed: invariants.passed === true,
  invariants,
  metric_score: calibration.metric_score ?? -1,
  calibration,
  elapsed_sec: round(totalElapsed),
}

const allOk = out.build.passed && out.conformance.passed && out.invariants_passed

if (isJsonMode) {
  console.log(JSON.stringify(out))
  process.exit(allOk ? 0 : 2)
}

// human-readable
console.log(`build             : ${out.build.passed ? "PASS" : "FAIL"} (${out.build.elapsed_sec}s)${out.build.skipped ? " [skipped]" : ""}`)
if (!out.build.passed && out.build.tail) {
  console.log("  tail:")
  console.log(out.build.tail.split("\n").map(l => "    " + l).join("\n"))
}
console.log(`conformance       : ${out.conformance.passed ? "PASS" : "FAIL"} (${out.conformance.elapsed_sec}s)${out.conformance.skipped ? " [skipped]" : ""}`)
if (!out.conformance.passed && out.conformance.tail) {
  console.log("  tail:")
  console.log(out.conformance.tail.split("\n").map(l => "    " + l).join("\n"))
}
console.log(`invariants_passed : ${out.invariants_passed}`)
if (!out.invariants_passed && Array.isArray(invariants.results)) {
  for (const r of invariants.results) {
    if (!r.passed) console.log(`  - ${r.name}: ${r.msg}`)
  }
}
console.log(`metric_score      : ${out.metric_score}`)
if (calibration.n_cases != null) {
  console.log(`n_cases           : ${calibration.n_cases}`)
}
if (calibration.worst_miss) {
  const wm = calibration.worst_miss
  const headline = `worst_miss        : ${wm.id} (loss=${wm.loss}, pred ${wm.predicted_decision || "?"}/${wm.predicted_r_level || "?"}, exp ${wm.expected_decision || "?"}/${wm.expected_r_level || "?"})`
  console.log(headline)
  if (wm.predicted_r_score != null) {
    const parts = [`predicted r_score ${wm.predicted_r_score}`]
    if (wm.expected_r_score_range) {
      const [lo, hi] = wm.expected_r_score_range
      parts.push(`expected range [${lo}, ${hi}]`)
      if (wm.r_score_range_penalty != null && wm.r_score_range_penalty > 0) {
        parts.push(`range penalty +${(0.1 * wm.r_score_range_penalty).toFixed(3)}`)
      }
    }
    console.log(`                    ${parts.join(", ")}`)
  }
}
console.log(`elapsed_sec       : ${out.elapsed_sec}`)

process.exit(allOk ? 0 : 2)
