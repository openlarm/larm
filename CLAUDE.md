# GDS-mission-mock — Low Altitude Ops Platform

## 專案定位

低空作業風險管理平台，核心為 **LARM v1.1（Low Altitude Risk Model）**。
前端為 Next.js 16 App Router，部署於 Vercel。

## 工作目錄

```
low-altitude-ops-platform/
  frontend/          ← 主程式（Next.js 16）
  LARM_CONCEPT_GUIDE.md   ← 白話說明文件（給非技術人員）
  LARM_PARAM_GUIDE.md     ← 技術參數手冊（公式 + 調整建議）
```

## 開發指令

```bash
cd low-altitude-ops-platform/frontend
npm run dev      # 開發伺服器 http://localhost:3000
npm run build    # TypeScript 型別檢查 + Vercel build 驗證
npm run lint     # ESLint
```

## LARM 模型核心概念

```
R_score = Base(W) + WeatherNow + B_score + O_score + E_score   [0–100]
        → R-level (R0–R4)
        → Decision: GO / CONDITIONAL (Tier A/B/C) / NO-GO
        → Buffer Ratio (5%–40%)
        → Completion Probability (5%–99%)
```

| 組件 | 上限 | 說明 |
|---|---|---|
| Base(W) | 3–22 | W-code 天候底分 |
| WeatherNow | 0–50 | 即時風雨評分（風×0.55 + 雨×0.35 + 不穩定×0.15）|
| B_score | 0–25 | 建物難度（樓層/海拔/立面/環境危害）|
| O_score | 0–15 | 作業情境（夜間/週末/急件/人流/疲勞）|
| E_score | 0–10 | 設備狀態（Block+4 / Warn+2 每件）|

**R-level 邊界**：R0(0–20) / R1(21–40) / R2(41–65) / R3(66–85) / R4(86–100)

**硬停規則**：風速 ≥ 39 km/h 或（雨量 > 10 mm/h 且機率 > 60%）→ 強制 NO-GO

## 關鍵檔案（相對於 frontend/）

| 檔案 | 用途 |
|---|---|
| `src/lib/engines/risk-engine.ts` | LARM v1.1 主引擎：`evaluateRisk()` |
| `src/lib/engines/weather-regime-params.ts` | 所有可調參數 + `getParams()` |
| `src/lib/engines/model-helpers.ts` | `inferWCode()` / `completionForRL()` / `getWRDecision()` |
| `src/lib/engines/pricing-engine.ts` | `generateQuote()` 報價引擎 |
| `src/lib/types.ts` | 全域型別定義 |
| `src/app/api/weather/context/route.ts` | Open-Meteo 氣象 API（歷史 30d + 預報 14d）|
| `src/app/api/weather/climate-profile/route.ts` | ERA5 三年氣候統計 |
| `src/app/api/weather/ensemble/route.ts` | ECMWF 集成預報（P10/P50/P90）|
| `src/app/(main)/admin/params/page.tsx` | 參數管理 UI（6 個 Tab）|
| `src/app/(main)/climate/page.tsx` | 365 日氣候日曆 |
| `src/app/(quote)/quote/` | 報價流程（多步驟嚮導）|
| `src/app/(main)/missions/` | 任務管理 |

## 參數覆寫機制

- **可調參數**（透過 Admin Params UI）：`WeatherRegimeParams` 存於 `localStorage` key `larm_params_override`
- `getParams()` 在 client side 讀 localStorage，server side 讀程式碼預設值
- **唯讀參數**（硬編碼，需改原始碼）：B_score / O_score / E_score 分值、pricing 費率

```typescript
// 讀取流程
getParams(version?)
  → localStorage.getItem("larm_params_override")  // client: 優先覆寫
  → WEATHER_REGIME_PARAMS_V1                       // 預設值
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
| `/missions/new` | 新任務嚮導（Step 1–6）|
| `/climate` | 365 日氣候日曆 |
| `/quote` | 報價流程 |
| `/admin/params` | 模型參數管理（需登入）|
| `/api/weather/context` | 氣象資料 API |
| `/api/weather/ensemble` | 集成預報 API |
| `/api/weather/climate-profile` | 氣候統計 API |
| `/api/weather/health` | 氣象服務健康檢查 |

## 開發注意事項

- **TypeScript strict mode**：所有新程式碼需完整型別，`any` 不可用
- **App Router only**：使用 `src/app/`，不使用 `pages/`
- **新參數**：應加入 `weather-regime-params.ts`，勿直接在引擎中硬編碼
- **git 分支**：在 `claude/` 前綴分支開發，不直接推送到 `main`
- **Server Components**：氣象 API 路由（`route.ts`）為 server-only，不可 import client hooks

## 文件對照

| 文件 | 對象 | 內容 |
|---|---|---|
| `LARM_CONCEPT_GUIDE.md` | 業務/主管/客戶 | 白話說明模型設計、GO/COND/NO-GO 邏輯 |
| `LARM_PARAM_GUIDE.md` | 系統操作員/工程師 | 所有參數公式、預設值、調整建議 |
