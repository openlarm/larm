# Task 3 規劃：`@larm/core` Public API 設計

> **目的**：定義 `@larm/core` v1.0 要暴露的 TypeScript 介面。這是**公開 API 合約**—發佈後破壞即是 breaking change。
>
> **原則**：小、純、可組合、可注入、零副作用。

---

## 1. 設計目標

| 目標 | 具體要求 |
|---|---|
| **純函式** | 同輸入 → 同輸出；不讀全域狀態；不碰 I/O |
| **可注入依賴** | Clock、ID generator、ParamStore 都可替換 |
| **Tree-shakeable** | 每個 export 獨立；`sideEffects: false` |
| **型別優先** | 所有輸入用 discriminated union，錯誤在編譯期擋下 |
| **環境無關** | Node / Deno / Bun / Browser / Edge 全可跑 |
| **零依賴** | package.json 的 `dependencies` 為 `{}` |
| **SemVer 嚴格** | Public API 變動即 major；內部 helpers 不 export |

---

## 2. 套件入口結構

```
@larm/core
├── package.json           (name, version, "sideEffects": false, type: "module")
├── src/
│   ├── index.ts           (barrel export, 只 re-export public API)
│   ├── evaluate.ts        (主入口 evaluateRisk)
│   ├── regime/
│   │   └── classify.ts    (classifyWeatherRegime)
│   ├── components/
│   │   ├── weather-now.ts
│   │   ├── g-score.ts
│   │   ├── o-score.ts
│   │   └── e-score.ts
│   ├── gating/
│   │   └── decide.ts      (computeGating)
│   ├── buffer.ts
│   ├── completion.ts      (completionForRL)
│   ├── params/
│   │   ├── schema.ts      (型別)
│   │   ├── v1.ts          (WEATHER_REGIME_PARAMS_V1)
│   │   ├── v2.ts          (WEATHER_REGIME_PARAMS_V2)
│   │   └── registry.ts    (PARAM_REGISTRY + resolveParams)
│   ├── types/
│   │   └── index.ts       (純型別，不含實作)
│   └── _internal/         (底線前綴 = 內部用，不 export)
└── test/
    ├── golden/            (test vectors)
    └── unit/
```

---

## 3. 核心 API（要寫進 `src/index.ts`）

### 3.1 主入口 `evaluateRisk`

```typescript
/**
 * 評估一次低空作業的綜合風險。
 *
 * 純函式：同樣的 (input, options) 保證產出相同 result。
 *
 * @example
 * const result = evaluateRisk(input, { params: WEATHER_REGIME_PARAMS_V2 })
 */
export function evaluateRisk(
  input: LARMInput,
  options?: EvaluateOptions,
): RiskResult

export interface EvaluateOptions {
  /** 模型參數。不提供時使用 ACTIVE_PARAMS（預設 v2.0）。 */
  params?: WeatherRegimeParams

  /** 時間來源。測試/回放時注入固定 Date。預設 `() => new Date()`。 */
  clock?: () => Date

  /** 覆寫 W-code 判定（除錯/手動模式）。 */
  w_override?: WeatherType

  /**
   * 區域環境暴露覆寫。若 input.building.region_exposure 已提供會被忽略。
   * 留作未來多區域 adapter 的 hook 點。
   */
  region_exposure?: RegionExposure
}
```

**為什麼這樣切**：
- `options` 集中注入點，不膨脹函式簽章
- `clock` 預設仍跑 `new Date()` 保證開箱即用
- `params` 不提供時 fallback 到內建常數，**不碰 localStorage**（是 browser-adapter 的責任）

---

### 3.2 組件級 API（讓進階使用者只取其一）

```typescript
/** 只做天候分類，不做 risk 計算。 */
export function classifyWeatherRegime(
  w30: Weather30dInput,
  today: WeatherTodayInput,
  options?: ClassifyOptions,
): WeatherRegimeResult

/** 只算 WeatherNow 分數（0–42）。給儀表板即時顯示用。 */
export function computeWeatherNow(
  today: WeatherTodayInput,
  w30: Weather30dInput,
  w_code: WeatherType,
  params: WeatherRegimeParams,
  options?: { region_exposure?: RegionExposure },
): WeatherNowResult

/** 只算 G_score（0–20）。給建物評估頁面用。 */
export function computeGScore(
  building: BuildingSiteInput,
  currentWindKmh: number,
  params: WeatherRegimeParams,
): GScoreResult

/** 從 R_score 映射到 R-level。 */
export function mapToRLevel(
  score: number,
  params?: WeatherRegimeParams,
): RiskLevel

/** R-level + W-code → 預期完成率。 */
export function completionForRL(
  r: RiskLevel,
  w: WeatherType,
  localAdjustment?: number,
): number

/** WR matrix lookup。 */
export function getWRDecision(
  w: WeatherType,
  r: RiskLevel,
  params?: WeatherRegimeParams,
): WRDecision

/** UI-side W-code 推論（粗略，非 normative）。 */
export function inferWCode(
  today: WeatherTodayInput,
  w30: Weather30dInput,
  params?: WeatherRegimeParams,
): WeatherType
```

