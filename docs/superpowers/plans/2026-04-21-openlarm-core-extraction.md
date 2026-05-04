# @openlarm/core Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract `low-altitude-ops-platform/frontend/src/lib/engines/` and the core LARM types into two standalone, publishable npm packages (`@openlarm/core`, `@openlarm/regions-taiwan`), while keeping the Next.js app running identically throughout — so the repo can publish `@openlarm/core@0.1.0-alpha.0` to npm as the first public release.

**Architecture:** Add an npm-workspaces monorepo root at the repo top level. New `packages/core/` holds region-agnostic types + engines; new `packages/regions-taiwan/` holds the numeric Taiwan calibration (V1 + V2 parameter sets). Next.js `transpilePackages` is used so the app consumes raw TypeScript from the packages in dev/build — no dist is needed for local work. Strangler-fig transition: the existing `frontend/src/lib/engines/*.ts` files become one-line re-exports of the new package entries so the 24 existing `@/lib/engines/*` / `@/lib/types` importers stay unchanged. `WeatherRegimeParams.pricing` (the cross-engine coupling flagged in `OPEN_SOURCE_DECOUPLING_AUDIT.md §2.4 ⑦⑧`) is finally severed — `quote_max_multiplier` moves into `PricingParams`, pricing stays in the frontend app, core is price-agnostic. All 34 existing vitest tests stay green at every commit; Next.js `npm run build` must succeed at every commit. Actual `npm publish` is paused at the end for user confirmation.

**Tech Stack:** TypeScript (strict), Node 20, npm workspaces (built-in, no new tool), tsup (dual ESM + CJS + .d.ts output for publishing), vitest (per-package), Next.js 16 App Router, `transpilePackages` for dev-loop.

**Out of scope:**
- `forecast-db.ts` and `forecast-tracker.ts` (P1 per `OPEN_SOURCE_DECOUPLING_AUDIT.md §2.2 ④` — they stay in the frontend engines folder).
- `airspace-zones.ts` and `time-engine.ts` (per `OPEN_SOURCE_TASK_3_PLAN.md §3.5` they become future `@openlarm/airspace-taiwan` / `@openlarm/time` — stay in frontend for now).
- `pricing-engine.ts` / `pricing-params.ts` (per same §3.5, pricing is out of core; stays in frontend).
- Actual `npm publish` (manual, after user confirmation).

**Commands cheat-sheet (all run from repo root unless noted):**
```bash
npm install                                           # installs workspace links
npm -w @openlarm/core run build                       # tsup build for core
npm -w @openlarm/core run test                        # vitest for core
npm -w @openlarm/regions-taiwan run build             # tsup build for regions
cd low-altitude-ops-platform/frontend && npm run dev  # Next.js dev (picks up packages via transpilePackages)
cd low-altitude-ops-platform/frontend && npm test     # vitest for app-only tests
cd low-altitude-ops-platform/frontend && npm run build # Next.js build
```

---

## File Structure

```
/ (repo root)
├── package.json                         ← NEW: workspace root (Task 1)
├── packages/                            ← NEW
│   ├── core/                            ← NEW package @openlarm/core
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── tsup.config.ts
│   │   ├── vitest.config.ts
│   │   ├── src/
│   │   │   ├── index.ts                 ← barrel export
│   │   │   ├── types/
│   │   │   │   └── index.ts             ← moved from frontend types.ts (core subset)
│   │   │   ├── params/
│   │   │   │   ├── schema.ts            ← WeatherRegimeParams (no pricing)
│   │   │   │   ├── merge.ts             ← resolveParams / mergeParams
│   │   │   │   └── registry.ts          ← PARAM_REGISTRY (empty; adapters fill)
│   │   │   └── engines/
│   │   │       ├── risk-engine.ts       ← moved from frontend
│   │   │       └── model-helpers.ts     ← moved from frontend
│   │   └── test/
│   │       ├── resolve-params.test.ts   ← moved from frontend
│   │       └── risk-engine.golden.test.ts ← moved from frontend
│   │
│   └── regions-taiwan/                  ← NEW package @openlarm/regions-taiwan
│       ├── package.json
│       ├── tsconfig.json
│       ├── tsup.config.ts
│       └── src/
│           ├── index.ts                 ← exports TAIWAN_PARAMS_V1_0 / V2_0
│           ├── v1.ts                    ← WEATHER_REGIME_PARAMS_V1 renamed
│           └── v2.ts                    ← WEATHER_REGIME_PARAMS_V2 renamed
│
└── low-altitude-ops-platform/frontend/  ← existing Next.js app (path unchanged)
    ├── next.config.ts                   ← MODIFY: add transpilePackages
    ├── package.json                     ← MODIFY: add @openlarm/* deps
    └── src/
        ├── lib/
        │   ├── types.ts                 ← MODIFY: re-export core + augment with app types
        │   ├── params-store.ts          ← MODIFY: import resolveParams + TAIWAN_PARAMS_V2_0
        │   └── engines/
        │       ├── risk-engine.ts       ← MODIFY: 1-line re-export of @openlarm/core
        │       ├── model-helpers.ts     ← MODIFY: 1-line re-export of @openlarm/core
        │       ├── weather-regime-params.ts  ← MODIFY: thin re-export layer
        │       ├── pricing-engine.ts    ← MODIFY: stop reading quote_max_multiplier from WeatherRegimeParams
        │       ├── pricing-params.ts    ← MODIFY: add quote_max_multiplier field
        │       ├── airspace-zones.ts    ← UNCHANGED (future @openlarm/airspace-taiwan)
        │       ├── time-engine.ts       ← UNCHANGED
        │       ├── forecast-db.ts       ← UNCHANGED (P1)
        │       ├── forecast-tracker.ts  ← UNCHANGED (P1)
        │       └── __tests__/
        │           ├── pricing-engine.test.ts  ← UNCHANGED (pricing stays in frontend)
        │           └── (golden/resolve-params move out)
        └── ... (all 24 importers of @/lib/engines or @/lib/types stay unchanged)
```

Responsibility per file:

- **Root `package.json`**: declares `workspaces: ["packages/*", "low-altitude-ops-platform/frontend"]`. No runtime content.
- **`packages/core/package.json`**: `"name": "@openlarm/core"`, `"type": "module"`, `"sideEffects": false`, zero `dependencies`, conditional `exports` for ESM/CJS/types.
- **`packages/core/src/index.ts`**: barrel — re-exports `evaluateRisk`, `resolveParams`, `mergeParams`, `classifyWeatherRegime`, `inferWCode`, `getWRDecision`, `completionForRL`, `simpleRiskFromW`, `ACTIVE_PARAMS_VERSION`, `PARAM_REGISTRY`, plus all types.
- **`packages/core/src/types/index.ts`**: pure type declarations for core domain. No runtime.
- **`packages/core/src/params/schema.ts`**: TypeScript interfaces defining `WeatherRegimeParams` (without pricing) and its nested types.
- **`packages/core/src/params/merge.ts`**: `resolveParams(base, override?)` and `mergeParams(base, override)` — pure functions.
- **`packages/core/src/params/registry.ts`**: exports `PARAM_REGISTRY: Record<string, WeatherRegimeParams>` (empty) and `ACTIVE_PARAMS_VERSION = "v2.0"`.
- **`packages/core/src/engines/risk-engine.ts`**: the main `evaluateRisk` function and its helpers.
- **`packages/core/src/engines/model-helpers.ts`**: `inferWCode`, `getWRDecision`, `completionForRL`, `simpleRiskFromW`.
- **`packages/regions-taiwan/package.json`**: `"name": "@openlarm/regions-taiwan"`, `"peerDependencies": {"@openlarm/core": "workspace:*"}`.
- **`packages/regions-taiwan/src/index.ts`**: re-exports `TAIWAN_PARAMS_V1_0`, `TAIWAN_PARAMS_V2_0`, and a convenience `TAIWAN_PARAMS_ACTIVE` pointer.
- **`frontend/src/lib/types.ts`**: `export type {...} from "@openlarm/core"` for core types, plus `export type` declarations for app-only types (Mission, FacadeData, PricingParams consumers, etc.).
- **`frontend/src/lib/engines/risk-engine.ts`**: one-line `export * from "@openlarm/core"` (plus `export { buildingSiteFromMission, operationalContextFromMission }` which are frontend-only helpers).
- **`frontend/src/lib/engines/weather-regime-params.ts`**: re-exports the schema types from `@openlarm/core` plus the Taiwan defaults from `@openlarm/regions-taiwan`, keeping the existing `getParams()` / `resolveParams()` surface so nothing else breaks.
- **`frontend/src/lib/params-store.ts`**: imports `resolveParams` from `@openlarm/core` and `TAIWAN_PARAMS_V2_0` from `@openlarm/regions-taiwan`; everything else unchanged.

---

## Task 1: Initialize npm workspaces + repo-root package.json

**Goal:** Make `npm install` from repo root link both existing frontend and future packages into a single workspace. No code moves yet.

**Files:**
- Create: `/Users/shuyuanduann/gds-mission-mock/package.json`

### Steps

- [ ] **Step 1: Create the workspace root `package.json`.**

Write `/Users/shuyuanduann/gds-mission-mock/package.json`:

```json
{
  "name": "openlarm-monorepo",
  "version": "0.0.0",
  "private": true,
  "description": "LARM open-source monorepo: @openlarm/core, @openlarm/regions-taiwan, and the Next.js reference app.",
  "license": "Apache-2.0",
  "workspaces": [
    "packages/*",
    "low-altitude-ops-platform/frontend"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "typecheck": "npm run typecheck --workspaces --if-present",
    "lint": "npm run lint --workspaces --if-present"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Install at the root.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm install
```

Expected: no errors. Creates/updates root `package-lock.json`. `node_modules/` at root contains hoisted dev deps from the existing frontend workspace.

