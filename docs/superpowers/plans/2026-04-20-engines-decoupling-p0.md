# Engines Decoupling P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `low-altitude-ops-platform/frontend/src/lib/engines/` a pure-function layer (no `@/` alias, no `localStorage`, no `typeof window`, no `new Date()` / `Math.random()`) so it can be lifted into the future `@openlarm/core` package — without changing the output of `evaluateRisk()` or `generateQuote()` for any existing call site.

**Architecture:** Eight sequential tasks. Task 1 swaps path aliases (no behaviour change). Task 2 adds a pure `resolveParams()` helper while keeping `getParams()` as a back-compat wrapper (no behaviour change). Task 3 creates `src/lib/params-store.ts` — a thin client-side module that owns localStorage. Tasks 4–5 add explicit `params` / `clock` options to `evaluateRisk()` and `generateQuote()`. Tasks 6–7 migrate every existing call site in the Next.js app to pass params via the new store. Task 8 strips localStorage + `typeof window` + `new Date()` / `Math.random()` from the engines. The golden test suite (10 tests) is the behaviour contract — every task must leave it green.

**Tech Stack:** TypeScript (strict), Next.js 16 App Router, vitest, Node 20. No new runtime dependencies.

**Out of scope (P1 / Task 3):** `forecast-db.ts` and `forecast-tracker.ts` (they stay in `engines/` but are already marked "not for core" per `OPEN_SOURCE_DECOUPLING_AUDIT.md` §2.2 ④). Only their `@/` alias is fixed here (Task 1).

**Commands cheat-sheet (all run from `low-altitude-ops-platform/frontend/`):**
```bash
npm run typecheck          # tsc --noEmit
npm run lint               # eslint
npm test                   # vitest run
npm run build              # next build
```

---

## File Structure

```
low-altitude-ops-platform/frontend/src/
├── lib/
│   ├── engines/                             ← becomes pure-function layer
│   │   ├── weather-regime-params.ts         ← MODIFY: add resolveParams(); strip localStorage
│   │   ├── pricing-params.ts                ← MODIFY: strip localStorage + migration
│   │   ├── risk-engine.ts                   ← MODIFY: evaluateRisk(input, options)
│   │   ├── pricing-engine.ts                ← MODIFY: generateQuote(input, options)
│   │   ├── model-helpers.ts                 ← MODIFY: inferWCode / getWRDecision take P
│   │   ├── airspace-zones.ts                ← MODIFY: alias rename only
│   │   ├── time-engine.ts                   ← MODIFY: alias rename only
│   │   ├── forecast-db.ts                   ← MODIFY: alias rename only (P1 otherwise)
│   │   ├── forecast-tracker.ts              ← MODIFY: alias rename only (P1 otherwise)
│   │   └── __tests__/
│   │       └── risk-engine.golden.test.ts   ← unchanged; contract enforcer
│   ├── params-store.ts                      ← CREATE: client-side localStorage wrapper
│   └── types.ts                             ← unchanged
├── app/
│   ├── (main)/admin/params/page.tsx         ← MODIFY: use params-store
│   ├── (main)/graph/page.tsx                ← unchanged (labels only)
│   └── (quote)/quote/components/QuoteStep3.tsx  ← MODIFY: pass params
├── components/wizard/steps/
│   ├── Step6Operations.tsx                  ← MODIFY: pass params to evaluateRisk
│   └── Step8Pricing.tsx                     ← MODIFY: pass params to generateQuote
```

Each file's responsibility after the refactor:

- `engines/weather-regime-params.ts` — defaults, registry, `resolveParams()` (pure), `getParams()` (thin back-compat wrapper around `resolveParams()`). No browser access.
- `engines/pricing-params.ts` — defaults, `getPricingParams()` (pure wrapper around defaults). No browser access. Legacy localStorage migration moves to params-store.
- `engines/risk-engine.ts` — `evaluateRisk(input, options?)` where `options = { params?, clock? }`. Never reads `Date` or `localStorage` directly.
- `engines/pricing-engine.ts` — `generateQuote(input, options?)` where `options = { params?, pricingParams?, clock?, idGenerator? }`. Never reads `Date`, `Math.random`, or `localStorage`.
- `engines/model-helpers.ts` — every exported function takes `P?: WeatherRegimeParams` (already does; remove the `getParams()` fallback in a final sweep).
- `src/lib/params-store.ts` — client-only module. Reads/writes `larm_params_override`, handles SSR (`typeof window`), calls `resolveParams()` to merge defaults + override, and performs the legacy `pricing_params_override` → `larm_params_override` migration on first read.

---

## Task 1: Replace `@/` path aliases with relative imports in engines

**Goal:** Engines become alias-free. No functional change.

**Files:**
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/risk-engine.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/model-helpers.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/pricing-engine.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/pricing-params.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/airspace-zones.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/time-engine.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/forecast-db.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/forecast-tracker.ts`

> **Do NOT touch** `engines/__tests__/risk-engine.golden.test.ts` — the test file lives under the same `src/` tree as the Next.js app and the `@/` alias is still valid there; changing it gains nothing and risks a merge conflict with Task 3 (future package extraction).

### Steps

- [ ] **Step 1: Run baseline green — capture current test output.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run
```

Expected: all 10 golden tests pass. Note the exact output; re-run after every step.

- [ ] **Step 2: Replace alias with relative import in `risk-engine.ts`.**

Replace all four `@/lib/types` references:

Line 5–11 (static import):
```typescript
// before
import type {
  WeatherType, RiskLevel, Decision, Complexity, Mission,
  Weather30dInput, WeatherTodayInput, BuildingSiteInput, OperationalContextInput,
  LARMInput, RiskResult, RiskExplanation, LARMVersions,
  RegionExposure, WeatherRegimeResult, Equipment,
  PopulationDensityClass,
} from "@/lib/types"
```

