import { readFileSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"
import { runValidation } from "./runner.js"
import { formatReport } from "./report.js"
import type { ValidationCase } from "./types.js"

function printUsage(): void {
  process.stdout.write(`openlarm-validate — validate LARM model predictions against actual mission outcomes

Usage:
  openlarm-validate <cases.json> [options]

Arguments:
  <cases.json>             Path to a JSON array of ValidationCase objects.
                           Each case: { id, date?, input, actual_outcome }.

Options:
  --json                   Print the full ValidationReport as JSON (default: text).
  --out <file>             Write the output to <file> instead of stdout.
  --params <file>          Override params: a JSON file containing a
                           WeatherRegimeParams object. Defaults to whatever
                           region adapter is registered (e.g. Taiwan V2).
  -h, --help               Show this message.

Exit codes:
  0   Validation report produced successfully.
  1   Input file missing, malformed, or validation encountered an engine error.
  2   CLI usage error.

Example:
  openlarm-validate validation.json --json --out report.json
`)
}

async function main(argv: string[]): Promise<number> {
  if (argv.length === 0 || argv.includes("-h") || argv.includes("--help")) {
    printUsage()
    return argv.length === 0 ? 2 : 0
  }

  const args = [...argv]
  let casesPath: string | null = null
  let asJson = false
  let outPath: string | null = null
  let paramsPath: string | null = null

  while (args.length > 0) {
    const arg = args.shift() as string
    if (arg === "--json") asJson = true
    else if (arg === "--out") outPath = args.shift() ?? null
    else if (arg === "--params") paramsPath = args.shift() ?? null
    else if (arg.startsWith("-")) {
      process.stderr.write(`Unknown option: ${arg}\n`)
      printUsage()
      return 2
    } else if (!casesPath) {
      casesPath = arg
    } else {
      process.stderr.write(`Unexpected positional argument: ${arg}\n`)
      return 2
    }
  }

  if (!casesPath) {
    process.stderr.write("Missing required <cases.json> argument.\n")
    printUsage()
    return 2
  }

  let cases: ValidationCase[]
  try {
    const raw = readFileSync(resolve(casesPath), "utf8")
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) {
      process.stderr.write(
        `Expected ${casesPath} to contain a JSON array of ValidationCase objects.\n`,
      )
      return 1
    }
    cases = parsed as ValidationCase[]
  } catch (err) {
    process.stderr.write(
      `Failed to read ${casesPath}: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 1
  }

  let paramsOverride: Parameters<typeof runValidation>[1] | undefined
  if (paramsPath) {
    try {
      const raw = readFileSync(resolve(paramsPath), "utf8")
      paramsOverride = { params: JSON.parse(raw) }
    } catch (err) {
      process.stderr.write(
        `Failed to read params file ${paramsPath}: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      )
      return 1
    }
  }

  let report
  try {
    report = runValidation(cases, paramsOverride)
  } catch (err) {
    process.stderr.write(
      `Validation failed: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    return 1
  }

  const output = asJson ? JSON.stringify(report, null, 2) : formatReport(report)

  if (outPath) {
    writeFileSync(resolve(outPath), output + "\n")
    process.stderr.write(`Wrote ${outPath}\n`)
  } else {
    process.stdout.write(output + "\n")
  }

  return 0
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`Unhandled error: ${err}\n`)
    process.exit(1)
  },
)