**重點**：每個 sub-engine 都可以**單獨 import**，對應 Task 2 spec 中 Section 5.1–5.5。

---

### 3.3 參數 API

```typescript
/** 預設參數版本（v2.0）。 */
export const ACTIVE_PARAMS: WeatherRegimeParams

/** 版本 registry。 */
export const PARAM_REGISTRY: Readonly<Record<string, WeatherRegimeParams>>

/** 依名稱取版本；找不到時回 ACTIVE_PARAMS。 */
export function resolveParams(version?: string): WeatherRegimeParams

/**
 * 深合併覆寫到既有 params。純函式，不碰 storage。
 * 給 adapter 用：browser-adapter 讀完 localStorage 後呼叫此函式。
 */
export function mergeParams(
  base: WeatherRegimeParams,
  override: Partial<WeatherRegimeParams>,
): WeatherRegimeParams

/** Zod-style 驗證（optional 第二次 release 再加）。 */
export function validateParams(input: unknown): {
  ok: boolean
  errors: string[]
  params?: WeatherRegimeParams
}
```

---

### 3.4 型別 exports（全部 readonly）

```typescript
// 輸入
export type {
  LARMInput,
  Weather30dInput,
  WeatherTodayInput,
  BuildingSiteInput,
  OperationalContextInput,
  Equipment,
}

// 輸出
export type {
  RiskResult,
  RiskExplanation,
  WeatherRegimeResult,
  WeatherNowResult,
  GScoreResult,
}

// Enum-like union
export type {
  WeatherType,         // "W0" | ... | "W5"
  RiskLevel,           // "R0" | ... | "R4"
  Decision,            // "GO" | "CONDITIONAL" | "NO_GO"
  ConditionalTier,     // "A" | "C" | "D1" | "D2"
  Complexity,
  PopulationDensityClass,
  SORAMitigation,      // "M1A" | "M1B" | "M1C" | ...
  RegionExposure,
  CrowdDensity,
  WRDecision,          // "go" | "cond" | "nogo"
}

// 參數型別
export type {
  WeatherRegimeParams,
  RegimeEntry,
  WindScoreRow,
  GScoreConfig,
  EScoreConfig,
  BufferCoefficients,
  EDRThreshold,
  // ...etc
}

// 常數
export const LARM_VERSION: "v2.0"
export const R_LEVEL_BOUNDS: Record<RiskLevel, { min: number; max: number }>
export const W_CODES: readonly WeatherType[]
```

---

### 3.5 **不**進入 core 的 API（故意排除）

以下現有 code 不列入 `@larm/core` public API：

| 項目 | 為什麼排除 | 去處 |
|---|---|---|
| `buildingSiteFromMission()` | 依賴 Mission 型別（app 層） | `@larm/integrations/missions` |
| `operationalContextFromMission()` | 同上 | 同上 |
| Airspace zones | 區域資料會分 TW/JP/KR | `@larm/airspace-taiwan` |
| Pricing engine | 商業邏輯獨立 | `@larm/pricing` |
| Time engine | 作業時長估算獨立域 | `@larm/time` 或單獨套件 |
| Forecast tracker / DB | 依賴 IndexedDB | `@larm/training-adapters` |
| `getParams()` 讀 localStorage | 平台特定 | `@larm/browser-adapter` |
| `simpleRiskFromW()` | UI shortcut，非 normative | 留在 app 層即可 |

---

## 4. 使用範例（寫進 README）

### 4.1 最簡用法

```typescript
import { evaluateRisk } from "@larm/core"

const result = evaluateRisk({
  weather_30d: {
    wind_p90_kmh: 28,
    gust_p90_kmh: 42,
    rain_days_30: 6,
    heavy_rain_days_30: 1,
    instability_index: 0.4,
    predictability_score: 0.75,
  },
  weather_today: {
    wind_now_kmh: 15,
    rain_prob_today_pct: 20,
    rain_mmph_forecast: 0,
    thunder_risk: 0,
  },
  building: {
    site_altitude_m: 20,
    building_floors: 12,
    facade_complexity: "medium",
    clearance_m: 8,
    near_hv_power: 0,
    near_base_station: 0,
    wind_channel_effect: 0,
  },
})

console.log(result.risk_level)   // "R1"
console.log(result.decision)     // "GO"
console.log(result.buffer_ratio) // 0.12
```

### 4.2 自訂參數

```typescript
import { evaluateRisk, mergeParams, ACTIVE_PARAMS } from "@larm/core"

const myParams = mergeParams(ACTIVE_PARAMS, {
  // 台南地區實測：午後對流比預設更嚴苛
  weather_now_weights: {
    ...ACTIVE_PARAMS.weather_now_weights,
    instability_scale_w4: 35,
  },
})

const result = evaluateRisk(input, { params: myParams })
```

### 4.3 搭配 browser-adapter