- [ ] **Step 3: Verify the existing frontend still works via the new workspace wiring.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run
npm run build
```

Expected: 34/34 tests pass; build succeeds. No behavioural change — this step is purely about proving the workspace wiring didn't break anything.

- [ ] **Step 4: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add package.json package-lock.json
git commit -m "chore(monorepo): init npm workspaces at repo root

Adds the top-level package.json that declares 'packages/*' and the
existing low-altitude-ops-platform/frontend as workspaces. No new
packages exist yet — Task 2 onwards adds @openlarm/core and
@openlarm/regions-taiwan under packages/.

Plan Task 1 of 13."
```

---

## Task 2: Scaffold `packages/core/` with a smoke test

**Goal:** An empty but fully-wired `@openlarm/core` package that builds, tests, and type-checks. No real code moved yet.

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/vitest.config.ts`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/test/smoke.test.ts`
- Create: `packages/core/.gitignore`

### Steps

- [ ] **Step 1: Create the package.json.**

```json
{
  "name": "@openlarm/core",
  "version": "0.0.0",
  "description": "LARM (Low Altitude Risk Model) reference implementation — deterministic, region-agnostic, zero-runtime-dependency TypeScript core.",
  "keywords": ["larm", "drone", "uav", "risk", "sora", "safety"],
  "homepage": "https://openlarm.org",
  "repository": {
    "type": "git",
    "url": "https://github.com/openlarm/larm.git",
    "directory": "packages/core"
  },
  "license": "Apache-2.0",
  "author": "Shu-Yuan Duann <teddyduann@gmail.com>",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE", "NOTICE"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "devDependencies": {
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^3.2.0"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`.**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "exactOptionalPropertyTypes": false,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "verbatimModuleSyntax": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": []
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules", "test"]
}
```

- [ ] **Step 3: Create `packages/core/tsup.config.ts`.**

```typescript
import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: "es2022",
})
```

- [ ] **Step 4: Create `packages/core/vitest.config.ts`.**

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
  },
})
```

- [ ] **Step 5: Create `packages/core/.gitignore`.**

```gitignore
dist
node_modules
*.tsbuildinfo
```

- [ ] **Step 6: Create a placeholder `src/index.ts`.**

```typescript
// @openlarm/core barrel.
// Populated over the course of the extraction plan; currently empty so the
// workspace wiring and smoke test can run.

export const LARM_CORE_VERSION = "0.0.0"
```

- [ ] **Step 7: Write a smoke test that proves the package loads.**

Create `packages/core/test/smoke.test.ts`:

```typescript
import { describe, it, expect } from "vitest"
import { LARM_CORE_VERSION } from "../src/index.ts"

describe("@openlarm/core smoke test", () => {
  it("exports the version marker", () => {
    expect(LARM_CORE_VERSION).toBe("0.0.0")
  })
})
```

- [ ] **Step 8: Install dev deps at the workspace root to pick up tsup/vitest for the core package.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm install
```

Expected: tsup, vitest, typescript are resolved for `@openlarm/core`.

- [ ] **Step 9: Verify the package builds, type-checks, and tests.**

```bash
npm -w @openlarm/core run build
npm -w @openlarm/core run typecheck
npm -w @openlarm/core run test
```

Expected: build produces `packages/core/dist/index.mjs` + `index.cjs` + `index.d.ts`; typecheck clean; 1/1 smoke test passes.

- [ ] **Step 10: Verify the frontend app is still unaffected.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run
npm run build
```

Expected: 34/34 tests, build success.

- [ ] **Step 11: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add packages/core/ package.json package-lock.json
git commit -m "feat(core): scaffold @openlarm/core package skeleton

Adds an empty but fully-wired @openlarm/core at packages/core/:
- package.json with ESM+CJS conditional exports, sideEffects:false,
  zero runtime deps, provenance-ready publishConfig.
- tsup for dual output (ESM + CJS + .d.ts).
- vitest + one smoke test proving the package loads.
- tsconfig in strict mode, Node 20+ target.

No real code moved yet; the version marker LARM_CORE_VERSION is the
only export. Task 3 adds @openlarm/regions-taiwan with the same shape.

Plan Task 2 of 13."
```

---

## Task 3: Scaffold `packages/regions-taiwan/` with a smoke test

**Goal:** An empty `@openlarm/regions-taiwan` package, same shape as core, ready to receive the Taiwan parameter constants.

**Files:**
- Create: `packages/regions-taiwan/package.json`
- Create: `packages/regions-taiwan/tsconfig.json`
- Create: `packages/regions-taiwan/tsup.config.ts`
- Create: `packages/regions-taiwan/vitest.config.ts`
- Create: `packages/regions-taiwan/src/index.ts`
- Create: `packages/regions-taiwan/test/smoke.test.ts`
- Create: `packages/regions-taiwan/.gitignore`

### Steps

- [ ] **Step 1: Create the package.json.**

```json
{
  "name": "@openlarm/regions-taiwan",
  "version": "0.0.0",
  "description": "Taiwan climate calibration for LARM — parameter values (W-code thresholds, regime weights, region exposure matrix) validated against subtropical drone operations.",
  "keywords": ["larm", "taiwan", "drone", "calibration", "subtropical"],
  "homepage": "https://openlarm.org",
  "repository": {
    "type": "git",
    "url": "https://github.com/openlarm/larm.git",
    "directory": "packages/regions-taiwan"
  },
  "license": "Apache-2.0",
  "author": "Shu-Yuan Duann <teddyduann@gmail.com>",
  "type": "module",
  "sideEffects": false,
  "main": "./dist/index.cjs",
  "module": "./dist/index.mjs",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./package.json": "./package.json"
  },
  "files": ["dist", "README.md", "LICENSE"],
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "clean": "rm -rf dist"
  },
  "peerDependencies": {
    "@openlarm/core": "workspace:*"
  },
  "devDependencies": {
    "@openlarm/core": "workspace:*",
    "tsup": "^8.3.0",
    "typescript": "^5.6.0",
    "vitest": "^3.2.0"
  },
  "publishConfig": {
    "access": "public",
    "provenance": true
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `packages/regions-taiwan/tsconfig.json`.**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "noImplicitOverride": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "types": []
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules", "test"]
}
```

- [ ] **Step 3: Create `packages/regions-taiwan/tsup.config.ts`.**

```typescript
import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  target: "es2022",
  external: ["@openlarm/core"],
})
```

- [ ] **Step 4: Create `packages/regions-taiwan/vitest.config.ts`.**

```typescript
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.{test,spec}.ts"],
  },
})
```

- [ ] **Step 5: Create `.gitignore` and a placeholder `src/index.ts`.**

`.gitignore`:
```gitignore
dist
node_modules
*.tsbuildinfo
```

`src/index.ts`:
```typescript
// @openlarm/regions-taiwan barrel.
// Populated in Task 8 with TAIWAN_PARAMS_V1_0 and TAIWAN_PARAMS_V2_0.
// Currently empty so the workspace wiring and smoke test can run.

export const REGIONS_TAIWAN_VERSION = "0.0.0"
```

- [ ] **Step 6: Create a smoke test.**

`test/smoke.test.ts`:
```typescript
import { describe, it, expect } from "vitest"
import { REGIONS_TAIWAN_VERSION } from "../src/index.ts"

describe("@openlarm/regions-taiwan smoke test", () => {
  it("exports the version marker", () => {
    expect(REGIONS_TAIWAN_VERSION).toBe("0.0.0")
  })
})
```

- [ ] **Step 7: Install workspace deps.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm install
```

- [ ] **Step 8: Verify build + test + typecheck.**

```bash
npm -w @openlarm/regions-taiwan run build
npm -w @openlarm/regions-taiwan run typecheck
npm -w @openlarm/regions-taiwan run test
```

Expected: clean build, 1/1 smoke test passes.

- [ ] **Step 9: Verify frontend is still unaffected.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run
npm run build
```

- [ ] **Step 10: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add packages/regions-taiwan/ package-lock.json
git commit -m "feat(regions-taiwan): scaffold @openlarm/regions-taiwan package skeleton

Same shape as @openlarm/core — empty but fully-wired package at
packages/regions-taiwan/. Declares @openlarm/core as a peer dependency
(workspace link during development, published range constraint applied
in Task 12). Ready to receive the Taiwan parameter constants in Task 8.

Plan Task 3 of 13."
```

---

## Task 4: Wire Next.js `transpilePackages` + add workspace deps to the frontend

**Goal:** Next.js consumes the two packages as raw TypeScript (via `transpilePackages`), so the dev/build loop works without a separate `tsup build` step. The frontend's `package.json` declares workspace-linked deps.

**Files:**
- Modify: `low-altitude-ops-platform/frontend/next.config.ts`
- Modify: `low-altitude-ops-platform/frontend/package.json`

### Steps

- [ ] **Step 1: Add `transpilePackages` to `next.config.ts`.**

Read the current file first (`low-altitude-ops-platform/frontend/next.config.ts`). Locate the default-export config object. Add (or merge) the `transpilePackages` field:

```typescript
const nextConfig: NextConfig = {
  // ... existing fields ...
  transpilePackages: ["@openlarm/core", "@openlarm/regions-taiwan"],
}
```

- [ ] **Step 2: Add workspace deps to `low-altitude-ops-platform/frontend/package.json`.**

Locate the `"dependencies"` block and add:

```json
    "@openlarm/core": "workspace:*",
    "@openlarm/regions-taiwan": "workspace:*",
```

- [ ] **Step 3: Re-install to refresh symlinks.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm install
```

Verify the symlinks:
```bash
ls -l low-altitude-ops-platform/frontend/node_modules/@openlarm/
```

Expected: `core -> ../../packages/core` and `regions-taiwan -> ../../packages/regions-taiwan`.

- [ ] **Step 4: Verify frontend builds and tests still pass.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run
npm run build
```

Expected: 34/34 + build success. The packages export only version markers so far, so the frontend doesn't actually import anything from them yet.

