# GDS-mission-mock — Low Altitude Ops Platform

## 專案定位

低空作業風險管理平台，核心為 **LARM v2.0（Low Altitude Risk Model）**。
Repo 是 npm-workspaces 單體倉庫：`@openlarm/core` + `@openlarm/regions-taiwan` 為可發佈的模型套件，Next.js 16 前端消費這兩個套件並部署於 Vercel。

## 工作目錄

```
/ (monorepo root)
├── packages/
│   ├── core/                          ← @openlarm/core (region-agnostic engine)
│   └── regions-taiwan/                ← @openlarm/regions-taiwan (Taiwan calibration)
├── low-altitude-ops-platform/
│   ├── frontend/                      ← Next.js app (consumer)
│   ├── LARM_CONCEPT_GUIDE.md          ← 白話說明文件
│   └── LARM_PARAM_GUIDE.md            ← 技術參數手冊
├── spec/
│   └── LARM-v2.0.md                   ← 3,000+ 行正式規範
└── docs/superpowers/plans/            ← 實作計畫歷史
```

## 開發指令

```bash
# 從 repo root
npm install                                    # 安裝整個 workspace
npm test --workspaces --if-present             # 跑全 55 個 tests

# frontend 專用
cd low-altitude-ops-platform/frontend
npm run dev                                    # http://localhost:3000
npm run build                                  # Next.js production build
npm run typecheck                              # tsc --noEmit
npm run lint                                   # ESLint

# core / regions-taiwan 套件
npm -w @openlarm/core run build                # tsup → dist/
npm -w @openlarm/core run test                 # 30 tests
npm -w @openlarm/regions-taiwan run test       # 8 tests
```

## LARM v2.0 模型核心概念

```
R_score = Base(W) + WeatherNow + G_score + O_score + E_score   [0–100]
        → R-level (R0–R4)
        → Decision: GO / CONDITIONAL (Tier A/C/D1/D2) / NO-GO
        → Buffer Ratio (5%–55%)
        → Completion Probability (5%–99%)
```

| 組件 | 上限 | 說明 |
|---|---|---|
| Base(W) | 3–22 | W-code 天候底分（v2.0 含 W5 颱風趨勢修正） |
| WeatherNow | 0–42 | 風×0.55 + 雨×0.35 + 不穩定×0.10 + EDR |
| G_score | 0–20 | 地面/建物風險（含 SORA 2.5 iGRC + TKE proxy） |
| O_score | 0–12 | 作業情境（夜間/週末/急件/人流/疲勞） |
| E_score | 0–8 | 設備狀態（Block +3 / Warn +1.5 每件） |

**R-level 邊界**：R0(0–20) / R1(21–40) / R2(41–65) / R3(66–85) / R4(86–100)

**硬停規則**：
- 風速 ≥ 39 km/h
- 雨量 > 10 mm/h **且** 機率 > 60%
- EDR > 0.8（v2.0 新增）
- R_score > `r4_nogo_threshold`（預設 92）

> 註：舊文件可能稱 `G_score` 為 `B_score`（building score）— v2.0 改名因為它現在含 SORA 2.5 ground-consequence 而不只是 building 分。`RiskResult.b_score` 欄位作為 backward-compat alias 仍等於 `g_score`。

## 關鍵檔案

### @openlarm/core（可發佈套件）

| 檔案 | 用途 |
|---|---|
| `packages/core/src/engines/risk-engine.ts` | `evaluateRisk()` 主引擎 |
| `packages/core/src/engines/model-helpers.ts` | `inferWCode()` / `completionForRL()` / `getWRDecision()` |
| `packages/core/src/params/schema.ts` | `WeatherRegimeParams` 型別（不含 pricing） |
| `packages/core/src/params/merge.ts` | `resolveParams()` / `mergeParams()` |
| `packages/core/src/params/registry.ts` | `PARAM_REGISTRY` + `registerParams()` |
| `packages/core/src/types/index.ts` | 區域無關核心型別（WeatherType, LARMInput, RiskResult…） |

### @openlarm/regions-taiwan

| 檔案 | 用途 |
|---|---|
| `packages/regions-taiwan/src/v2.ts` | `TAIWAN_PARAMS_V2_0` 數值校準 |
| `packages/regions-taiwan/src/v1.ts` | `TAIWAN_PARAMS_V1_0`（back-compat） |
| `packages/regions-taiwan/src/index.ts` | import 時 side-effect `registerParams()` |

### frontend（Next.js 應用，消費 core + regions-taiwan）