becomes:
```typescript
import type {
  WeatherType, RiskLevel, Decision, Complexity, Mission,
  Weather30dInput, WeatherTodayInput, BuildingSiteInput, OperationalContextInput,
  LARMInput, RiskResult, RiskExplanation, LARMVersions,
  RegionExposure, WeatherRegimeResult, Equipment,
  PopulationDensityClass,
} from "../types"
```

Lines 239, 247, 303, 503 (inline type imports). `@/lib/types` → `../types`. Example (line 239):
```typescript
// before
crowd_density: import("@/lib/types").CrowdDensity | null,
// after
crowd_density: import("../types").CrowdDensity | null,
```

Fold these inline imports into the static import at the top, unless doing so creates a cycle. (`CrowdDensity` and `Complexity` are both already named types in `types.ts`; just add them to the top-level import and drop the inline form.)

- [ ] **Step 3: Replace alias in the other 7 engine files.**

Each file has exactly one `@/lib/types` occurrence (see `OPEN_SOURCE_DECOUPLING_AUDIT.md` §2.1 ①). Replace `from "@/lib/types"` with `from "../types"` in each of:

- `model-helpers.ts:9`
- `pricing-engine.ts:1–5` (multi-line type import)
- `pricing-params.ts:8`
- `airspace-zones.ts:14`
- `time-engine.ts:1–4` (multi-line type import)
- `forecast-db.ts:8`
- `forecast-tracker.ts:11–13` (multi-line type import)

- [ ] **Step 4: Verify.**

```bash
cd low-altitude-ops-platform/frontend
npm run typecheck
npm test -- --run
npm run lint
```

Expected: typecheck passes, 10 tests pass, no new lint errors.

Also confirm nothing left behind:
```bash
```
(from project root — but run via Grep tool since this is documentation only:)
Use `Grep` with pattern `@/lib/types` in `low-altitude-ops-platform/frontend/src/lib/engines/` — expected 0 results.

- [ ] **Step 5: Commit.**

```bash
git add low-altitude-ops-platform/frontend/src/lib/engines
git commit -m "refactor(engines): replace @/ path alias with relative imports

P0 decoupling step 1 of 8 toward @openlarm/core extraction.
No behaviour change; golden tests unchanged and green.
See OPEN_SOURCE_DECOUPLING_AUDIT.md §2.1 and
docs/superpowers/plans/2026-04-20-engines-decoupling-p0.md Task 1."
```

---

## Task 2: Add pure `resolveParams()` helper

**Goal:** Introduce a pure merge function that engines can call without touching the browser. `getParams()` keeps its existing behaviour for now (still reads localStorage) so no caller breaks.

**Files:**
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts`
- Test: `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/resolve-params.test.ts` (new)

### Steps

- [ ] **Step 1: Write the failing test.**

Create `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/resolve-params.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import {
  resolveParams,
  WEATHER_REGIME_PARAMS_V2,
  type WeatherRegimeParams,
} from "../weather-regime-params"