- [ ] **Step 5: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add low-altitude-ops-platform/frontend/next.config.ts \
        low-altitude-ops-platform/frontend/package.json \
        package-lock.json
git commit -m "build(frontend): wire @openlarm workspace packages via transpilePackages

next.config.ts now transpiles @openlarm/core and @openlarm/regions-taiwan
from raw TypeScript. The frontend package.json declares workspace links
to both. No runtime imports yet — this step just unlocks dev-loop
integration for the moves in Tasks 5–10.

Plan Task 4 of 13."
```

---

## Task 5: Extract core types into `@openlarm/core`

**Goal:** Move the region-agnostic type declarations from `frontend/src/lib/types.ts` into `packages/core/src/types/index.ts`. The frontend file re-exports them plus its app-only types, so every existing importer (`@/lib/types`) keeps working.

Core types (move to package):
- `WeatherType`, `RiskLevel`, `Decision`, `Complexity`, `PopulationDensityClass`, `SORAMitigation`, `EquipmentBlockCategory`, `EquipmentWarnCategory`, `RegionExposure`, `CrowdDensity`, `OperatorExperience`
- `Weather30dInput`, `WeatherTodayInput`, `BuildingSiteInput`, `OperationalContextInput`, `Equipment`, `LARMInput`
- `RiskResult`, `RiskExplanation`, `WeatherRegimeResult`, `LARMVersions`

App-only types (stay in frontend):
- `MissionType`, `BuildingType`, `AirspaceStatus`, `FacadeMaterial`, `Contamination`, `CleaningAgent`, `TimeWindow`, `RooftopAccess`, `Supply`, `QualCheckResult`, `HealthStatus`
- `Mission`, `FacadeData`, `Address`, `PricingParams`-related types, `ForecastLogEntry`, `ForecastBiasCorrection`, `AirspaceResult`, anything UI-specific

**Files:**
- Create: `packages/core/src/types/index.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/types.ts`
- Modify: `packages/core/src/index.ts`

### Steps

- [ ] **Step 1: Create `packages/core/src/types/index.ts`.**

Read `frontend/src/lib/types.ts` in full. Copy the type declarations for every item in the "core types" list above — verbatim, including every JSDoc comment — into a new file `packages/core/src/types/index.ts`. Example excerpt (actual file is longer; transcribe the whole relevant block):

```typescript
// LARM core types. Region-agnostic, no UI concerns, no runtime values.
// These types are the public contract of @openlarm/core.

export type WeatherType = "W0" | "W1" | "W2" | "W3" | "W4" | "W5"
export type RiskLevel = "R0" | "R1" | "R2" | "R3" | "R4"
export type Decision = "GO" | "CONDITIONAL" | "NO_GO"
export type Complexity = "light" | "medium" | "heavy"

export type PopulationDensityClass = "assembly" | "high_urban" | "residential" | "light" | "isolated"
export type SORAMitigation = "M1A" | "M1B" | "M1C"
export type EquipmentBlockCategory = "B1" | "B2" | "B3"
export type EquipmentWarnCategory = "W1" | "W2" | "W3" | "W4" | "W5" | "W6"

export type RegionExposure = "windward" | "leeward" | "coastal" | "rooftop_open"
export type CrowdDensity = "low" | "medium" | "high"
export type OperatorExperience = "junior" | "mid" | "senior"

// ... continue transcribing Weather30dInput, WeatherTodayInput,
//     BuildingSiteInput, OperationalContextInput, Equipment, LARMInput,
//     RiskResult, RiskExplanation, WeatherRegimeResult, LARMVersions
```

**Do not** copy `BuildingType`, `CleaningAgent`, `TimeWindow`, `RooftopAccess`, `Supply`, `Contamination`, `MissionType`, `AirspaceStatus`, `FacadeMaterial`, `Mission`, `FacadeData`, `Address`, `PricingParams`-adjacent types, `ForecastLogEntry`, `ForecastBiasCorrection`, `AirspaceResult`, `HealthStatus`, `QualCheckResult` — those stay in the frontend.

- [ ] **Step 2: Update `packages/core/src/index.ts` to re-export the types.**

```typescript
export const LARM_CORE_VERSION = "0.1.0-alpha.0"

export type {
  // Enum-like unions
  WeatherType,
  RiskLevel,
  Decision,
  Complexity,
  PopulationDensityClass,
  SORAMitigation,
  EquipmentBlockCategory,
  EquipmentWarnCategory,
  RegionExposure,
  CrowdDensity,
  OperatorExperience,
  // Input schemas
  Weather30dInput,
  WeatherTodayInput,
  BuildingSiteInput,
  OperationalContextInput,
  Equipment,
  LARMInput,
  // Output schemas
  RiskResult,
  RiskExplanation,
  WeatherRegimeResult,
  LARMVersions,
} from "./types/index.ts"
```

- [ ] **Step 3: Rewrite `frontend/src/lib/types.ts` to re-export + augment.**

At the top of `frontend/src/lib/types.ts`, replace the moved type declarations with re-exports:

```typescript
// App-level type re-exports + augments.
//
// Core domain types (WeatherType, LARMInput, RiskResult, etc.) live in
// @openlarm/core. This file re-exports them so the 24+ in-app importers
// of "@/lib/types" keep working, then adds the app-only types below.

export type {
  WeatherType,
  RiskLevel,
  Decision,
  Complexity,
  PopulationDensityClass,
  SORAMitigation,
  EquipmentBlockCategory,
  EquipmentWarnCategory,
  RegionExposure,
  CrowdDensity,
  OperatorExperience,
  Weather30dInput,
  WeatherTodayInput,
  BuildingSiteInput,
  OperationalContextInput,
  Equipment,
  LARMInput,
  RiskResult,
  RiskExplanation,
  WeatherRegimeResult,
  LARMVersions,
} from "@openlarm/core"

// ─── App-only types (retained here) ─────────────────────────────────────
// MissionType, BuildingType, AirspaceStatus, FacadeMaterial, Contamination,
// CleaningAgent, TimeWindow, RooftopAccess, Supply, QualCheckResult,
// HealthStatus, Mission, FacadeData, Address, ForecastLogEntry,
// ForecastBiasCorrection, AirspaceResult, (plus any others found).

// ... keep the original declarations for those types here ...
```

Be surgical: keep every app-only type verbatim where it was. Only delete the duplicated core-type declarations.

- [ ] **Step 4: Run the full suite + typecheck + build.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm -w @openlarm/core run typecheck
npm -w @openlarm/core run test
cd low-altitude-ops-platform/frontend
npm run typecheck
npm run lint
npm test -- --run
npm run build
```

Expected: core typecheck + smoke test pass; frontend typecheck clean (or at most pre-existing `.next/` generated errors); frontend 34/34; build succeeds.

If any importer breaks because an app-only type was accidentally moved, move it back to `frontend/src/lib/types.ts`. If any core importer references a non-core type, audit which category that type really belongs in.

- [ ] **Step 5: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add packages/core/src/types/ packages/core/src/index.ts \
        low-altitude-ops-platform/frontend/src/lib/types.ts
git commit -m "feat(core): move region-agnostic types into @openlarm/core

Moves every core domain type (WeatherType, RiskLevel, LARMInput,
RiskResult, WeatherRegimeParams dependencies, etc.) from
frontend/src/lib/types.ts into packages/core/src/types/index.ts.

frontend/src/lib/types.ts now re-exports them from @openlarm/core and
keeps the app-only types (Mission, FacadeData, BuildingType,
PricingParams concerns, etc.) inline. All 24 in-app importers of
\"@/lib/types\" continue to resolve the same names unchanged.

Plan Task 5 of 13."
```

---

## Task 6: Move the params schema + strip pricing from `WeatherRegimeParams`

**Goal:** Move the schema types for `WeatherRegimeParams` (and all its nested interfaces) into `@openlarm/core`. Strip the `pricing: PricingParams` field from the schema — core is no longer price-aware. Move `quote_max_multiplier` to `PricingParams` in the frontend. `pricing-engine.ts` stops reading anything from `WeatherRegimeParams`.

**Files:**
- Create: `packages/core/src/params/schema.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/pricing-params.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/pricing-engine.ts`

### Steps

- [ ] **Step 1: Create `packages/core/src/params/schema.ts`.**

Transcribe every type/interface from `frontend/src/lib/engines/weather-regime-params.ts` that is pure schema, **except** the pricing field. That means:

- `WCode`, `RegionKey`, `RegimeEntry`, `WindScoreRow`, `RLevelRow`, `WeatherNowWeights`, `BufferCoefficients`, `UIInferThresholds`, `GScoreConfig`, `EScoreConfig`, `EDRThreshold`, `HardStopThresholds`, and any other type declarations used inside `WeatherRegimeParams`.
- `WeatherRegimeParams` itself — **delete the `pricing: PricingParams` field** from the declaration.
- **Also delete** `quote_max_multiplier` from `WeatherRegimeParams` if it is currently a top-level field.

Before writing, grep the current file for every interface/type + for `quote_max_multiplier` to ensure you capture the full surface.

Example shape (adjust to match actual declarations):

```typescript
export type WCode = "W0" | "W1" | "W2" | "W3" | "W4" | "W5"
export type RegionKey = "windward" | "leeward" | "coastal" | "rooftop_open"

export interface RegimeEntry {
  name: string
  base_score: number
  volatility_profile: string
  instability_weight: number
  predictability_weight: number
  notes: string
}

// ... (all other nested types verbatim from the original) ...

/**
 * LARM WeatherRegimeParams — the complete set of tunable parameters
 * for a single region's model calibration. Region adapters (e.g.
 * @openlarm/regions-taiwan) export concrete values that satisfy this
 * shape.
 *
 * Note: `pricing` and `quote_max_multiplier` are NOT part of this schema.
 * Pricing parameters are owned by app-layer packages (e.g. frontend's
 * PricingParams) — see OPEN_SOURCE_DECOUPLING_AUDIT.md §2.4.
 */
