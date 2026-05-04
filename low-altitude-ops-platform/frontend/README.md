# Low Altitude Ops Platform — Frontend

低空作業平台前端（LARM v1.1）

## 環境需求

- Node.js 18+
- npm 9+

## 常用指令

```bash
# 開發伺服器（http://localhost:3000）
npm run dev

# TypeScript 型別檢查 + 生產 build
npm run build

# Lint
npm run lint
```

## 環境變數（均為選填）

在 `frontend/` 目錄下建立 `.env.local`：

```
CWA_API_KEY=          # 中央氣象署 F-C0032-001（雷雨預報強化）
OPEN_METEO_API_KEY=   # Open-Meteo 付費版（免費版不需要）
```

兩個變數均為選填。未設定時系統自動降級：CWA 雷雨預報停用，Open-Meteo 走免費端點。

## 目錄結構

```
src/
├── app/
│   ├── (main)/
│   │   ├── admin/params/     # 參數管理 UI（6 個 Tab）
│   │   ├── climate/          # 365 日氣候日曆
│   │   └── missions/new/     # 任務建立精靈（6 步驟）
│   └── api/
│       └── weather/
│           ├── context/      # Open-Meteo 30 天歷史 + 14 天預報
│           ├── climate-profile/ # ERA5 三年氣候統計
│           ├── ensemble/     # ECMWF IFS 50 成員機率預報
│           └── health/       # 氣象服務健康檢查
├── components/
│   ├── layout/               # Sidebar、Header
│   └── wizard/steps/         # Step1–Step6 精靈步驟元件
└── lib/
    ├── engines/
    │   ├── risk-engine.ts        # LARM v1.1 主引擎
    │   ├── weather-regime-params.ts  # 所有可調參數（含 getParams()）
    │   ├── model-helpers.ts      # inferWCode / completionForRL / getWRDecision
    │   └── pricing-engine.ts     # 報價引擎
    └── types.ts                  # 全域型別定義
```

## 關鍵 API 路由

| 路由 | 方法 | 說明 |
|---|---|---|
| `/api/weather/context` | GET | 30 天歷史統計 + 14 天預報，需 `lat` / `lng` 參數 |
| `/api/weather/climate-profile` | GET | ERA5 三年氣候分析，需 `lat` / `lng` |
| `/api/weather/ensemble` | GET | ECMWF IFS 50 成員，需 `lat` / `lng` / `days` |
| `/api/weather/health` | GET | 檢查所有氣象服務狀態 |

## 參數系統（Admin Params UI）

參數管理介面位於 `/admin/params`，提供 6 個 Tab：

| Tab | 說明 |
|---|---|
| 天候分類 | W-code 分類閾值（風速、降雨、不穩定指數） |
| 天況評分 | WeatherNow 風雨分數表、權重、硬停規則 |
| 緩衝係數 | Buffer ratio 公式係數 |
| WR 矩陣 | 6×5 GO / CONDITIONAL / NO-GO 決策矩陣 |
| R指標 | B_score / O_score / E_score / 完成率（唯讀參考） |
| 報價 | 定價引擎參數（唯讀參考） |

**localStorage 覆寫機制**：Admin UI 將修改存入 `larm_params_override` key（JSON），`getParams()` 在 client side 優先讀取 localStorage，server side 使用預設值。B/O/E score 與定價參數目前為唯讀，不支援覆寫。

## LARM 模型快速說明

```
R_score = Base(W) + WeatherNow + B_score + O_score + E_score   [0–100]
        → R-level (R0–R4)
        → Decision: GO / CONDITIONAL (Tier A/B/C) / NO-GO
```

詳見 `../LARM_CONCEPT_GUIDE.md`（白話說明）或 `../LARM_PARAM_GUIDE.md`（技術手冊）。