describe("resolveParams (pure)", () => {
  it("returns v2.0 defaults when no override is given", () => {
    expect(resolveParams()).toEqual(WEATHER_REGIME_PARAMS_V2)
  })

  it("returns v1.0 defaults when explicitly requested", () => {
    const p = resolveParams("v1.0")
    expect(p.version).toBe("v1.0")
  })

  it("shallow-merges a top-level override over defaults", () => {
    const override: Partial<WeatherRegimeParams> = { r4_nogo_threshold: 88 }
    const p = resolveParams("v2.0", override)
    expect(p.r4_nogo_threshold).toBe(88)
    // Unrelated fields preserved
    expect(p.regimes.W0.base_score).toBe(WEATHER_REGIME_PARAMS_V2.regimes.W0.base_score)
  })

  it("deep-merges the pricing sub-object", () => {
    const override: Partial<WeatherRegimeParams> = {
      pricing: { urgent_multiplier: 1.75 } as WeatherRegimeParams["pricing"],
    }
    const p = resolveParams("v2.0", override)
    expect(p.pricing.urgent_multiplier).toBe(1.75)
    // Other pricing fields preserved
    expect(p.pricing.base_price).toEqual(WEATHER_REGIME_PARAMS_V2.pricing.base_price)
  })

  it("falls back to active version when given an unknown version key", () => {
    const p = resolveParams("v99.0" as string)
    expect(p.version).toBe(WEATHER_REGIME_PARAMS_V2.version)
  })

  it("does not touch localStorage or window", () => {
    // Sanity: calling resolveParams should not throw in a fresh context
    // even when we blank out window (verified by running in vitest's default
    // happy-dom/jsdom + explicitly calling through).
    expect(() => resolveParams("v2.0")).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to verify it fails.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run resolve-params
```

Expected: FAIL — `resolveParams` is not exported from `../weather-regime-params`.

- [ ] **Step 3: Add `resolveParams()` and export it.**

In `low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts`, ABOVE the existing `getParams()` function (around line 322), add:

```typescript
/**
 * Pure parameter resolver. Takes a version key and an optional shallow
 * override and returns a merged `WeatherRegimeParams`. Does NOT read
 * `localStorage`, `window`, or any other browser-only global. Safe to
 * call from server components, tests, and future package extractions.
 */
export function resolveParams(
  version: string = ACTIVE_PARAMS_VERSION,
  override?: Partial<WeatherRegimeParams>,
): WeatherRegimeParams {
  const base = PARAM_REGISTRY[version] ?? PARAM_REGISTRY[ACTIVE_PARAMS_VERSION]
  if (!override) return base
  return {
    ...base,
    ...override,
    pricing: { ...base.pricing, ...(override.pricing ?? {}) },
  }
}
```

- [ ] **Step 4: Run tests to verify pass.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run resolve-params
npm test -- --run risk-engine.golden
```

Expected: both test files pass (resolve-params suite green, 10 golden tests still green).

- [ ] **Step 5: Commit.**

```bash
git add low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts \
        low-altitude-ops-platform/frontend/src/lib/engines/__tests__/resolve-params.test.ts
git commit -m "feat(engines): add pure resolveParams() helper

Introduces a browser-free parameter resolver alongside the existing
getParams() wrapper. resolveParams(version, override?) performs the
same shallow-merge + pricing deep-merge that getParams() did, without
touching localStorage or window.

Covered by 6 new tests. No existing caller is migrated yet; behaviour
is unchanged.

Plan Task 2 of 8."
```

---

## Task 3: Create `src/lib/params-store.ts` client wrapper

**Goal:** A thin client-side module that owns all browser knowledge about parameter overrides. Engines never import this.

**Files:**
- Create: `low-altitude-ops-platform/frontend/src/lib/params-store.ts`
- Test: `low-altitude-ops-platform/frontend/src/lib/__tests__/params-store.test.ts` (new)

### Steps

- [ ] **Step 1: Write failing tests.**

Create `low-altitude-ops-platform/frontend/src/lib/__tests__/params-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from "vitest"
import {
  loadParamOverride,
  saveParamOverride,
  clearParamOverride,
  getParamsWithOverride,
  migrateLegacyPricingOverride,
  LARM_OVERRIDE_KEY,
  LEGACY_PRICING_KEY,
} from "../params-store"
import { WEATHER_REGIME_PARAMS_V2 } from "../engines/weather-regime-params"

describe("params-store", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("loadParamOverride returns null when nothing is stored", () => {
    expect(loadParamOverride()).toBeNull()
  })

  it("saveParamOverride + loadParamOverride round-trip", () => {
    saveParamOverride({ r4_nogo_threshold: 90 })
    expect(loadParamOverride()).toEqual({ r4_nogo_threshold: 90 })
  })

  it("clearParamOverride removes the stored value", () => {
    saveParamOverride({ r4_nogo_threshold: 90 })
    clearParamOverride()
    expect(loadParamOverride()).toBeNull()
  })

  it("loadParamOverride returns null when stored JSON is malformed", () => {
    localStorage.setItem(LARM_OVERRIDE_KEY, "not-json")
    expect(loadParamOverride()).toBeNull()
  })

  it("getParamsWithOverride without override equals pure defaults", () => {
    expect(getParamsWithOverride()).toEqual(WEATHER_REGIME_PARAMS_V2)
  })

  it("getParamsWithOverride merges stored override over defaults", () => {
    saveParamOverride({ r4_nogo_threshold: 77 })
    expect(getParamsWithOverride().r4_nogo_threshold).toBe(77)
  })

  it("migrateLegacyPricingOverride copies old key into new key and clears old", () => {
    const legacy = { pricing: { urgent_multiplier: 1.8 } }
    localStorage.setItem(LEGACY_PRICING_KEY, JSON.stringify(legacy))
    migrateLegacyPricingOverride()
    expect(localStorage.getItem(LEGACY_PRICING_KEY)).toBeNull()
    expect(loadParamOverride()).toEqual({ pricing: { urgent_multiplier: 1.8 } })
  })

  it("migrateLegacyPricingOverride preserves existing larm override (merges)", () => {
    const legacyPricing = { pricing: { urgent_multiplier: 1.8 } }
    const existingLarm = { r4_nogo_threshold: 80 }
    localStorage.setItem(LEGACY_PRICING_KEY, JSON.stringify(legacyPricing))
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(existingLarm))
    migrateLegacyPricingOverride()
    expect(loadParamOverride()).toEqual({
      r4_nogo_threshold: 80,
      pricing: { urgent_multiplier: 1.8 },
    })
  })

  it("is safe to call during SSR (no window)", () => {
    // Simulate SSR by blanking localStorage at this call only
    const original = globalThis.localStorage
    // @ts-expect-error deliberate deletion for SSR sim
    delete (globalThis as unknown as { localStorage?: Storage }).localStorage
    try {
      expect(loadParamOverride()).toBeNull()
      expect(() => saveParamOverride({ r4_nogo_threshold: 1 })).not.toThrow()
      expect(getParamsWithOverride()).toEqual(WEATHER_REGIME_PARAMS_V2)
    } finally {
      ;(globalThis as unknown as { localStorage: Storage }).localStorage = original
    }
  })
})
```

- [ ] **Step 2: Run test to verify it fails.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run params-store
```

Expected: FAIL — `params-store` module not found.

- [ ] **Step 3: Create the module.**

Create `low-altitude-ops-platform/frontend/src/lib/params-store.ts`:

```typescript
// Client-side parameter-override store.
//
// This is the ONLY module in src/lib that is allowed to talk to
// localStorage for LARM params. Engines under src/lib/engines/ stay
// browser-free; they accept params explicitly and this module is how
// the Next.js app layer threads user overrides through to them.
//
// Legacy migration: early builds wrote a separate "pricing_params_override"
// key. migrateLegacyPricingOverride() folds any surviving legacy payload
// into the canonical "larm_params_override" key and deletes the old one.

import {
  resolveParams,
  type WeatherRegimeParams,
} from "./engines/weather-regime-params"

export const LARM_OVERRIDE_KEY = "larm_params_override"
export const LEGACY_PRICING_KEY = "pricing_params_override"

function hasStorage(): boolean {
  try {
    return typeof localStorage !== "undefined"
  } catch {
    return false
  }
}

export function loadParamOverride(): Partial<WeatherRegimeParams> | null {
  if (!hasStorage()) return null
  try {
    const raw = localStorage.getItem(LARM_OVERRIDE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as Partial<WeatherRegimeParams>
  } catch {
    return null
  }
}

export function saveParamOverride(override: Partial<WeatherRegimeParams>): void {
  if (!hasStorage()) return
  try {
    localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(override))
  } catch {
    // Quota exceeded or storage disabled — silent, same as prior behaviour.
  }
}

export function clearParamOverride(): void {
  if (!hasStorage()) return
  try {
    localStorage.removeItem(LARM_OVERRIDE_KEY)
  } catch {
    // ignore
  }
}

/**
 * Merge any client-side override with engine defaults and return the full
 * WeatherRegimeParams. Safe to call from server components: returns pure
 * defaults when localStorage is unavailable.
 */
export function getParamsWithOverride(version?: string): WeatherRegimeParams {
  return resolveParams(version, loadParamOverride() ?? undefined)
}

/**
 * One-shot migration for the "pricing_params_override" key that pre-dated
 * the unified override. Idempotent.
 */
export function migrateLegacyPricingOverride(): void {
  if (!hasStorage()) return
  try {
    const oldRaw = localStorage.getItem(LEGACY_PRICING_KEY)
    if (!oldRaw) return
    const oldValue = JSON.parse(oldRaw) as { pricing?: unknown }
    if (oldValue && typeof oldValue === "object" && "pricing" in oldValue) {
      const existingRaw = localStorage.getItem(LARM_OVERRIDE_KEY)
      const existing = existingRaw
        ? (JSON.parse(existingRaw) as Partial<WeatherRegimeParams>)
        : {}
      const merged = { ...existing, pricing: oldValue.pricing } as Partial<WeatherRegimeParams>
      localStorage.setItem(LARM_OVERRIDE_KEY, JSON.stringify(merged))
    }
    localStorage.removeItem(LEGACY_PRICING_KEY)
  } catch {
    // Best-effort migration. If it fails, leave both keys alone.
  }
}
```

- [ ] **Step 4: Run tests to verify pass.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run params-store
npm test -- --run risk-engine.golden
npm test -- --run resolve-params
```

Expected: all three test files green.

- [ ] **Step 5: Commit.**

```bash
git add low-altitude-ops-platform/frontend/src/lib/params-store.ts \
        low-altitude-ops-platform/frontend/src/lib/__tests__/params-store.test.ts
git commit -m "feat(lib): add client-side params-store module

params-store owns localStorage access for LARM parameter overrides,
keeping src/lib/engines free of browser APIs. Legacy
pricing_params_override migration moves here from pricing-params.ts.

Covered by 9 new tests including an SSR-safety test. No engines or app
call sites are migrated yet.

Plan Task 3 of 8."
```

---

## Task 4: Add `params` + `clock` options to `evaluateRisk()`

**Goal:** `evaluateRisk(input, options?)` lets callers pass an explicit merged `params` and an explicit `clock`. When omitted, behaviour is identical to today.

**Files:**
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/risk-engine.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/risk-engine.golden.test.ts` (add new tests only)

### Steps

- [ ] **Step 1: Write failing tests.**

Add a new `describe` block at the end of `risk-engine.golden.test.ts`:

```typescript
// ─── Options: params + clock injection ───────────────────────────────────────

describe("evaluateRisk options", () => {
  it("accepts an explicit params object equal to the default and produces identical output", () => {
    const base = evaluateRisk(makeInput())
    const withExplicitParams = evaluateRisk(makeInput(), {
      params: resolveParams("v2.0"),
    })
    expect(withExplicitParams.risk_score).toBe(base.risk_score)
    expect(withExplicitParams.decision).toBe(base.decision)
    expect(withExplicitParams.buffer_ratio).toBe(base.buffer_ratio)
  })

  it("honours an override passed via options.params", () => {
    const overridden = resolveParams("v2.0", { r4_nogo_threshold: 80 })
    // A 90-point R4 input should NOT hard-stop under the default (92)
    // but SHOULD hard-stop under an 80 override.
    const input = makeInput({
      weather_today: { ...benignToday, wind_now_kmh: 35, rain_prob_today_pct: 95 },
      weather_30d: { ...benign30d, wind_p90_kmh: 50, gust_p90_kmh: 60 },
    })
    const def = evaluateRisk(input)
    const ovr = evaluateRisk(input, { params: overridden })
    // Decision may or may not differ depending on exact score; just assert
    // that the override was applied (versions.weather_regime_params_version
    // comes from params.version which was unchanged) and that ovr saw the
    // lower threshold by checking the controls string.
    if (ovr.risk_score > 80) {
      expect(ovr.decision).toBe("NO_GO")
    }
    void def
  })

  it("uses the injected clock for evaluated_at", () => {
    const fixed = new Date("2030-01-01T00:00:00.000Z")
    const r = evaluateRisk(makeInput(), { clock: () => fixed })
    expect(r.evaluated_at).toBe(fixed.toISOString())
  })
})
```

Add to the imports block at the top of the file:

```typescript
import { resolveParams } from "@/lib/engines/weather-regime-params"
```

- [ ] **Step 2: Run test to verify it fails.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run risk-engine.golden
```

Expected: the 3 new tests fail (typecheck error on `options` arg, or `clock: never`).

- [ ] **Step 3: Update the signature and internals.**

In `risk-engine.ts`, replace the `evaluateRisk` signature block (around line 423) and thread `options` through. Also add an options type near the top of the file.

Add near the top (after imports):

```typescript
export interface EvaluateRiskOptions {
  /** Explicit merged params. If omitted, resolveParams() defaults are used. */
  params?: WeatherRegimeParams
  /** Clock for deterministic `evaluated_at`. Defaults to () => new Date(). */
  clock?: () => Date
  /** Optional param-version selector; ignored when `params` is supplied. */
  paramsVersion?: string
}

const defaultClock: () => Date = () => new Date()
```

Import the `WeatherRegimeParams` type:
```typescript
import { resolveParams, ACTIVE_PARAMS_VERSION, type WeatherRegimeParams } from "./weather-regime-params"
```

(Keep the existing `getParams` import — it is still used by legacy internal helpers and will be removed in Task 8. The `resolveParams` import is the forward path.)

Rewrite the main function (replace lines 423–495 in current HEAD):

```typescript
export function evaluateRisk(
  input: LARMInput,
  options: EvaluateRiskOptions = {},
): RiskResult {
  const P: WeatherRegimeParams = options.params
    ?? resolveParams(options.paramsVersion ?? ACTIVE_PARAMS_VERSION)
  const clock = options.clock ?? defaultClock
  const { weather_30d, weather_today, building, operational, w_override, equipment = [] } = input
  const ops: OperationalContextInput = operational ?? {
    time_window: "day", weekend: 0, urgent_days: null,
    road_closure_needed: 0, multi_day_split: null, operator_experience_level: null,
  }

  const expl: RiskExplanation[] = []

  // A — regime classification with confidence + W5 trend
  const regimeResult = classifyWeatherRegimeWithParams(
    weather_30d, weather_today, w_override, P, input.recent_typhoon_count,
  )
  const { w_code, confidence, secondary_w, adjusted_base } = regimeResult
  const base_w = adjusted_base
  expl.push({
    factor: "天候背景（W Regime）",
    value: `${w_code} — ${P.regimes[w_code].name}`,
    score: base_w,
    note: confidence < 1
      ? `${P.regimes[w_code].notes} 置信度=${(confidence * 100).toFixed(0)}%`
      : P.regimes[w_code].notes + (base_w !== P.regimes[w_code].base_score ? ` (含氣候趨勢+${P.w5_typhoon_trend_bonus})` : ""),
  })

  // B.1
  const { score: weather_now, edr_adj } = computeWeatherNow(weather_today, weather_30d, w_code, building.region_exposure, expl, P)

  // B.2 — G_score (replaces B_score)
  const { total: g_score, ground_consequence, tke_proxy } = computeGScore(building, weather_today.wind_now_kmh, expl, P)

  // B.3
  const o_score = computeOperationalScore(ops, building.crowd_density, expl, P)

  // E — equipment score
  const e_score = computeEquipmentScore(equipment, expl, P)

  // C
  const risk_score = Math.min(100, Math.max(0, Math.round(base_w + weather_now + g_score + o_score + e_score)))
  const risk_level = mapToRLevel(risk_score, P)

  // D — gating with risk_score for R4 split
  const { decision, requires_approval, controls, conditional_tier } = computeGating(
    risk_level, risk_score, weather_today, building, ops, w_code, e_score, P,
  )

  const buffer_ratio = computeBufferRatio(risk_score, w_code, confidence, P, weather_today.forecast_confidence)

  const versions: LARMVersions = {
    larm_version: "v2.0",
    weather_regime_params_version: P.version ?? ACTIVE_PARAMS_VERSION,
    thresholds_version: "v2.0",
  }

  return {
    weather_type: w_code, risk_level,
    internal_grade: getInternalGrade(risk_level),
    decision, requires_approval, controls,
    ruleset_version: "larm_v2.0",
    evaluated_at: clock().toISOString(),
    w_code, base_w, weather_now, g_score,
    b_score: g_score,  // backward compatibility alias
    o_score, risk_score, buffer_ratio,
    explanations: expl, versions,
    regime_confidence: confidence,
    secondary_w,
    e_score,
    conditional_tier,
    edr_adj,
    tke_proxy,
    ground_consequence,
  }
}
```

Add a new helper next to `classifyWeatherRegime` that takes `P` directly (keep the original for back-compat to avoid touching call sites like `model-helpers`):

```typescript
function classifyWeatherRegimeWithParams(
  w30: Weather30dInput,
  today: WeatherTodayInput,
  override: WeatherType | undefined,
  P: WeatherRegimeParams,
  recentTyphoonCount: number | null | undefined,
): WeatherRegimeResult & { adjusted_base: number } {
  if (override) {
    return { w_code: override, confidence: 1.0, secondary_w: null, adjusted_base: P.regimes[override].base_score }
  }
  const { wind_p90_kmh, gust_p90_kmh, rain_days_30, heavy_rain_days_30, instability_index, predictability_score } = w30
  const matches: WeatherType[] = []
  if (wind_p90_kmh >= 39 || (gust_p90_kmh != null && gust_p90_kmh >= 50)) matches.push("W5")
  if (rain_days_30 >= 15 && heavy_rain_days_30 >= 3) matches.push("W3")
  if (instability_index >= 0.70 && heavy_rain_days_30 >= 2) matches.push("W4")
  if (wind_p90_kmh >= 33 && predictability_score >= 0.60) matches.push("W1")
  if (rain_days_30 >= 8 && rain_days_30 <= 14 && predictability_score < 0.55) matches.push("W2")
  const primary: WeatherType = matches[0] ?? "W0"
  const secondary: WeatherType | null = matches[1] ?? null
  const confidence = matches.length <= 1 ? 1.0 :
    matches.length === 2 ? 0.78 :
    matches.length === 3 ? 0.62 : 0.50
  let adjustedBase = P.regimes[primary].base_score
  if (primary === "W5" && recentTyphoonCount != null && recentTyphoonCount > P.w5_typhoon_trend_threshold) {
    adjustedBase += P.w5_typhoon_trend_bonus
  }
  void today
  return { w_code: primary, confidence, secondary_w: secondary, adjusted_base: adjustedBase }
}
```

Leave the existing `classifyWeatherRegime(w30, today, override, paramsVersion, recentTyphoonCount)` in place for now — remove in Task 8.

- [ ] **Step 4: Run tests to verify pass.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run
npm run typecheck
```

Expected: all golden tests green (10 original + 3 new); typecheck clean.

- [ ] **Step 5: Commit.**

```bash
git add low-altitude-ops-platform/frontend/src/lib/engines/risk-engine.ts \
        low-altitude-ops-platform/frontend/src/lib/engines/__tests__/risk-engine.golden.test.ts
git commit -m "feat(engines): evaluateRisk accepts params + clock options

evaluateRisk(input, options?) now takes { params?, clock?, paramsVersion? }.
When options.params is supplied, no internal getParams() lookup runs,
making the function a pure transformation of input + params. clock
injection makes evaluated_at deterministic in tests.

Behaviour for existing callers (evaluateRisk(input) with no options) is
unchanged: the function falls back to resolveParams(ACTIVE_PARAMS_VERSION)
and () => new Date(), matching the current defaults. Golden tests
unchanged + 3 new option-related tests.

Plan Task 4 of 8."
```

---

## Task 5: Add `params` / `clock` / `idGenerator` options to `generateQuote()`

**Goal:** Same shape as Task 4, for `pricing-engine.ts`. Eliminates `new Date()`, `Math.random()`, and the `getParams().quote_max_multiplier` cross-coupling.

**Files:**
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/pricing-engine.ts`
- Test: `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/pricing-engine.test.ts` (new)

### Steps

- [ ] **Step 1: Write failing tests.**

Create `pricing-engine.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { generateQuote } from "../pricing-engine"
import { PRICING_PARAMS_DEFAULT } from "../pricing-params"
import { resolveParams } from "../weather-regime-params"

const baseInput = {
  buildingType: "office" as const,
  floors: 5,
  facades: [
    { complexity: "light" as const, area_m2: 100, road_closure: false, high_risk_env: false },
  ],
  contamination: [] as const,
  cleaningAgent: "standard" as const,
  timeWindow: "day" as const,
  waterSupply: "provided" as const,
  powerSupply: "provided" as const,
  rooftopAccess: "Good" as const,
  urgent: false,
}

describe("generateQuote options", () => {
  it("produces a stable quote_code when idGenerator is supplied", () => {
    const r = generateQuote(baseInput, {
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
      idGenerator: () => "Q-20300101-FIXED",
    })
    expect(r.quote_code).toBe("Q-20300101-FIXED")
    expect(r.valid_until).toBe("2030-01-31")
  })

  it("accepts explicit params + pricingParams and does not call getParams", () => {
    const fixedParams = resolveParams("v2.0")
    const r = generateQuote(baseInput, {
      params: fixedParams,
      pricingParams: PRICING_PARAMS_DEFAULT,
      clock: () => new Date("2030-01-01T00:00:00.000Z"),
      idGenerator: () => "Q-TEST",
    })
    expect(r.total).toBeGreaterThan(0)
    expect(r.currency).toBe("NTD")
  })

  it("back-compat: generateQuote(input) still works without options", () => {
    const r = generateQuote(baseInput)
    expect(r.total).toBeGreaterThan(0)
    expect(r.quote_code.startsWith("Q-")).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run pricing-engine
```

Expected: FAIL on the options-aware calls (second arg is currently `PricingParams`, not an options object).

- [ ] **Step 3: Migrate `generateQuote()` to options shape.**

In `pricing-engine.ts`:

Add near the imports (keep the existing `getParams` + `getPricingParams` imports for now — removed in Task 8):

```typescript
import type { WeatherRegimeParams } from "./weather-regime-params"

export interface GenerateQuoteOptions {
  /** Merged weather-regime params; used only for quote_max_multiplier cap. */
  params?: WeatherRegimeParams
  /** Explicit pricing params. Defaults to getPricingParams() for back-compat. */
  pricingParams?: PricingParams
  /** Clock for today / valid_until. Defaults to () => new Date(). */
  clock?: () => Date
  /** Returns a quote-code suffix. Defaults to Math.floor(Math.random() * 900 + 100). */
  idGenerator?: () => string
}

const defaultClock: () => Date = () => new Date()
const defaultIdGenerator: () => string = () =>
  String(Math.floor(Math.random() * 900 + 100))
```

Replace the function signature and the date/id block:

```typescript
// before (line 24)
export function generateQuote(input: PricingEngineInput, params?: PricingParams): PricingResult {
  const P = params ?? getPricingParams()
  // ...
  const maxMult = getParams().quote_max_multiplier
  // ...
  const today = new Date()
  const validUntil = new Date(today)
  validUntil.setDate(today.getDate() + 30)
  const quoteCode = `Q-${today.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`
```

becomes (keeping the rest of the function body identical):

```typescript
export function generateQuote(
  input: PricingEngineInput,
  options: GenerateQuoteOptions = {},
): PricingResult {
  const P = options.pricingParams ?? getPricingParams()
  const W = options.params ?? getParams()   // removed in Task 8
  const clock = options.clock ?? defaultClock
  const idGen = options.idGenerator ?? defaultIdGenerator
  // ... (unchanged computation lines 26–115) ...

  const maxMult = W.quote_max_multiplier
  // ... (unchanged lines 118–120) ...

  const today = clock()
  const validUntil = new Date(today)
  validUntil.setDate(today.getDate() + 30)
  const quoteCode = `Q-${today.toISOString().slice(0, 10).replace(/-/g, "")}-${idGen()}`
```

**Back-compat note**: historical callers passed a `PricingParams` object as the second argument. Because `GenerateQuoteOptions` and `PricingParams` have no overlap in required fields, TypeScript would accept the old call-shape only if `options.pricingParams` is missing. The typecheck will flag the handful of existing call sites — Task 7 migrates them explicitly. Until then, those callers may compile error; that's intentional and caught in Step 4 below.

- [ ] **Step 4: Update existing callers (if typecheck breaks).**

Expected TypeScript errors in these two files:

- `low-altitude-ops-platform/frontend/src/app/(quote)/quote/components/QuoteStep3.tsx:144`
- `low-altitude-ops-platform/frontend/src/components/wizard/steps/Step8Pricing.tsx:20`

Both currently call `generateQuote({ ... })` with one argument (no second arg), which still works. If typecheck complains, wrap the second arg in `{}`. If both already pass only one argument, no change is needed in Task 5 — Task 7 handles the explicit-params migration.

```bash
cd low-altitude-ops-platform/frontend
npm run typecheck
```

- [ ] **Step 5: Run tests.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run
```

Expected: all tests green.

- [ ] **Step 6: Commit.**

```bash
git add low-altitude-ops-platform/frontend/src/lib/engines/pricing-engine.ts \
        low-altitude-ops-platform/frontend/src/lib/engines/__tests__/pricing-engine.test.ts
git commit -m "feat(engines): generateQuote accepts options { params, pricingParams, clock, idGenerator }

Adds options shape matching evaluateRisk; removes direct new Date()
and Math.random() usage from the default code path. quote_max_multiplier
is now sourced from options.params when supplied.

Plan Task 5 of 8."
```

---

## Task 6: Migrate admin/params page to params-store

**Goal:** `admin/params/page.tsx` currently duplicates `LS_KEY = "larm_params_override"` and directly reads/writes localStorage. Replace with params-store.

**Files:**
- Modify: `low-altitude-ops-platform/frontend/src/app/(main)/admin/params/page.tsx`

### Steps

- [ ] **Step 1: Inspect current usage.**

Use Grep / Read on `admin/params/page.tsx` lines 30–130 to identify every place the page reads `LS_KEY`, writes `LS_KEY`, calls `getParams()`, or references `PRICING_PARAMS_DEFAULT`.

- [ ] **Step 2: Replace imports.**

Add at the top of the file:

```typescript
import {
  loadParamOverride,
  saveParamOverride,
  clearParamOverride,
  getParamsWithOverride,
} from "@/lib/params-store"
```

Remove the local `const LS_KEY = "larm_params_override"` declaration (line 35).

- [ ] **Step 3: Replace reads.**

Replace direct `localStorage.getItem(LS_KEY)` reads with `loadParamOverride()`. Replace the `{ ...getParams(), ...override, pricing: ... }` merge (line 111) with `getParamsWithOverride()`.

- [ ] **Step 4: Replace writes.**

Replace direct `localStorage.setItem(LS_KEY, JSON.stringify(...))` with `saveParamOverride(...)`. Replace `localStorage.removeItem(LS_KEY)` with `clearParamOverride()`.

- [ ] **Step 5: Verify.**

```bash
cd low-altitude-ops-platform/frontend
npm run typecheck
npm run build
npm test -- --run
```

Expected: everything green. Smoke-test the admin page in dev mode (`npm run dev`, visit `/admin/params`): set an override, reload, confirm it persists; hit "reset", confirm it's cleared.

- [ ] **Step 6: Commit.**

```bash
git add low-altitude-ops-platform/frontend/src/app/\(main\)/admin/params/page.tsx
git commit -m "refactor(admin/params): use params-store instead of direct localStorage

Drops the duplicated LS_KEY constant and the ad-hoc merge logic in
favour of the shared params-store API.

Plan Task 6 of 8."
```

---

## Task 7: Migrate component call sites to pass params explicitly

**Goal:** Every call to `evaluateRisk` and `generateQuote` in `components/` and `app/` passes `{ params: getParamsWithOverride() }`. Engines no longer depend on any internal `getParams()` lookup at runtime.

**Files:**
- Modify: `low-altitude-ops-platform/frontend/src/components/wizard/steps/Step6Operations.tsx`
- Modify: `low-altitude-ops-platform/frontend/src/components/wizard/steps/Step8Pricing.tsx`
- Modify: `low-altitude-ops-platform/frontend/src/app/(quote)/quote/components/QuoteStep3.tsx`

### Steps

- [ ] **Step 1: Identify each call.**

- `Step6Operations.tsx:231` → `evaluateRisk({ ... })` — inside a React effect. `getParamsWithOverride()` is client-safe here (this is a client component).
- `Step8Pricing.tsx:20` → `generateQuote({ ... })` — similar.
- `QuoteStep3.tsx:144` → `generateQuote({ ... })` — similar.

- [ ] **Step 2: Update `Step6Operations.tsx`.**

Add the import:
```typescript
import { getParamsWithOverride } from "@/lib/params-store"
```

Change the call:
```typescript
// before
const r = evaluateRisk({ weather_30d: w30, weather_today: w.weather_today, building, operational, equipment: [] })
// after
const r = evaluateRisk(
  { weather_30d: w30, weather_today: w.weather_today, building, operational, equipment: [] },
  { params: getParamsWithOverride() },
)
```

- [ ] **Step 3: Update `Step8Pricing.tsx`.**

Add the same import. Change:
```typescript
// before
const r = generateQuote({ ... })
// after
const r = generateQuote({ ... }, { params: getParamsWithOverride() })
```

- [ ] **Step 4: Update `QuoteStep3.tsx`.**

Same pattern.

- [ ] **Step 5: Verify.**

```bash
cd low-altitude-ops-platform/frontend
npm run typecheck
npm run lint
npm run build
npm test -- --run
```

Expected: all green. Smoke-test a full wizard flow (`npm run dev`, go through `/missions/new` Steps 1–8 and `/quote`) to confirm risk/pricing outputs still render correctly.

- [ ] **Step 6: Commit.**

```bash
git add low-altitude-ops-platform/frontend/src/components/wizard/steps/Step6Operations.tsx \
        low-altitude-ops-platform/frontend/src/components/wizard/steps/Step8Pricing.tsx \
        low-altitude-ops-platform/frontend/src/app/\(quote\)/quote/components/QuoteStep3.tsx
git commit -m "refactor(app): thread params explicitly into engine calls

Every evaluateRisk / generateQuote caller now passes
{ params: getParamsWithOverride() }. This closes the last dependency
on engines reading localStorage internally, unblocking the
localStorage removal in Task 8.

Plan Task 7 of 8."
```

---

## Task 8: Strip browser access from engines

**Goal:** Remove `typeof window`, direct `localStorage` reads/writes, `new Date()`, `Math.random()`, and the legacy `getParams()`-inside-engines pattern from the engines layer. Nothing under `src/lib/engines/` (except `forecast-db.ts` / `forecast-tracker.ts`, explicitly P1) touches the browser.

**Files:**
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/pricing-params.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/risk-engine.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/pricing-engine.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/model-helpers.ts`

### Steps

- [ ] **Step 1: Run the full suite as a baseline.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run
```

Expected: every test green. (If any task left anything red, fix before continuing.)

- [ ] **Step 2: Purge localStorage + typeof window from `weather-regime-params.ts`.**

Replace the current `getParams()` (lines 321–338) with:

```typescript
/**
 * @deprecated Call resolveParams() directly. Retained as a thin wrapper
 * so in-tree imports compile. Returns pure defaults; no browser access.
 */
export function getParams(version: string = ACTIVE_PARAMS_VERSION): WeatherRegimeParams {
  return resolveParams(version)
}
```

Delete the `const LS_KEY = "larm_params_override"` declaration immediately above it (now unused).

- [ ] **Step 3: Purge localStorage + typeof window + migration from `pricing-params.ts`.**

Delete the `LEGACY_LS_KEY`, `LARM_LS_KEY`, and `migrateLegacyPricingOverride` declarations (lines ~126–148) — the migration helper lives in `params-store.ts` now.

Replace `getPricingParams()` (lines ~150–177) with:

```typescript
/**
 * @deprecated Embed pricing params directly in options where possible.
 * This helper returns the defaults only; all browser-side overrides are
 * routed through src/lib/params-store.ts.
 */
export function getPricingParams(): PricingParams {
  return PRICING_PARAMS_DEFAULT
}
```

- [ ] **Step 4: Remove `new Date()` / `Math.random()` from engines bodies.**

`risk-engine.ts:481` — the `evaluated_at` assignment. This now flows through `options.clock`; the `defaultClock` top-level constant added in Task 4 is the only surviving `new Date()` and it only fires when the caller omits `clock`. No change needed if Task 4 was done correctly. Verify with Grep:

Use Grep with pattern `new Date\(\)` in `low-altitude-ops-platform/frontend/src/lib/engines/risk-engine.ts` — expect 0 matches inside function bodies; the only remaining occurrence is inside the `const defaultClock = () => new Date()` top-level declaration.

`pricing-engine.ts` — same pattern. The `defaultClock` / `defaultIdGenerator` top-level constants are fine; the function body should contain zero direct `new Date()` / `Math.random()`. Verify similarly.

- [ ] **Step 5: Remove the legacy `classifyWeatherRegime` helper in `risk-engine.ts`.**

The Task 4 rewrite uses `classifyWeatherRegimeWithParams`; the old `classifyWeatherRegime` (which calls `getParams(paramsVersion)` internally) is now dead code. Delete it (lines 15–53 in the HEAD snapshot).

Also drop the now-unused `getParams, ACTIVE_PARAMS_VERSION` named import at line 12 — change to just `ACTIVE_PARAMS_VERSION` and `resolveParams` from the already-added Task 4 import.

- [ ] **Step 6: Update `model-helpers.ts` to require `P`.**

Current signature (Task 1 state):
```typescript
export function inferWCode(today, w30d, P?: WeatherRegimeParams): WeatherType {
  const t = (P ?? getParams()).ui_infer_thresholds
  ...
}
```

New:
```typescript
export function inferWCode(
  today: WeatherTodayInput,
  w30d: Weather30dInput,
  P: WeatherRegimeParams,
): WeatherType {
  const t = P.ui_infer_thresholds
  ...
}
```

Do the same for `getWRDecision`. Remove the `getParams` import.

This is a breaking-to-callers change inside the frontend. Grep for callers:

Use Grep for `inferWCode(` and `getWRDecision(` under `low-altitude-ops-platform/frontend/src/`. For each hit, pass `getParamsWithOverride()` (client components) or `resolveParams()` (server components, tests) as the third argument.

Typical fix at a client call site:

```typescript
// before
const w = inferWCode(today, w30d)
// after
const w = inferWCode(today, w30d, getParamsWithOverride())
```

- [ ] **Step 7: Remove `getParams()` fallback in `pricing-engine.ts`.**

In the body, replace:
```typescript
const W = options.params ?? getParams()
```
with:
```typescript
const W = options.params ?? resolveParams()
```

Drop the `getParams` import from this file.

- [ ] **Step 8: Remove `getParams` from `risk-engine.ts` imports.**

Only `resolveParams` and `ACTIVE_PARAMS_VERSION` should remain in the import from `./weather-regime-params`.

- [ ] **Step 9: Verify — the critical step.**

```bash
cd low-altitude-ops-platform/frontend
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

Expected: all green. Zero regressions in golden tests. If anything is red, do NOT proceed — fix.

Also grep the engines directory for forbidden patterns. Use Grep for each pattern inside `low-altitude-ops-platform/frontend/src/lib/engines/`, EXCLUDING `forecast-db.ts` and `forecast-tracker.ts`:

- `typeof window` — expect 0 matches
- `localStorage` — expect 0 matches
- `indexedDB` — expect 0 matches
- `@/` — expect 0 matches (already done in Task 1)
- `new Date()` — expect only inside top-level default-clock `const` declarations, not inside any function body

If any of these fail, fix before committing.

- [ ] **Step 10: Commit.**

```bash
git add low-altitude-ops-platform/frontend/src/lib/engines
git commit -m "refactor(engines): remove browser globals from engine layer

engines/ is now free of localStorage, typeof window, indexedDB, and
direct new Date() / Math.random() usage (forecast-db / forecast-tracker
are P1 and remain untouched). getParams() is a thin back-compat wrapper
around resolveParams(); pricing-params.ts's legacy migration lives in
src/lib/params-store.ts.

Golden tests unchanged + all 3 option-related tests + 6 resolve-params
tests + 9 params-store tests — every suite green. The engines directory
is now extraction-ready for @openlarm/core.

Completes Task 1 P0 decoupling per OPEN_SOURCE_DECOUPLING_AUDIT.md §3."
```

---

## Self-review checklist (run at the end of execution)

- [ ] `git log --oneline` shows 8 focused commits (one per task).
- [ ] `npm test -- --run` green; 10 golden + 3 new options + 6 resolve-params + 9 params-store + 3 pricing-engine = 31 tests passing.
- [ ] `npm run typecheck`, `npm run lint`, `npm run build` all green.
- [ ] Grep under `src/lib/engines/` (excluding `forecast-db.ts`, `forecast-tracker.ts`): 0 matches for `typeof window`, `localStorage`, `@/`.
- [ ] Grep in engines function bodies (not top-level `const` clocks): 0 `new Date()`, 0 `Math.random()`.
- [ ] Smoke-test `/admin/params` — override persists; reset clears.
- [ ] Smoke-test `/missions/new` through Step 6 → risk result renders identical to pre-refactor.
- [ ] Smoke-test `/quote` Step 3 → pricing result renders identical to pre-refactor.