export interface WeatherRegimeParams {
  version: string
  regimes: Record<WCode, RegimeEntry>
  thresholds: {
    wind_score_table: WindScoreRow[]
    wind_weight_scale: number
    rain_score_rules: { /* ... */ }
    mapping_r_level: RLevelRow[]
    hard_stop: HardStopThresholds
  }
  weather_now_weights: WeatherNowWeights
  buffer_coefficients: BufferCoefficients
  ui_infer_thresholds: UIInferThresholds
  g_score_config: GScoreConfig
  e_score_config: EScoreConfig
  o_score_cap: number
  r4_nogo_threshold: number
  w5_typhoon_trend_threshold: number
  w5_typhoon_trend_bonus: number
  wr_matrix: Record<WCode, Record<RiskLevel, "go" | "cond" | "nogo">>
  region_weight_table: Record<WCode, Partial<Record<RegionKey, number>>>
  volatility_buffer_add: Record<WCode, number>
  edr_thresholds: EDRThreshold[]
}
```

- [ ] **Step 2: Update `packages/core/src/index.ts` to re-export the schema.**

Append to the `export type` block:

```typescript
export type {
  WCode,
  RegionKey,
  RegimeEntry,
  WindScoreRow,
  RLevelRow,
  WeatherNowWeights,
  BufferCoefficients,
  UIInferThresholds,
  GScoreConfig,
  EScoreConfig,
  EDRThreshold,
  HardStopThresholds,
  WeatherRegimeParams,
} from "./params/schema.ts"
```

- [ ] **Step 3: Modify `frontend/src/lib/engines/weather-regime-params.ts` to re-export the schema.**

Delete the transcribed type declarations. Replace with:

```typescript
// Thin re-export layer. Schema types live in @openlarm/core; numeric
// defaults live in @openlarm/regions-taiwan (hooked up in Task 8).

export type {
  WCode,
  RegionKey,
  RegimeEntry,
  WindScoreRow,
  RLevelRow,
  WeatherNowWeights,
  BufferCoefficients,
  UIInferThresholds,
  GScoreConfig,
  EScoreConfig,
  EDRThreshold,
  HardStopThresholds,
  WeatherRegimeParams,
} from "@openlarm/core"

// Existing runtime exports (WEATHER_REGIME_PARAMS_V1, _V2, PARAM_REGISTRY,
// ACTIVE_PARAMS_VERSION, resolveParams, getParams) remain in place for
// now — Task 7 moves resolveParams/PARAM_REGISTRY into core and Task 8
// moves the numeric values into regions-taiwan.
```

Keep the existing numeric constants `WEATHER_REGIME_PARAMS_V1`, `WEATHER_REGIME_PARAMS_V2`, `PARAM_REGISTRY`, `ACTIVE_PARAMS_VERSION`, `resolveParams`, `getParams` in place — Tasks 7 and 8 move them out.

**Important adjustment to the runtime constants**: the existing `WEATHER_REGIME_PARAMS_V1` and `_V2` objects in this file contain a `pricing: PRICING_PARAMS_DEFAULT` field and possibly `quote_max_multiplier`. Because the schema no longer declares those, TypeScript will reject the assignment.

Resolution: remove the `pricing` and `quote_max_multiplier` properties from the two constant literals. For `quote_max_multiplier`, also drop its `PricingParams` counterpart assignment later in Step 4.

- [ ] **Step 4: Move `quote_max_multiplier` into `PricingParams`.**

Read `frontend/src/lib/engines/pricing-params.ts`. Add `quote_max_multiplier: number` to the `PricingParams` interface declaration (pick the semantically-correct position, typically next to the other caps/multipliers). Add the corresponding numeric value to `PRICING_PARAMS_DEFAULT` (the old value from `WeatherRegimeParams`, currently `4.5` for v2.0 — grep the existing file to confirm).

- [ ] **Step 5: Rewrite the `maxMult` resolution inside `pricing-engine.ts`.**

Read `frontend/src/lib/engines/pricing-engine.ts`. Find the line:

```typescript
const W = options.params ?? resolveParams()
// ... later ...
const maxMult = W.quote_max_multiplier
```

Replace with:

```typescript
// quote_max_multiplier moved out of WeatherRegimeParams — pricing is no
// longer core-coupled (see OPEN_SOURCE_DECOUPLING_AUDIT.md §2.4 ⑧).
const maxMult = P.quote_max_multiplier
```

Where `P` is the `PricingParams` already resolved earlier in the function. Delete the now-unused `W = options.params ?? resolveParams()` line and the `import { resolveParams, type WeatherRegimeParams } from "./weather-regime-params"` line if they become dead code after removal. Also remove the `params?: WeatherRegimeParams` field from `GenerateQuoteOptions` — it is obsolete.

- [ ] **Step 6: Run the full suite.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm -w @openlarm/core run typecheck
npm -w @openlarm/core run test
cd low-altitude-ops-platform/frontend
npm run typecheck
npm test -- --run
npm run build
```

Expected: all green. If the pricing test breaks because it passed `params: fixedParams` in `GenerateQuoteOptions`, update the test to drop that now-obsolete field.

- [ ] **Step 7: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add packages/core/src/params/ packages/core/src/index.ts \
        low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts \
        low-altitude-ops-platform/frontend/src/lib/engines/pricing-params.ts \
        low-altitude-ops-platform/frontend/src/lib/engines/pricing-engine.ts \
        low-altitude-ops-platform/frontend/src/lib/engines/__tests__/pricing-engine.test.ts
git commit -m "refactor(params): move WeatherRegimeParams schema to core, decouple pricing

- packages/core/src/params/schema.ts owns the schema types
  (WeatherRegimeParams and every nested interface), minus the
  previously-embedded pricing field.
- quote_max_multiplier moves from WeatherRegimeParams to PricingParams
  (frontend/src/lib/engines/pricing-params.ts), severing the
  pricing-engine -> risk-engine reverse dependency documented in
  OPEN_SOURCE_DECOUPLING_AUDIT.md §2.4 ⑧.
- generateQuote's options.params (WeatherRegimeParams) field is
  removed — pricing now consumes only PricingParams.
- Numeric runtime constants (WEATHER_REGIME_PARAMS_V1/_V2,
  PARAM_REGISTRY, resolveParams, getParams) still live in the
  frontend's thin re-export layer; Tasks 7 & 8 move them out.

Plan Task 6 of 13."
```

---

## Task 7: Move `resolveParams` / `mergeParams` / `PARAM_REGISTRY` into core

**Goal:** The pure merge function and the registry (empty by default) live in `@openlarm/core`. Region adapters populate the registry.

**Files:**
- Create: `packages/core/src/params/merge.ts`
- Create: `packages/core/src/params/registry.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts`

### Steps

- [ ] **Step 1: Create `packages/core/src/params/registry.ts`.**

```typescript
import type { WeatherRegimeParams } from "./schema.ts"

/**
 * The default parameter-schema version. Region adapters SHOULD populate
 * PARAM_REGISTRY with at least this version; otherwise resolveParams(version)
 * returns `undefined` and callers must provide `base` explicitly.
 */
export const ACTIVE_PARAMS_VERSION = "v2.0"

/**
 * Empty by default. Region adapter packages (e.g. @openlarm/regions-taiwan)
 * call registerParams() to populate it on import.
 */
export const PARAM_REGISTRY: Record<string, WeatherRegimeParams> = Object.create(null)

/**
 * Register a version's parameter set. Idempotent: re-registering the same
 * version replaces the previous entry (warn in dev, silent in prod —
 * handled by the caller).
 */
export function registerParams(version: string, params: WeatherRegimeParams): void {
  PARAM_REGISTRY[version] = params
}
```

- [ ] **Step 2: Create `packages/core/src/params/merge.ts`.**

```typescript
import type { WeatherRegimeParams } from "./schema.ts"
import { PARAM_REGISTRY, ACTIVE_PARAMS_VERSION } from "./registry.ts"

/**
 * Merge a partial override onto a base WeatherRegimeParams and return
 * the merged result. Pure function.
 *
 * Merge semantics:
 * - Top-level fields in `override` replace the base field wholesale.
 *   If you override a nested object (e.g. regimes, wr_matrix), you
 *   MUST supply the full sub-object or omitted siblings will be wiped.
 */
export function mergeParams(
  base: WeatherRegimeParams,
  override: Partial<WeatherRegimeParams>,
): WeatherRegimeParams {
  return { ...base, ...override }
}

/**
 * Resolve parameters by version. Returns `undefined` if the requested
 * version has not been registered (e.g. no region adapter has loaded).
 * Callers can pass `override` to apply a partial merge on top of the
 * resolved base.
 *
 * For region-agnostic tests and engines that need a guaranteed result,
 * prefer passing a concrete `base` directly.
 */
export function resolveParams(
  version: string = ACTIVE_PARAMS_VERSION,
  override?: Partial<WeatherRegimeParams>,
): WeatherRegimeParams | undefined {
  const base = PARAM_REGISTRY[version]
  if (!base) return undefined
  return override ? mergeParams(base, override) : base
}
```

- [ ] **Step 3: Update `packages/core/src/index.ts` to export these.**

```typescript
export {
  ACTIVE_PARAMS_VERSION,
  PARAM_REGISTRY,
  registerParams,
} from "./params/registry.ts"

export {
  mergeParams,
  resolveParams,
} from "./params/merge.ts"
```

- [ ] **Step 4: Write tests in `packages/core/test/params.test.ts`.**

```typescript
import { describe, it, expect, beforeEach } from "vitest"
import {
  ACTIVE_PARAMS_VERSION,
  PARAM_REGISTRY,
  registerParams,
  resolveParams,
  mergeParams,
  type WeatherRegimeParams,
} from "../src/index.ts"

