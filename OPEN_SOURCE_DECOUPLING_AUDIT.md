# LARM 開源解耦盤點報告（Task 1）

> 目的：把 `frontend/src/lib/engines/` 從 Next.js / 瀏覽器環境中切出來，變成可獨立發佈的 `@larm/core` npm 套件。
>
> 範圍：9 個引擎檔案 + `types.ts` ≈ **2,661 行**，依賴面積小，解耦可行性高。

---

## 1. 盤點結論 TL;DR

| 檔案 | 純度 | 主要耦合 | 解耦難度 |
|---|---|---|---|
| `risk-engine.ts` | ⚠️ 中 | 呼叫 `getParams()` 讀 localStorage；`@/` 路徑別名；`new Date()` 不純 | **低**（傳入 params + 注入 clock） |
| `weather-regime-params.ts` | ❌ 低 | `localStorage.getItem`、`typeof window` 直接守衛 | **中**（需引入 storage adapter 介面） |
| `pricing-params.ts` | ❌ 低 | `localStorage` + 遷移邏輯耦合在 reader | **中**（storage adapter） |
| `pricing-engine.ts` | ⚠️ 中 | 間接呼叫 `getParams()` 和 `getPricingParams()`；`new Date()` + `Math.random()` 不純 | **低** |
| `model-helpers.ts` | ⚠️ 中 | 間接呼叫 `getParams()` | **極低**（已有 `P?` optional 參數） |
| `airspace-zones.ts` | ✅ 高 | 僅有 `@/` 路徑別名 | **極低** |
| `time-engine.ts` | ✅ 高 | 僅有 `@/` 路徑別名 | **極低** |
| `forecast-db.ts` | ❌ 低 | 整檔依賴 `indexedDB` + `window` | **高**（需改 storage adapter，或完全排除在 core 外） |
| `forecast-tracker.ts` | ❌ 低 | 呼叫 forecast-db；`localStorage` 快取；Date 非決定性 | **高**（隨 forecast-db 一起處理） |

**結論**：`risk-engine` / `model-helpers` / `time-engine` / `airspace-zones` 四個核心檔案屬於**純演算法**，只要拿掉 `@/` 別名和 `getParams()` 的隱性讀取即可發佈 `@larm/core` v0.1。`forecast-db` 和 `forecast-tracker` 應該**不進 core**，拆到 `@larm/training-adapters/indexeddb`。

---

## 2. 隱性依賴清單（按類別）

### 2.1 Next.js / TypeScript 專案結構依賴

#### ① `@/` 路徑別名（全部 7 檔）
```typescript
import type { ... } from "@/lib/types"
```

| 檔案 | 出現次數 |
|---|---|
| `risk-engine.ts` | 3 處（含動態 import 型別） |
| `model-helpers.ts` | 1 |
| `pricing-engine.ts` | 1 |
| `pricing-params.ts` | 1 |
| `airspace-zones.ts` | 1 |
| `time-engine.ts` | 1 |
| `forecast-tracker.ts` | 1 |
| `forecast-db.ts` | 1 |

**問題**：`@/` 是 Next.js `tsconfig.json` 的 paths alias，獨立套件無法解析。

**修法**：搬到 monorepo 後，types 變成同層 import：
```typescript
// 改為
import type { ... } from "./types"
// 或從 @larm/core 的 entry 重新匯出
import type { ... } from "../types"
```

---

### 2.2 Browser Global API 依賴

#### ② `localStorage` 直接存取

| 位置 | 用途 | 影響 |
|---|---|---|
| `weather-regime-params.ts:325-337` | `getParams()` 讀 `larm_params_override` 覆寫參數 | **最關鍵**—core 的每個計算都經過這裡 |
| `pricing-params.ts:152-177` | `getPricingParams()` 讀覆寫 + 舊 key 遷移 | 同上 |
| `pricing-params.ts:131-148` | `migrateLegacyPricingOverride()` 直接寫 localStorage | side effect |
| `forecast-tracker.ts:193-198` | `computeAndStoreBiasCorrection()` 快取 bias | 輔助 |
| `forecast-tracker.ts:296-305` | `getCachedBiasCorrection()` 讀快取 | 輔助 |

**修法 A（建議）**：引入 `ParamStore` adapter 介面，讓呼叫端注入：
```typescript
export interface ParamStore {
  read(): Partial<WeatherRegimeParams> | null
  write?(params: Partial<WeatherRegimeParams>): void
}

export function getParams(
  version: string = ACTIVE_PARAMS_VERSION,
  store?: ParamStore,  // ← 注入點
): WeatherRegimeParams { ... }
```