| 檔案 | 用途 |
|---|---|
| `src/lib/params-store.ts` | 客戶端 localStorage 參數覆寫層（直接 import `mergeParams` + `TAIWAN_PARAMS_V2_0`） |
| `src/lib/engines/*` | thin re-exports，back-compat 用（24+ in-app importers） |
| `src/lib/engines/pricing-engine.ts` | `generateQuote()` 報價（pricing 已從 core 解耦） |
| `src/lib/engines/pricing-params.ts` | `PricingParams`（含 `quote_max_multiplier`）|
| `src/lib/engines/forecast-{db,tracker}.ts` | IndexedDB 預報快取（P1，未來搬 `@openlarm/training-adapters`） |
| `src/lib/engines/{airspace-zones,time-engine}.ts` | Taiwan 空域 + 工時估算（P1，未來 `@openlarm/airspace-taiwan` / `@openlarm/time`） |
| `src/app/api/weather/*` | Open-Meteo / ECMWF / CWA 氣象 API wrapper |
| `src/app/(main)/admin/params/page.tsx` | 參數管理 UI |
| `src/app/(main)/climate/page.tsx` | 365 日氣候日曆 |
| `src/app/(quote)/quote/` | 報價流程 |

## 參數覆寫機制（v2.0 拆分後）

客戶端覆寫走 `src/lib/params-store.ts`：
- LARM 參數覆寫 → localStorage key `larm_params_override` → `loadParamOverride()` / `saveParamOverride()`
- Pricing 覆寫 → localStorage key `pricing_params_override` → `loadPricingOverride()` / `savePricingOverride()`
- 讀取：`getParamsWithOverride()` = `mergeParams(TAIWAN_PARAMS_V2_0, override)`（pure function，無 browser 副作用）
- 引擎本身純函式，**永遠透過 options 顯式接受 params**：

```typescript
import { evaluateRisk } from "@openlarm/core"
import { TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"  // self-registers

const r = evaluateRisk(input, { params: TAIWAN_PARAMS_V2_0 })  // or getParamsWithOverride()
```

## 環境變數（`.env.local`，均為選填）

```
CWA_API_KEY=          # 台灣中央氣象署（強化雷雨預報精度）
OPEN_METEO_API_KEY=   # Open-Meteo 付費版（免費版功能已夠用）
```

## 路由結構

| 路由 | 說明 |
|---|---|
| `/` | Dashboard |
| `/missions` | 任務列表 |
| `/missions/new` | 新任務嚮導（Step 1–6） |
| `/climate` | 365 日氣候日曆 |
| `/quote` | 報價流程 |
| `/admin/params` | 模型參數管理 |
| `/api/weather/context` | Open-Meteo 氣象資料 API |
| `/api/weather/ensemble` | ECMWF 集成預報 API |
| `/api/weather/climate-profile` | ERA5 氣候統計 API |
| `/api/weather/health` | 氣象服務健康檢查 |

## 開發注意事項

- **TypeScript strict mode**：所有新程式碼需完整型別，`any` 不可用
- **App Router only**：使用 `src/app/`，不使用 `pages/`
- **模型參數變動**：必須在 `packages/regions-taiwan/src/v2.ts` 改，不可在引擎內硬編碼
- **core 必須零 browser 依賴**：不可在 `packages/core/` 內出現 `window` / `localStorage` / `typeof window`
- **git 分支**：在 `claude/` 前綴分支開發，完成後合回 `main`
- **Server Components**：API 路由（`route.ts`）為 server-only，不可 import client hooks
- **Vercel 部署**：`main` 為 production branch。frontend/vercel.json 用 `cd ../.. && npm install --include=optional` 從 workspace root 安裝

## 文件對照

| 文件 | 對象 | 內容 |
|---|---|---|
| `README.md` / `README.en.md` | 首次接觸者 | 專案入口、Safety Notice、快速開始 |
| `spec/LARM-v2.0.md` | 實作者 / 審計 | 3,000+ 行正式規範（RFC 2119 normative） |
| `low-altitude-ops-platform/LARM_CONCEPT_GUIDE.md` | 業務/主管/客戶 | 白話說明模型設計、GO/COND/NO-GO 邏輯 |
| `low-altitude-ops-platform/LARM_PARAM_GUIDE.md` | 系統操作員/工程師 | 參數公式、預設值、調整建議 |
| `MODEL_CHANGELOG.md` | 模型使用者 | v1.1 → v2.0 模型行為變更紀錄 |
| `CHANGELOG.md` | 所有人 | 版本變更紀錄（程式碼） |
| `CONTRIBUTING.md` / `GOVERNANCE.md` / `MAINTAINERS.md` | 貢獻者 | DCO+CCLA、三層治理、成員 |
| `LEGAL/DISCLAIMER.md` | 法律審閱 | 完整免責聲明（DRAFT，待律師定稿） |

## 開源發佈狀態（2026-04-24）

- ✅ `@openlarm/core@0.1.0-alpha.0` + `@openlarm/regions-taiwan@0.1.0-alpha.0` — 已 staged，pre-publish 驗證過（dry-run tarballs 50KB + 11KB）。正式 `npm publish` 仍待使用者 npm 登入授權。
- ✅ Vercel production deploy green on `main` branch。
- ⏸ 待外部處理：`LEGAL/DISCLAIMER.md` 律師定稿、GitHub teams `@openlarm/code-tsc` / `model-governance` / `spec-editors` 建立。