const fakeParams: WeatherRegimeParams = {
  version: "test",
  regimes: {} as WeatherRegimeParams["regimes"],
  thresholds: {} as WeatherRegimeParams["thresholds"],
  weather_now_weights: {} as WeatherRegimeParams["weather_now_weights"],
  buffer_coefficients: {} as WeatherRegimeParams["buffer_coefficients"],
  ui_infer_thresholds: {} as WeatherRegimeParams["ui_infer_thresholds"],
  g_score_config: {} as WeatherRegimeParams["g_score_config"],
  e_score_config: {} as WeatherRegimeParams["e_score_config"],
  o_score_cap: 12,
  r4_nogo_threshold: 92,
  w5_typhoon_trend_threshold: 3.6,
  w5_typhoon_trend_bonus: 2,
  wr_matrix: {} as WeatherRegimeParams["wr_matrix"],
  region_weight_table: {} as WeatherRegimeParams["region_weight_table"],
  volatility_buffer_add: {} as WeatherRegimeParams["volatility_buffer_add"],
  edr_thresholds: [],
}

describe("resolveParams", () => {
  beforeEach(() => {
    // Clean the registry between tests (it is a module-level mutable map)
    for (const key of Object.keys(PARAM_REGISTRY)) delete PARAM_REGISTRY[key]
  })

  it("returns undefined when no version is registered", () => {
    expect(resolveParams()).toBeUndefined()
    expect(resolveParams("v2.0")).toBeUndefined()
  })

  it("returns the registered base when no override is given", () => {
    registerParams("v2.0", fakeParams)
    const result = resolveParams("v2.0")
    expect(result).toBe(fakeParams)
  })

  it("defaults version to ACTIVE_PARAMS_VERSION", () => {
    registerParams(ACTIVE_PARAMS_VERSION, fakeParams)
    expect(resolveParams()).toBe(fakeParams)
  })

  it("merges an override on top of the base", () => {
    registerParams("v2.0", fakeParams)
    const result = resolveParams("v2.0", { r4_nogo_threshold: 80 })
    expect(result?.r4_nogo_threshold).toBe(80)
    expect(result?.o_score_cap).toBe(12)  // untouched
  })
})

describe("mergeParams", () => {
  it("is a pure shallow merge", () => {
    const result = mergeParams(fakeParams, { r4_nogo_threshold: 77 })
    expect(result.r4_nogo_threshold).toBe(77)
    expect(result.o_score_cap).toBe(fakeParams.o_score_cap)
    expect(result).not.toBe(fakeParams)
  })
})

describe("registerParams", () => {
  it("populates PARAM_REGISTRY under the given version key", () => {
    registerParams("custom", fakeParams)
    expect(PARAM_REGISTRY.custom).toBe(fakeParams)
  })
})
```

- [ ] **Step 5: Verify.**

```bash
npm -w @openlarm/core run typecheck
npm -w @openlarm/core run test
```

Expected: 1 smoke + 9 new = 10 tests in core, all green.

- [ ] **Step 6: Modify `frontend/src/lib/engines/weather-regime-params.ts` to bridge to core.**

The frontend's existing `resolveParams(version, override?)` signature reads from an internal registry populated by `WEATHER_REGIME_PARAMS_V1/V2` constants. Now:

```typescript
// Thin re-export layer. Schema types live in @openlarm/core; numeric
// defaults live in @openlarm/regions-taiwan. The existing
// resolveParams / getParams / PARAM_REGISTRY exports stay live for
// backward compat with in-app callers, but the registry is now
// populated by the regions-taiwan side-effect import below.

import {
  ACTIVE_PARAMS_VERSION as CORE_ACTIVE_VERSION,
  registerParams,
  resolveParams as coreResolveParams,
  mergeParams,
  type WeatherRegimeParams,
} from "@openlarm/core"

import {
  TAIWAN_PARAMS_V1_0,
  TAIWAN_PARAMS_V2_0,
} from "@openlarm/regions-taiwan"

export type { WeatherRegimeParams } from "@openlarm/core"
export type {
  WCode,
  RegionKey,
  RegimeEntry,
  WindScoreRow,
  RLevelRow,
  WeatherNowWeights,
  BufferCoefficients,
  UIInferThresholds,
  GScoreConfig,
  EScoreConfig,
  EDRThreshold,
  HardStopThresholds,
} from "@openlarm/core"

// Populate the core registry with Taiwan's defaults. Importing this
// module anywhere in the app triggers registration (side effect).
registerParams("v1.0", TAIWAN_PARAMS_V1_0)
registerParams("v2.0", TAIWAN_PARAMS_V2_0)

// Back-compat constants (unchanged names so 24 in-app importers still work).
export const WEATHER_REGIME_PARAMS_V1 = TAIWAN_PARAMS_V1_0
export const WEATHER_REGIME_PARAMS_V2 = TAIWAN_PARAMS_V2_0
export const PARAM_REGISTRY: Record<string, WeatherRegimeParams> = {
  "v1.0": TAIWAN_PARAMS_V1_0,
  "v2.0": TAIWAN_PARAMS_V2_0,
}
export const ACTIVE_PARAMS_VERSION = CORE_ACTIVE_VERSION

/**
 * @deprecated Import `resolveParams` from `@openlarm/core` directly and
 * pass an explicit base from `@openlarm/regions-taiwan`. This wrapper
 * keeps the frontend's existing call sites working until Task 3 of
 * OPEN_SOURCE_TASK_3_PLAN.md is fully rolled out.
 */
export function resolveParams(
  version: string = ACTIVE_PARAMS_VERSION,
  override?: Partial<WeatherRegimeParams>,
): WeatherRegimeParams {
  const result = coreResolveParams(version, override)
  if (!result) throw new Error(`Unknown params version: ${version}`)
  return result
}

/**
 * @deprecated Same as resolveParams(version). Returns the defaults only
 * (no browser access). Keeps compiling for in-app callers.
 */
export function getParams(version: string = ACTIVE_PARAMS_VERSION): WeatherRegimeParams {
  return resolveParams(version)
}
```

Note: this step depends on `TAIWAN_PARAMS_V1_0`/`V2_0` being exported from `@openlarm/regions-taiwan`, which happens in Task 8. **To unblock the intermediate state**, split this commit into two sub-commits: (a) add the `registerParams` wiring here but keep the local numeric constants as the actual data source, then (b) flip to `TAIWAN_PARAMS_V*` imports once Task 8 lands. To keep the plan simple, do Task 8 BEFORE finalizing Task 7's `weather-regime-params.ts` rewrite — see the Task 8 note below.

**Actual ordering:** finish Task 7 Steps 1–5 (core additions + tests) and commit. Do NOT yet rewrite `frontend/src/lib/engines/weather-regime-params.ts` in Task 7 — leave that for Task 8 Step 5 once the Taiwan constants are available in the new package.

- [ ] **Step 7: Commit (core-only part of Task 7).**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add packages/core/src/params/merge.ts \
        packages/core/src/params/registry.ts \
        packages/core/src/index.ts \
        packages/core/test/params.test.ts
git commit -m "feat(core): add mergeParams / resolveParams / PARAM_REGISTRY

@openlarm/core now exposes a pure merge helper, a registerable
parameter registry (empty by default), and a thin resolveParams()
wrapper that consults the registry.

Region adapters (e.g. @openlarm/regions-taiwan) call registerParams()
on import to install their calibration. If no adapter is loaded,
resolveParams() returns undefined and callers are expected to supply
a concrete base directly.

Covered by 9 new tests. The frontend's weather-regime-params.ts keeps
its local constants for now — Task 8 migrates them to
@openlarm/regions-taiwan.

Plan Task 7 of 13."
```

---

## Task 8: Move Taiwan parameter constants into `@openlarm/regions-taiwan`

**Goal:** `WEATHER_REGIME_PARAMS_V1` / `WEATHER_REGIME_PARAMS_V2` (minus pricing, minus quote_max_multiplier) become `TAIWAN_PARAMS_V1_0` / `TAIWAN_PARAMS_V2_0` in `@openlarm/regions-taiwan`. The frontend's `weather-regime-params.ts` becomes a thin bridge.

**Files:**
- Create: `packages/regions-taiwan/src/v1.ts`
- Create: `packages/regions-taiwan/src/v2.ts`
- Modify: `packages/regions-taiwan/src/index.ts`
- Create: `packages/regions-taiwan/test/params.test.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts`

### Steps

- [ ] **Step 1: Create `packages/regions-taiwan/src/v2.ts`.**

Open `frontend/src/lib/engines/weather-regime-params.ts` and find `WEATHER_REGIME_PARAMS_V2` (the larger numeric object literal). Copy it verbatim into `packages/regions-taiwan/src/v2.ts`, with these adjustments:

- Rename the exported constant: `export const TAIWAN_PARAMS_V2_0: WeatherRegimeParams = { ... }`.
- Import the type: `import type { WeatherRegimeParams } from "@openlarm/core"`.
- Delete the `pricing: PRICING_PARAMS_DEFAULT` field from the literal.
- Delete the `quote_max_multiplier: …` field from the literal.
- Ensure `version: "v2.0"` is set.

- [ ] **Step 2: Create `packages/regions-taiwan/src/v1.ts`.**

Same treatment for `WEATHER_REGIME_PARAMS_V1` → `TAIWAN_PARAMS_V1_0`. Set `version: "v1.0"`.

- [ ] **Step 3: Update `packages/regions-taiwan/src/index.ts`.**

```typescript
export { TAIWAN_PARAMS_V1_0 } from "./v1.ts"
export { TAIWAN_PARAMS_V2_0 } from "./v2.ts"

// Convenience pointer to the currently-recommended Taiwan calibration.
import { TAIWAN_PARAMS_V2_0 } from "./v2.ts"
export const TAIWAN_PARAMS_ACTIVE = TAIWAN_PARAMS_V2_0

export const REGIONS_TAIWAN_VERSION = "0.1.0-alpha.0"
```

- [ ] **Step 4: Write a regression test in `packages/regions-taiwan/test/params.test.ts`.**