- `@larm/core` 提供 `InMemoryParamStore`（預設，零依賴）
- `@larm/browser-adapter` 提供 `LocalStorageParamStore`
- Next.js app 在 app 啟動時 `setDefaultParamStore(new LocalStorageParamStore())`

**修法 B（更徹底）**：讓 `evaluateRisk()` 直接接受 `params: WeatherRegimeParams`，完全不內部 lookup。呼叫端自行合併覆寫。這是 **pure function** 的寫法，測試/SSR 最理想。

**建議採 B**，搭配 helper `loadOverrideFromLocalStorage()` 放在 browser adapter。

---

#### ③ `typeof window` 運行時檢查

出現在：
- `weather-regime-params.ts:325` `if (typeof window === "undefined") return base`
- `pricing-params.ts:132, 153` 同上
- `forecast-db.ts:15-17` `isClient()` helper
- `forecast-tracker.ts:193, 297` `if (typeof localStorage !== "undefined")`

**問題**：這種 `typeof window` 守衛是「偷偷支援 SSR」的權宜之計，對純函式 lib 反而是**反模式**（讓同一份 code 在不同環境有不同行為）。

**修法**：core 完全移除 `typeof window`；所有環境判斷下放到 adapter。

---

#### ④ `indexedDB` / `IDBDatabase`

`forecast-db.ts` 整檔使用：
```typescript
const req = indexedDB.open(DB_NAME, DB_VERSION)
```

**建議**：**不進 `@larm/core`**。這是訓練/回饋資料的儲存層，應該：
- 拆成獨立套件 `@larm/training-adapters`
- 提供 `TrainingStore` 介面（put / getByLocation / getBiasCorrection）
- `@larm/training-adapters/indexeddb` 實作瀏覽器版
- `@larm/training-adapters/sqlite` 未來可給 server 端用

---

### 2.3 非決定性（non-deterministic）依賴

這類不是「Next.js 依賴」，但會讓**測試不穩定、模型無法重現**，開源前必須解：

#### ⑤ `new Date()` 直接使用

| 位置 | 用途 |
|---|---|
| `risk-engine.ts:481` | `evaluateRisk()` 的 `evaluated_at: new Date().toISOString()` |
| `pricing-engine.ts:122-125` | 報價日期 + 有效期 + quote_code |
| `forecast-tracker.ts:52` | `recordForecasts()` 的 `recorded_at` |
| `forecast-tracker.ts:169-170` | `computeAndStoreBiasCorrection()` 計算 lookback |
| `forecast-tracker.ts:237-238` | `computeAccuracySummary()` 計算 lookback |
| `forecast-tracker.ts:181` | `updated_at: new Date().toISOString()` |

**修法**：注入 `clock: () => Date = () => new Date()`：
```typescript
export interface EvaluateRiskOptions {
  params?: WeatherRegimeParams
  clock?: () => Date   // ← for testable, reproducible output
}
```

#### ⑥ `Math.random()`

- `pricing-engine.ts:125` `Q-${...}-${Math.floor(Math.random() * 900 + 100)}`

**修法**：注入 `idGenerator: () => string`，或把 quote code 生成移出 core（由呼叫端決定）。

---

### 2.4 跨模組耦合（monorepo 拆分時要切的）

#### ⑦ `weather-regime-params.ts` 內嵌了 `pricing` 欄位

```typescript
// weather-regime-params.ts:120
pricing: PricingParams  // embedded pricing parameters
```

這把「**風險模型參數**」和「**報價參數**」綁成同一個 localStorage key。開源時兩者應分開：
- `@larm/core` 只有 `WeatherRegimeParams`（risk 用）
- `@larm/pricing`（若開源）自帶 `PricingParams`
- Next.js app 在應用層把兩者合併到自己的 config

#### ⑧ `pricing-engine.ts` 依賴 `weather-regime-params`

```typescript
// pricing-engine.ts:117
const maxMult = getParams().quote_max_multiplier
```

報價的 multiplier cap 跑到 LARM params 裡，造成 pricing → risk 的**反向依賴**。
**修法**：把 `quote_max_multiplier` 搬回 `PricingParams`。

---

### 2.5 其他觀察

#### ⑨ `risk-engine.ts` 內部有動態 import 型別
```typescript
// risk-engine.ts:239, 247, 303
crowd_density: import("@/lib/types").CrowdDensity | null,
```
遷移時要改成靜態 import。

#### ⑩ 未發現的好消息 ✅
- **沒有** `fetch` 呼叫（氣象 API 都在 `src/app/api/` 的 route handler，engines 乾淨）
- **沒有** React / JSX import（完全無 UI 層汙染）
- **沒有** `process.env` 讀取
- **沒有** Node built-in（`fs` / `path`）
- **沒有** 第三方 npm 相依（除了 TypeScript 型別）