```typescript
// app-level 初始化
import { evaluateRisk, mergeParams, ACTIVE_PARAMS } from "@larm/core"
import { readParamsOverride } from "@larm/browser-adapter"

const params = mergeParams(ACTIVE_PARAMS, readParamsOverride() ?? {})
const result = evaluateRisk(input, { params })
```

### 4.4 注入 clock（測試）

```typescript
import { evaluateRisk } from "@larm/core"

const fixedClock = () => new Date("2026-04-16T10:00:00Z")
const result = evaluateRisk(input, { clock: fixedClock })
// result.evaluated_at === "2026-04-16T10:00:00.000Z" ← 可穩定 snapshot
```

---

## 5. API 穩定性政策

### 5.1 SemVer 對應
| 變動 | 升版 |
|---|---|
| 新增 export | minor |
| 新增 optional 欄位到 input/output | minor |
| 改公式但 score 區間不變 | minor（需改 params version，不改 package version） |
| **改 public function 簽章** | **major** |
| **改既有輸出欄位語意** | **major** |
| 修 bug 導致 score 改變 | **要特別謹慎**：優先做成新 params version，保留舊版 |

### 5.2 Deprecation
- 標記 `@deprecated` 至少跨一個 minor 版本
- 每次 release 檢查 deprecated 清單

### 5.3 Experimental API
在正式 API 外另開 `@larm/core/experimental` subpath，放尚未穩定的 API（例：`evaluateRiskWithSora25()`）。

---

## 6. 實作順序（Phase 1 Week-by-Week）

| 階段 | 動作 |
|---|---|
| **Step 1** | 建立 monorepo（pnpm workspace）+ `packages/core` 空殼 + tsconfig + vitest |
| **Step 2** | 把 `types/` 從 `frontend/src/lib/types.ts` 抽出 LARM 相關型別 |
| **Step 3** | 搬 `params/v1.ts` + `v2.ts`（純 const，最簡單先開始） |
| **Step 4** | 搬 `evaluate.ts`（改純函式簽章，注入 clock、移除 getParams()） |
| **Step 5** | 搬 component sub-engines |
| **Step 6** | 寫 10 個 golden tests（用現有 UI 的 mock 輸入產生）|
| **Step 7** | 把 frontend 改成 `import { evaluateRisk } from "@larm/core"` |
| **Step 8** | 跑整套 test + 手動驗證 UI 行為不變 |
| **Step 9** | 發 `@larm/core@0.1.0-alpha` 到 npm |

---

## 7. 風險與對策

### 7.1 Peer dependency 污染
- **不要**把 React / Next 放進 devDependencies（會讓 CI 下載數百 MB）
- core 包只用 `typescript` + `vitest` + `tsup`

### 7.2 型別過度 export
- 只 export **使用者需要的**型別
- 內部計算用的中間型別（如 WeatherNowComponents）不 export
- 用 `.d.ts` 最終檢查：能跑 `tsc --noEmit` 並 export 乾淨的型別

### 7.3 向後相容陷阱
- `WeatherRegimeParams` 目前內嵌 `pricing` 欄位 — **v1.0 發佈前必須拆掉**，否則 pricing 改動會讓 core 被迫升 major
- 參考 Task 1 的 P1 清單

### 7.4 ESM/CJS 雙輸出
- 用 `tsup` 或 `unbuild` 產 ESM + CJS + .d.ts
- package.json 加 conditional exports：
```json
{
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.mjs",
      "require": "./dist/index.cjs"
    },
    "./experimental": { ... }
  }
}
```

---

## 8. 與 Task 1 / Task 2 的對應

| Task 2 spec 章節 | Task 3 對應 API |
|---|---|
| §4 Regime Classification | `classifyWeatherRegime()` |
| §5.1 Base(W) | 含在 `evaluateRisk()` |
| §5.2 WeatherNow | `computeWeatherNow()` |
| §5.3 G_score | `computeGScore()` |
| §5.4 O_score | （內部） |
| §5.5 E_score | （內部） |
| §6 Aggregation | `evaluateRisk()` main flow |
| §7 Gating | 內含於 `evaluateRisk()` 回傳 |
| §8 Buffer | `computeBuffer()`（考慮 export） |
| §9 Completion | `completionForRL()` |
| §12 Test Vectors | `test/golden/` |

**spec (Task 2) 寫「做什麼」，API (Task 3) 寫「怎麼呼叫」，兩者是一對一映射**。

---

## 9. 驗證 API 設計的三個問題

發佈前自問：

1. **「假設我是 Python port 作者，看這個 API 能不能照抄？」** — 應該能。
2. **「所有函式是否可以在沒有 DOM 的 Node 裡跑？」** — 必須可以。
3. **「公開 API 超過 25 個 symbols 了嗎？」** — 超過就要考慮簡化。初版目標 < 30 個 export。

---

## 10. 下一步

1. 先做 Task 1 的 P0（解耦），這是 Task 3 的前提
2. 用此文件作為 PR review checklist
3. 第一個 PR：建立 `@larm/core` 空殼 + 把最乾淨的 `airspace` / `time-engine` 搬進去當 smoke test
4. 第二個 PR 才處理 `risk-engine` 的重構