```typescript
import { describe, it, expect } from "vitest"
import {
  TAIWAN_PARAMS_V1_0,
  TAIWAN_PARAMS_V2_0,
  TAIWAN_PARAMS_ACTIVE,
} from "../src/index.ts"

describe("@openlarm/regions-taiwan defaults", () => {
  it("v1.0 has version marker", () => {
    expect(TAIWAN_PARAMS_V1_0.version).toBe("v1.0")
  })
  it("v2.0 has version marker", () => {
    expect(TAIWAN_PARAMS_V2_0.version).toBe("v2.0")
  })
  it("v2.0 sets r4_nogo_threshold to 92", () => {
    expect(TAIWAN_PARAMS_V2_0.r4_nogo_threshold).toBe(92)
  })
  it("v2.0 has the 6 W-regime entries", () => {
    const w = TAIWAN_PARAMS_V2_0.regimes
    expect(Object.keys(w).sort()).toEqual(["W0", "W1", "W2", "W3", "W4", "W5"])
  })
  it("has no pricing field (core is price-agnostic)", () => {
    expect("pricing" in TAIWAN_PARAMS_V2_0).toBe(false)
    expect("quote_max_multiplier" in TAIWAN_PARAMS_V2_0).toBe(false)
  })
  it("TAIWAN_PARAMS_ACTIVE equals TAIWAN_PARAMS_V2_0", () => {
    expect(TAIWAN_PARAMS_ACTIVE).toBe(TAIWAN_PARAMS_V2_0)
  })
})
```

- [ ] **Step 5: Modify `frontend/src/lib/engines/weather-regime-params.ts`.**

Replace the full file with the bridge version documented in Task 7 Step 6 (reproduced here for convenience):

```typescript
// Thin re-export layer. Schema types live in @openlarm/core; numeric
// defaults live in @openlarm/regions-taiwan.

import {
  ACTIVE_PARAMS_VERSION as CORE_ACTIVE_VERSION,
  registerParams,
  resolveParams as coreResolveParams,
  type WeatherRegimeParams,
} from "@openlarm/core"

import {
  TAIWAN_PARAMS_V1_0,
  TAIWAN_PARAMS_V2_0,
} from "@openlarm/regions-taiwan"

export type { WeatherRegimeParams } from "@openlarm/core"
export type {
  WCode,
  RegionKey,
  RegimeEntry,
  WindScoreRow,
  RLevelRow,
  WeatherNowWeights,
  BufferCoefficients,
  UIInferThresholds,
  GScoreConfig,
  EScoreConfig,
  EDRThreshold,
  HardStopThresholds,
} from "@openlarm/core"

registerParams("v1.0", TAIWAN_PARAMS_V1_0)
registerParams("v2.0", TAIWAN_PARAMS_V2_0)

export const WEATHER_REGIME_PARAMS_V1 = TAIWAN_PARAMS_V1_0
export const WEATHER_REGIME_PARAMS_V2 = TAIWAN_PARAMS_V2_0
export const PARAM_REGISTRY: Record<string, WeatherRegimeParams> = {
  "v1.0": TAIWAN_PARAMS_V1_0,
  "v2.0": TAIWAN_PARAMS_V2_0,
}
export const ACTIVE_PARAMS_VERSION = CORE_ACTIVE_VERSION

/**
 * @deprecated Import `resolveParams` from `@openlarm/core` and the
 * base params from `@openlarm/regions-taiwan` instead.
 */
export function resolveParams(
  version: string = ACTIVE_PARAMS_VERSION,
  override?: Partial<WeatherRegimeParams>,
): WeatherRegimeParams {
  const result = coreResolveParams(version, override)
  if (!result) throw new Error(`Unknown params version: ${version}`)
  return result
}

/**
 * @deprecated Same as resolveParams(version). Returns pure defaults only.
 */
export function getParams(version: string = ACTIVE_PARAMS_VERSION): WeatherRegimeParams {
  return resolveParams(version)
}
```

- [ ] **Step 6: Verify.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm -w @openlarm/core run test
npm -w @openlarm/regions-taiwan run test
cd low-altitude-ops-platform/frontend
npm run typecheck
npm test -- --run
npm run build
```

Expected: core 10/10, regions-taiwan 1+6=7/7, frontend 34/34, build green.

- [ ] **Step 7: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add packages/regions-taiwan/src/ packages/regions-taiwan/test/ \
        low-altitude-ops-platform/frontend/src/lib/engines/weather-regime-params.ts
git commit -m "feat(regions-taiwan): move V1/V2 numeric defaults out of frontend

The Taiwan parameter sets (WEATHER_REGIME_PARAMS_V1 and _V2) move into
packages/regions-taiwan/src/ as TAIWAN_PARAMS_V1_0 and TAIWAN_PARAMS_V2_0.
Each constant is stripped of the pricing and quote_max_multiplier fields
that were retired in Task 6.

frontend/src/lib/engines/weather-regime-params.ts becomes a thin bridge:
it re-exports the schema types from @openlarm/core, pulls the defaults
from @openlarm/regions-taiwan, and populates @openlarm/core's registry
via registerParams() as a side effect of being imported.

Backward-compat surface (WEATHER_REGIME_PARAMS_V1/_V2, PARAM_REGISTRY,
ACTIVE_PARAMS_VERSION, resolveParams, getParams) is preserved so every
in-app caller keeps working without changes.

Plan Task 8 of 13."
```

---

## Task 9: Move `risk-engine.ts` and `model-helpers.ts` into core

**Goal:** The two pure engine files live in `packages/core/src/engines/`. The frontend's copies become one-line re-exports (plus the two frontend-only helpers `buildingSiteFromMission` / `operationalContextFromMission`, which take `Mission` — an app-layer type).

**Files:**
- Create: `packages/core/src/engines/risk-engine.ts`
- Create: `packages/core/src/engines/model-helpers.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/risk-engine.ts`
- Modify: `low-altitude-ops-platform/frontend/src/lib/engines/model-helpers.ts`

### Steps

- [ ] **Step 1: Copy `risk-engine.ts` to core, minus the Mission-dependent helpers.**

Read `frontend/src/lib/engines/risk-engine.ts`. Copy its contents to `packages/core/src/engines/risk-engine.ts` with these changes:

- Rewrite all imports:
  - `import type { ... } from "../types"` → `import type { ... } from "../types/index.ts"`
  - `import { resolveParams, ACTIVE_PARAMS_VERSION, type WeatherRegimeParams } from "./weather-regime-params"` → `import { resolveParams, ACTIVE_PARAMS_VERSION } from "../params/merge.ts"` (adjust to actual relative path) and `import type { WeatherRegimeParams } from "../params/schema.ts"`
- **Delete** `buildingSiteFromMission()` and `operationalContextFromMission()` from the core copy — they reference `Mission`, which is an app-only type. They'll remain in the frontend file as local helpers.
- Keep `evaluateRisk`, `classifyWeatherRegimeWithParams`, `computeWeatherNow`, `computeGScore`, `computeOperationalScore`, `computeEquipmentScore`, `mapToRLevel`, `getInternalGrade`, `computeGating`, `computeBufferRatio`, `EvaluateRiskOptions`, `defaultClock`.

The `evaluateRisk` fallback path currently is:
```typescript
const P: WeatherRegimeParams = options.params
  ?? resolveParams(options.paramsVersion ?? ACTIVE_PARAMS_VERSION)
```

`resolveParams` in core returns `WeatherRegimeParams | undefined` (because the registry may be empty). Adjust the fallback to throw a helpful error when nothing is registered:

```typescript
function resolveOrThrow(version?: string): WeatherRegimeParams {
  const p = resolveParams(version ?? ACTIVE_PARAMS_VERSION)
  if (!p) {
    throw new Error(
      `@openlarm/core: no params registered for version "${version ?? ACTIVE_PARAMS_VERSION}". ` +
      `Either import a region adapter (e.g. @openlarm/regions-taiwan) before calling evaluateRisk, ` +
      `or pass an explicit options.params.`,
    )
  }
  return p
}

// ... in evaluateRisk body ...
const P: WeatherRegimeParams = options.params ?? resolveOrThrow(options.paramsVersion)
```

- [ ] **Step 2: Copy `model-helpers.ts` to core.**

Read `frontend/src/lib/engines/model-helpers.ts`. Copy to `packages/core/src/engines/model-helpers.ts` with updated imports. Since the current frontend file already has `P` as required (Task 8 P0), the copy is near-verbatim — only the import path changes.

- [ ] **Step 3: Update `packages/core/src/index.ts`.**

```typescript
export {
  evaluateRisk,
  type EvaluateRiskOptions,
} from "./engines/risk-engine.ts"

export {
  inferWCode,
  getWRDecision,
  completionForRL,
  simpleRiskFromW,
} from "./engines/model-helpers.ts"
```

- [ ] **Step 4: Rewrite `frontend/src/lib/engines/risk-engine.ts` as a thin re-export.**

```typescript
// Thin re-export. The pure engine lives in @openlarm/core.
// buildingSiteFromMission / operationalContextFromMission are app-only
// helpers that take Mission (frontend type) and build a LARMInput
// BuildingSite; they stay here because Mission is not part of core.

export {
  evaluateRisk,
  type EvaluateRiskOptions,
} from "@openlarm/core"

import type { Mission } from "../types"
import type { BuildingSiteInput, OperationalContextInput, Complexity } from "@openlarm/core"

export function buildingSiteFromMission(mission: Partial<Mission>): BuildingSiteInput {
  // ... keep the existing function body verbatim, importing Complexity from
  // @openlarm/core rather than from "../types" ...
}

export function operationalContextFromMission(
  mission: Partial<Mission>,
  timeWindow: "day" | "weekend" | "night" = "day",
): OperationalContextInput {
  // ... keep the existing body verbatim ...
}
```

- [ ] **Step 5: Rewrite `frontend/src/lib/engines/model-helpers.ts` as a thin re-export.**