**這意味著 `@larm/core` 可以做到真正零 runtime dependency。**

---

## 3. 必須解耦動作清單（優先順序）

### P0 — 發佈 v0.1 前必做（Blocker）

1. **移除 `@/` 別名**：所有 engines 改相對路徑 import
2. **`evaluateRisk()` 改純函式簽章**：接受 `params` 為必要/選用參數，不再內部呼叫 `getParams()`
3. **移除 engines 層的 `localStorage` 直接存取**：下放到新建立的 `@larm/browser-adapter`
4. **移除 engines 層的 `typeof window`**
5. **注入 clock**：`evaluateRisk()` 接受 `clock?: () => Date`，預設仍是 `() => new Date()` 但可覆寫

### P1 — v0.2 前做

6. **拆 `forecast-db` / `forecast-tracker`** 到 `@larm/training-adapters`（不進 core）
7. **拆 `pricing`** 與 risk 參數解耦：`quote_max_multiplier` 搬回 `PricingParams`
8. **`Math.random()` 改可注入**，或把 quote code 生成移到 app 層

### P2 — 生態成熟後

9. 把 `model-helpers.ts` 的 `getParams()` optional fallback 改為**強制傳入**（breaking change，走 v1.0 major）
10. 建立 `golden tests`：把現有 UI 的測試案例做成快照，防止解耦過程中改動模型行為

---

## 4. 建議的物理遷移結構

```
larm-ecosystem/                          ← 新 monorepo
├── packages/
│   ├── core/                            ← @larm/core（零依賴）
│   │   ├── src/
│   │   │   ├── risk-engine.ts           ← from risk-engine.ts（解耦後）
│   │   │   ├── model-helpers.ts         ← 幾乎不動
│   │   │   ├── airspace/                ← 從 airspace-zones.ts 拆出
│   │   │   │   ├── haversine.ts
│   │   │   │   └── zones-taiwan.ts      ← 資料與邏輯分離
│   │   │   ├── time-engine.ts
│   │   │   ├── params/
│   │   │   │   ├── weather-regime.ts    ← 純 const + helper
│   │   │   │   └── defaults.ts
│   │   │   └── types/
│   │   │       └── index.ts             ← 從 @/lib/types 抽出 core 型別
│   │   └── package.json                 ← "sideEffects": false
│   │
│   ├── pricing/                         ← @larm/pricing（獨立，可選開源）
│   │   └── src/
│   │       ├── pricing-engine.ts
│   │       └── pricing-params.ts
│   │
│   ├── browser-adapter/                 ← @larm/browser-adapter
│   │   └── src/
│   │       ├── local-storage-store.ts   ← 實作 ParamStore 介面
│   │       └── index.ts
│   │
│   └── training-adapters/               ← @larm/training-adapters
│       └── src/
│           ├── indexeddb.ts             ← 從 forecast-db.ts 遷入
│           └── bias-tracker.ts          ← 從 forecast-tracker.ts 遷入
│
├── apps/
│   └── playground/                      ← 互動 demo
│
└── spec/
    └── LARM-v1.1.md                     ← Task 2 產出
```

---

## 5. 風險與注意事項

### 5.1 不要在這波重構修改模型行為
解耦重構時，**任何 R_score 計算結果必須與現行版本逐位元相同**。建議：
1. 先為現有 `evaluateRisk()` 撰寫快照測試（golden tests），至少 50 個輸入樣本
2. 每一步解耦後都跑快照，差 1 分就代表意外改動了邏輯

### 5.2 Params 覆寫語意要明確定義
目前 `getParams()` 有個微妙行為：client 讀 localStorage、server 讀程式碼預設值 → 同一個請求在 SSR 和 hydration 後**可能算出不同結果**。這是 bug 級別的技術債，趁著開源拆分一起修正：
- **開源版的 API 合約**：`evaluateRisk(input, { params })` — 覆寫一律在呼叫端顯式傳入，core 不做 lookup。

### 5.3 參數版本 vs 套件版本
- `@larm/core@1.0.0` 可以同時支援 `params.version = "v1.0"` 和 `"v2.0"`（因為你已經做了 PARAM_REGISTRY）✅
- 發 npm 時建議把 `ACTIVE_PARAMS_VERSION` 改成**可覆寫**（避免 breaking 固定為 v2.0 的下游）

---

## 6. 下一步

此盤點完成後，建議進行：
1. **Task 2**：撰寫 `LARM-v1.1.md` 規格文件骨架（本 plan 見下）
2. **Task 3**：設計 `@larm/core` public API（本 plan 見下）
3. 執行 P0 項目 → 發 `@larm/core` v0.1.0-alpha