```typescript
export {
  inferWCode,
  getWRDecision,
  completionForRL,
  simpleRiskFromW,
} from "@openlarm/core"
```

- [ ] **Step 6: Verify.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm -w @openlarm/core run typecheck
cd low-altitude-ops-platform/frontend
npm run typecheck
npm test -- --run
npm run build
```

Expected: core typecheck clean; frontend typecheck clean; 34/34; build success.

If the frontend fails because `resolveParams("v2.0")` is called *before* the region adapter's `registerParams()` has run (e.g. during module-initialization-order weirdness), ensure that `frontend/src/lib/engines/weather-regime-params.ts` is imported somewhere in the app's early load path so the side-effect firing happens before engines resolve. (It already is — `params-store.ts` imports `resolveParams` from `@openlarm/core/params/merge` path via the re-export chain, plus `weather-regime-params.ts` gets loaded transitively. Verify in practice by running the tests.)

If initialization ordering is fragile, an explicit import at the frontend entry point is the safest fix. `low-altitude-ops-platform/frontend/src/instrumentation.ts` or a new `low-altitude-ops-platform/frontend/src/lib/larm-bootstrap.ts` imported from the root layout is a reasonable host. Handle this at the first failure, not preemptively.

- [ ] **Step 7: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add packages/core/src/engines/ packages/core/src/index.ts \
        low-altitude-ops-platform/frontend/src/lib/engines/risk-engine.ts \
        low-altitude-ops-platform/frontend/src/lib/engines/model-helpers.ts
git commit -m "feat(core): move risk-engine and model-helpers into @openlarm/core

evaluateRisk, classifyWeatherRegimeWithParams, computeWeatherNow,
computeGScore, computeOperationalScore, computeEquipmentScore,
mapToRLevel, computeGating, computeBufferRatio, and the
EvaluateRiskOptions interface live in packages/core/src/engines/.
Their fallback path now throws a clear error when no region adapter
has populated PARAM_REGISTRY — callers are expected to either import
@openlarm/regions-taiwan (which self-registers) or pass
options.params explicitly.

inferWCode / getWRDecision / completionForRL / simpleRiskFromW are
moved to core as well.

frontend/src/lib/engines/risk-engine.ts and model-helpers.ts become
thin re-exports. The frontend-only buildingSiteFromMission and
operationalContextFromMission helpers (which take Mission) stay in
risk-engine.ts since Mission is an app-layer type.

Plan Task 9 of 13."
```

---

## Task 10: Move golden + resolve-params tests into core

**Goal:** The two test suites that exercise pure-engine behaviour (`risk-engine.golden.test.ts` and `resolve-params.test.ts`) move to `packages/core/test/`. They must pass running against the core package alone (without the Next.js frontend in the loop). The frontend keeps `pricing-engine.test.ts` and `params-store.test.ts` (both app-layer).

**Files:**
- Create: `packages/core/test/risk-engine.golden.test.ts`
- Create: `packages/core/test/resolve-params.test.ts`
- Delete: `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/risk-engine.golden.test.ts`
- Delete: `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/resolve-params.test.ts`
- Maybe create: `packages/core/test/setup-taiwan.ts` (bootstrap helper)

### Steps

- [ ] **Step 1: Create a bootstrap helper at `packages/core/test/setup-taiwan.ts`.**

Because core's registry is empty by default, tests that want to call `evaluateRisk(input)` with no `options.params` need Taiwan's defaults registered first. Instead of importing `@openlarm/regions-taiwan` directly (which would create a dev-only cyclic dependency), register a locally-constructed minimal param set — or import the Taiwan defaults through the dev dependency we already added in `packages/regions-taiwan/package.json` but note that core should not depend on regions-taiwan.

Cleanest: import `@openlarm/regions-taiwan` from core's *test-only* code, guarded by being under `test/` and listed in `packages/core/package.json` devDependencies. Add `"@openlarm/regions-taiwan": "workspace:*"` to core's devDependencies (only — NOT dependencies).

`packages/core/test/setup-taiwan.ts`:

```typescript
// Test-only helper: loads the Taiwan parameter defaults into core's
// registry so tests can call evaluateRisk(input) without passing
// options.params. Imported by each test suite that needs the defaults.

import { registerParams } from "../src/params/registry.ts"
import { TAIWAN_PARAMS_V1_0, TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"

registerParams("v1.0", TAIWAN_PARAMS_V1_0)
registerParams("v2.0", TAIWAN_PARAMS_V2_0)
```

Update `packages/core/package.json`'s `devDependencies`:

```json
    "@openlarm/regions-taiwan": "workspace:*",
```

Run `npm install` at the repo root.

- [ ] **Step 2: Move `risk-engine.golden.test.ts`.**

Copy `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/risk-engine.golden.test.ts` to `packages/core/test/risk-engine.golden.test.ts`. Change imports:

- `import { evaluateRisk } from "@/lib/engines/risk-engine"` → `import { evaluateRisk } from "../src/index.ts"`
- `import type { ... } from "@/lib/types"` → `import type { ... } from "../src/index.ts"`
- `import { resolveParams } from "@/lib/engines/weather-regime-params"` → `import { resolveParams } from "../src/index.ts"`

At the top of the file, add:

```typescript
import "./setup-taiwan.ts"  // side-effect: registers Taiwan params
```

Delete the frontend version: `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/risk-engine.golden.test.ts`.

- [ ] **Step 3: Move `resolve-params.test.ts`.**

Same treatment. The test imports are mainly from `../weather-regime-params` in the current file; point them at `../src/index.ts` in the new location. Add `import "./setup-taiwan.ts"` only if the test body needs the defaults (some subtests that call `resolveParams("v2.0")` need them; other subtests that only test `mergeParams` don't).

Delete `low-altitude-ops-platform/frontend/src/lib/engines/__tests__/resolve-params.test.ts`.

- [ ] **Step 4: Verify both locations.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm -w @openlarm/core run test
cd low-altitude-ops-platform/frontend
npm test -- --run
```

Expected:
- Core: 10 (params) + 13 (golden) + 6 (resolve-params) + 1 (smoke) = 30 tests, all green.
- Frontend: the moved tests are gone; remaining are `pricing-engine.test.ts` (4 tests) + `params-store.test.ts` (11 tests) = 15/15.

Combined: 30 + 15 = 45 tests total (up from 34 — the extra is core's smoke + the new params tests from Task 7).

- [ ] **Step 5: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add packages/core/test/ packages/core/package.json package-lock.json
git rm low-altitude-ops-platform/frontend/src/lib/engines/__tests__/risk-engine.golden.test.ts
git rm low-altitude-ops-platform/frontend/src/lib/engines/__tests__/resolve-params.test.ts
git commit -m "test(core): move golden and resolve-params tests into @openlarm/core

risk-engine.golden.test.ts and resolve-params.test.ts — the two pure
test suites — move from frontend/src/lib/engines/__tests__/ to
packages/core/test/. Each picks up the Taiwan defaults via a tiny
setup-taiwan.ts helper that runs as a side-effect import.

frontend keeps pricing-engine.test.ts and params-store.test.ts
(both app-layer, specific to frontend concerns).

Test counts after this change:
  core: 30 green (10 params + 13 golden + 6 resolve-params + 1 smoke)
  frontend: 15 green (4 pricing + 11 params-store)
  total: 45.

Plan Task 10 of 13."
```

---

## Task 11: Update `params-store.ts` to use `@openlarm/core` + `@openlarm/regions-taiwan` directly

**Goal:** `params-store.ts` no longer imports from `@/lib/engines/weather-regime-params`. It goes straight to `@openlarm/core` for `resolveParams` and `@openlarm/regions-taiwan` for the Taiwan defaults. This is the last in-frontend caller that still threads through the thin-bridge layer.

**Files:**
- Modify: `low-altitude-ops-platform/frontend/src/lib/params-store.ts`

### Steps

- [ ] **Step 1: Update imports + add an explicit base parameter threading.**

Read the current file. The relevant section:

```typescript
import {
  resolveParams,
  type WeatherRegimeParams,
} from "./engines/weather-regime-params"
```

Replace with:

```typescript
import {
  mergeParams,
  type WeatherRegimeParams,
} from "@openlarm/core"

import { TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"
```

- [ ] **Step 2: Rewrite `getParamsWithOverride()` to merge explicit base + override.**

Find:

```typescript
export function getParamsWithOverride(version?: string): WeatherRegimeParams {
  migrateLegacyPricingOverride()
  return resolveParams(version, loadParamOverride() ?? undefined)
}
```

Replace with:

```typescript
export function getParamsWithOverride(): WeatherRegimeParams {
  migrateLegacyPricingOverride()
  const override = loadParamOverride()
  return override ? mergeParams(TAIWAN_PARAMS_V2_0, override) : TAIWAN_PARAMS_V2_0
}
```

Rationale: `resolveParams(version)` in core depends on a registry that the bridge-layer side-effect populates. By calling `mergeParams` with an explicit `TAIWAN_PARAMS_V2_0` here, `params-store` no longer depends on the bridge layer being loaded first. The `version?: string` parameter is dropped because this code path only ever uses the active Taiwan v2.0 calibration (there are no callers that pass a different version — verify by Grep).

Grep verify:

Use the Grep tool to search for `getParamsWithOverride(` under `low-altitude-ops-platform/frontend/src/`. Expect every hit to pass **no argument**. If any caller passes a version string, revert the signature change and keep the `version` parameter; route it through a new `resolveParams(TAIWAN_PARAMS_V2_0, override)` helper (or just look the desired version up among `TAIWAN_PARAMS_V1_0` / `V2_0`).

- [ ] **Step 3: Verify.**

```bash
cd low-altitude-ops-platform/frontend
npm run typecheck
npm test -- --run
npm run build
```

Expected: 15/15 frontend tests + build success. If the admin-params page or any other caller trips the typechecker because of the signature change, fix there and re-verify.

- [ ] **Step 4: Commit.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add low-altitude-ops-platform/frontend/src/lib/params-store.ts
git commit -m "refactor(params-store): import directly from @openlarm/core + @openlarm/regions-taiwan

params-store.ts stops routing through the frontend's bridge layer in
weather-regime-params.ts. It imports mergeParams from @openlarm/core
and TAIWAN_PARAMS_V2_0 from @openlarm/regions-taiwan, eliminating the
last in-frontend consumer that depended on the registry side-effect.

getParamsWithOverride() drops its version parameter (no caller passed
one); it now always merges over the Taiwan v2.0 calibration. If a
future feature needs versioned overrides, the caller can supply its
own base to mergeParams() directly.

Plan Task 11 of 13."
```

---

## Task 12: Configure dual builds + verify dist output

**Goal:** Both packages produce clean `dist/` output (ESM + CJS + `.d.ts`) via tsup, ready for `npm publish`.

**Files:**
- Review: `packages/core/tsup.config.ts` and `packages/regions-taiwan/tsup.config.ts`
- Review: generated `dist/` contents
- Possibly modify: `packages/core/package.json` (tighten `files`, `exports`)

### Steps

- [ ] **Step 1: Build both packages clean.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm -w @openlarm/core run clean
npm -w @openlarm/regions-taiwan run clean
npm -w @openlarm/core run build
npm -w @openlarm/regions-taiwan run build
```

Expected: each produces `dist/index.mjs`, `dist/index.cjs`, `dist/index.d.ts` plus sourcemaps.

- [ ] **Step 2: Inspect the shipped files.**

```bash
ls -la packages/core/dist/ packages/regions-taiwan/dist/
```

Verify there is NOT a Taiwan-calibration-shaped blob inside `packages/core/dist/index.mjs` (it should only appear in `packages/regions-taiwan/dist/index.mjs`).

Quick sanity grep:
```bash
grep -c "TAIWAN_PARAMS" packages/core/dist/index.mjs
# expected: 0
grep -c "TAIWAN_PARAMS" packages/regions-taiwan/dist/index.mjs
# expected: >=2 (V1, V2, ACTIVE)
```

If `packages/core/dist/index.mjs` contains Taiwan values, something in `packages/core/src/` transitively imported from `@openlarm/regions-taiwan`. Audit and fix before proceeding.

- [ ] **Step 3: Run `npm pack --dry-run` for each package.**

```bash
cd packages/core
npm pack --dry-run 2>&1 | tail -40
cd ../regions-taiwan
npm pack --dry-run 2>&1 | tail -40
cd ../..
```

Review the "Tarball Contents" and "Tarball Details" blocks. Verify:
- Only `dist/`, `README.md` (if exists), `LICENSE` (if exists), `NOTICE` (core only), and `package.json` are listed.
- Source files (`src/`, `test/`, `tsconfig.json`, `tsup.config.ts`) are NOT included.
- Total size is reasonable (under 100 KB each for this stage).

If stray files are in the tarball, tighten the `"files"` array in each `package.json`.

- [ ] **Step 4: Verify the Next.js frontend still works with the built packages.**

```bash
cd low-altitude-ops-platform/frontend
npm test -- --run
npm run build
```

Expected: 15/15 + build success. (The frontend uses `transpilePackages` during its own build, so it consumes the sources rather than `dist/`, but this step confirms the whole system is healthy.)

- [ ] **Step 5: Commit any tweaks to build config that came out of Step 3.**

If `package.json` `"files"` changed or `tsup.config.ts` adjustments landed:

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add packages/core/ packages/regions-taiwan/
git commit -m "build(packages): tighten tsup output and publish manifest

npm pack --dry-run review cleanup:
- [list any actual changes made in Step 3 — omit this commit entirely
  if no changes were needed]

Plan Task 12 of 13."
```

If no changes were needed, skip the commit.

---

## Task 13: Changesets + dry-run publish (wait for user approval before actual publish)

**Goal:** Record the intended release as a changeset, run `npm publish --dry-run` to confirm the tarballs are what we expect, and **pause for user confirmation** before the real publish.

**Files:**
- Create: `.changeset/initial-openlarm-release.md`
- Maybe create: `.changeset/config.json` (if not already present — the existing release workflow references changesets but may not have config yet)

### Steps

- [ ] **Step 1: Check for existing changesets config.**

```bash
ls -la /Users/shuyuanduann/gds-mission-mock/.changeset/ 2>&1
```

If the directory exists and has `config.json`, skip to Step 2. If it does not exist, run:

```bash
cd /Users/shuyuanduann/gds-mission-mock
npm install -D @changesets/cli -w openlarm-monorepo
npx changeset init
```

This creates `.changeset/config.json`. Edit it to include both packages and set `access: "public"`:

```json
{
  "$schema": "https://unpkg.com/@changesets/config@3.0.0/schema.json",
  "changelog": "@changesets/cli/changelog",
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "patch",
  "ignore": ["frontend"]
}
```

(The `ignore` entry tells changesets not to version the frontend app — only the two public packages get released.)

- [ ] **Step 2: Create an initial changeset.**

Create `.changeset/initial-openlarm-release.md`:

```markdown
---
"@openlarm/core": major
"@openlarm/regions-taiwan": major
---

Initial public release — `v0.1.0-alpha.0`.

`@openlarm/core` exposes the region-agnostic LARM (Low Altitude Risk Model)
reference implementation: `evaluateRisk`, `classifyWeatherRegimeWithParams`,
component scorers (WeatherNow, G-score, O-score, E-score),
`mergeParams`/`resolveParams`/`registerParams`, and every core type.

`@openlarm/regions-taiwan` exposes the Taiwan parameter calibration
(`TAIWAN_PARAMS_V1_0`, `TAIWAN_PARAMS_V2_0`, `TAIWAN_PARAMS_ACTIVE`). v2.0
reflects the current production model (SORA 2.5 GRC integration, EDR hard
stop at 0.8, recalibrated component scales). See
`spec/LARM-v2.0.md` and `MODEL_CHANGELOG.md` for details.

Both packages target Node ≥ 20 and ship ESM + CJS + `.d.ts`.
```

- [ ] **Step 3: Apply the changeset to stage version bumps.**

```bash
cd /Users/shuyuanduann/gds-mission-mock
npx changeset version
```

This should rewrite both `packages/core/package.json` and `packages/regions-taiwan/package.json` to `"version": "0.1.0-alpha.0"` (pre-1.0, major-bumped-from-0 is still pre-release in changesets' logic — verify the produced version matches expectation; if it shows `1.0.0` instead, use `npx changeset pre enter alpha` before versioning).

Inspect the diff:

```bash
git diff --stat packages/
```

Expected: only the two `package.json` files and `.changeset/` have changed.

- [ ] **Step 4: Dry-run the publish.**

```bash
npm -w @openlarm/core publish --dry-run --access public
npm -w @openlarm/regions-taiwan publish --dry-run --access public
```

Review output: each dry-run should report the package name, version, size, registry (default: `https://registry.npmjs.org/`), and list of files.

- [ ] **Step 5: Halt for user approval.**

Do NOT run the real `npm publish`. Report back:

- The planned package versions.
- The dry-run tarball listings.
- Ask the user:

> Ready to publish `@openlarm/core@0.1.0-alpha.0` and `@openlarm/regions-taiwan@0.1.0-alpha.0` to npm? You'll need:
> 1. An authenticated npm session (`npm whoami`) — confirm this is the `openlarm` scope owner.
> 2. 2FA set up (if enabled on the scope).
> 3. The desired `dist-tag` (default: `latest`; for an alpha release, consider `--tag alpha`).

- [ ] **Step 6: Commit the changeset + version bumps.**

Whether or not the user proceeds to publish, commit the version state:

```bash
cd /Users/shuyuanduann/gds-mission-mock
git add .changeset/ packages/core/package.json packages/regions-taiwan/package.json \
        package-lock.json
git commit -m "chore(release): stage @openlarm/{core,regions-taiwan}@0.1.0-alpha.0

Records the initial public release as a changeset + applied version
bumps. npm publish has NOT been run — this commit is a dry-run
checkpoint only.

Plan Task 13 of 13 (publish step gated on user confirmation)."
```

- [ ] **Step 7 (conditional, ONLY after user says \"yes, publish\"): actual publish.**

```bash
# User-confirmed only
npm -w @openlarm/core publish --access public --tag alpha
npm -w @openlarm/regions-taiwan publish --access public --tag alpha
```

Expected: each publishes successfully; npm assigns the provenance metadata (the packages were scaffolded with `"provenance": true` in `publishConfig`).

Tag the release in git:

```bash
git tag @openlarm/core@0.1.0-alpha.0
git tag @openlarm/regions-taiwan@0.1.0-alpha.0
# git push --tags  (only if user authorised)
```

---

## Self-review checklist (run at the end of execution)

- [ ] `git log --oneline` shows ~15 focused commits across Tasks 1–13 (some tasks produce 1 commit, Tasks 7 and 8 produce 1 each — 13 is the rough floor).
- [ ] Workspace `npm install` at repo root produces no errors.
- [ ] `npm -w @openlarm/core run test` — 30+ tests green.
- [ ] `npm -w @openlarm/regions-taiwan run test` — 7+ tests green.
- [ ] `cd low-altitude-ops-platform/frontend && npm test -- --run` — 15 tests green.
- [ ] `cd low-altitude-ops-platform/frontend && npm run build` — success.
- [ ] `grep TAIWAN_PARAMS packages/core/dist/index.mjs` → 0 matches (core is region-agnostic).
- [ ] `npm -w @openlarm/core publish --dry-run` → clean tarball listing.
- [ ] `npm -w @openlarm/regions-taiwan publish --dry-run` → clean tarball listing.
- [ ] Next.js dev server runs (`npm run dev`) and `/missions/new` Step 6 / `/quote` Step 3 / `/admin/params` all work interactively.
