# LARM — Low Altitude Risk Model

> 無人機低空作業的**風險評估決策支援模型**。開源規範 + TypeScript 參考實作。
>
> **Model repo**: `openlarm/core` (upcoming) · **Spec**: `openlarm/spec` (upcoming) · **Docs**: docs.openlarm.org (upcoming)

🇺🇸 [English version](./README.en.md)

---

## ⚠️ Safety Notice（安全聲明）

> **LARM 是決策支援工具，不是法規合規證明。**
>
> - ❌ **不保證**飛行安全
> - ❌ **不能取代**機長（PIC）的現場判斷
> - ❌ **未經** CAA / FAA / EASA / 任何航空主管機關認可或核可
> - ✅ **必須**配合所在區域的適用航空法規一併使用
> - ✅ **操作者**對所有飛行決策承擔全部責任
>
> 本聲明最終措辭將於 v0.1 正式發佈前由執業律師定稿。
> See [`LEGAL/DISCLAIMER.md`](./LEGAL/DISCLAIMER.md) for the authoritative draft.

---

## 這是什麼

LARM（Low Altitude Risk Model，低空作業風險模型）是一套為低空無人機作業
（如建物外牆清洗、巡檢、塗裝、太陽能板維護）設計的**決定性（deterministic）**
風險評估模型，依當地氣候、作業環境、設備與人員狀態，計算單次作業的：

- **R-score**（0–100 綜合風險分數）
- **R-level**（R0 ～ R4）
- **決策結論**（GO / CONDITIONAL-Tier / NO-GO）
- **時間緩衝比例**（buffer ratio，5%–55%）
- **完工機率**（5%–99%）

和傳統「看單一風速門檻就 GO/NOGO」的硬門檻方法不同，LARM 同時考慮：

| 組件 | 說明 | 範圍 |
|---|---|---|
| **Base(W)** | 30 日氣候背景等級（W0–W5） | 3–22 |
| **WeatherNow** | 今日即時風雨 + EDR 湍流 | 0–42 |
| **G_score** | 建物/地面風險（含 SORA 2.5 iGRC） | 0–20 |
| **O_score** | 作業情境（夜間/週末/急件/人流/疲勞） | 0–12 |
| **E_score** | 設備狀態（Block / Warn 分級） | 0–8 |

---

## 當前狀態

| 項目 | 狀態 |
|---|---|
| 引擎版本 | **LARM v2.0**（SORA 2.5 GRC 整合 + EDR 湍流） |
| 授權 | **Apache License 2.0** |
| 公開套件 | 計畫中（`@openlarm/core`、`@openlarm/regions-taiwan`） |
| 規範文件 | 撰寫中（`spec/LARM-v2.0.md`） |
| CI | ✅ build + typecheck + lint + vitest golden tests |
| v0.1 發佈 | 預計 2026 Q2–Q3 |

> 目前 repo 主要程式碼仍在 `low-altitude-ops-platform/frontend/`（Next.js 應用完整版），
> 模型引擎獨立套件（`@openlarm/core`）將在 v0.1 發佈時從此 monorepo 抽出。

---

## 快速開始

### 執行現有 Next.js 應用（需 Node.js 20+）

```bash
cd low-altitude-ops-platform/frontend
npm install
npm run dev      # http://localhost:3000
```

### 使用模型引擎（未來 `@openlarm/core` 發佈後）

```ts
import { evaluateRisk } from "@openlarm/core"
import { TAIWAN_PARAMS_V2_0 } from "@openlarm/regions-taiwan"

const result = evaluateRisk({
  weather_30d: { /* ... */ },
  weather_today: { wind_now_kmh: 18, rain_prob_today_pct: 20, /* ... */ },
  building: { site_altitude_m: 25, /* ... */ },
}, { params: TAIWAN_PARAMS_V2_0 })

console.log(result.risk_level, result.decision, result.buffer_ratio)
// → "R1", "GO", 0.12
```

---

## 文件導覽

| 文件 | 對象 | 內容 |
|---|---|---|
| [`README.en.md`](./README.en.md) | 國際使用者 | English mirror |
| [`CLAUDE.md`](./CLAUDE.md) | 維護者 / AI | 專案結構與開發指令 |
| [`low-altitude-ops-platform/LARM_CONCEPT_GUIDE.md`](./low-altitude-ops-platform/LARM_CONCEPT_GUIDE.md) | 業務、主管、客戶 | 白話說明模型與決策邏輯 |
| [`low-altitude-ops-platform/LARM_PARAM_GUIDE.md`](./low-altitude-ops-platform/LARM_PARAM_GUIDE.md) | 操作員、工程師 | 參數公式與調整建議 |
| [`OPEN_SOURCE_DECOUPLING_AUDIT.md`](./OPEN_SOURCE_DECOUPLING_AUDIT.md) | 貢獻者 | 解耦盤點報告 |
| [`OPEN_SOURCE_TASK_2_PLAN.md`](./OPEN_SOURCE_TASK_2_PLAN.md) | 貢獻者 | spec 骨架計畫 |
| [`OPEN_SOURCE_TASK_3_PLAN.md`](./OPEN_SOURCE_TASK_3_PLAN.md) | 貢獻者 | `@openlarm/core` API 設計 |
| [`OPEN_SOURCE_TASK_4_PLAN.md`](./OPEN_SOURCE_TASK_4_PLAN.md) | 貢獻者 | 開源就緒清單 |
| [`OPEN_SOURCE_DECISIONS.md`](./OPEN_SOURCE_DECISIONS.md) | 貢獻者 | 7 個關鍵決策記錄 |
| [`CHANGELOG.md`](./CHANGELOG.md) | 所有人 | 版本變更紀錄 |
| [`MODEL_CHANGELOG.md`](./MODEL_CHANGELOG.md) | 模型使用者 | 模型參數與公式變更紀錄 |
| [`SECURITY.md`](./SECURITY.md) | 資安研究者 | 漏洞回報流程 |

---

## 核心硬停規則（Hard Stops）

即使其他條件極佳，下列任一情況觸發**強制 NO-GO**，不可人工覆蓋：

- 🌪️ **即時風速 ≥ 39 km/h**
- 🌧️ **雨量 > 10 mm/h 且降雨機率 > 60%**
- 💨 **EDR（湍流）> 0.8**（v2.0 新增）
- 📈 **R_score > r4_nogo_threshold**（R4 分級上限）

所有硬停規則皆為**非政策性（non-policy）技術門檻**，由 LARM v2.0 規範明定。

---

## 貢獻

歡迎貢獻！在送出 PR 前請閱讀：

- [`CONTRIBUTING.md`](./CONTRIBUTING.md) — DCO + CCLA 流程
- [`GOVERNANCE.md`](./GOVERNANCE.md) — 三層治理結構
- [`MAINTAINERS.md`](./MAINTAINERS.md) — 委員會成員列表
- [`CORPORATE_CLA.md`](./CORPORATE_CLA.md) — 企業 CLA 範本（pending lawyer）
- [`LEGAL/DISCLAIMER.md`](./LEGAL/DISCLAIMER.md) — 完整免責聲明草稿
- [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md)（upcoming）— Contributor Covenant 2.1

### 治理模式預告

| 委員會 | 審核範圍 |
|---|---|
| **Code TSC** | `@openlarm/core` API、架構、效能 |
| **Model Governance** | 參數、W-code/R-level 邊界、硬停規則 |
| **Spec Editors** | 規範文件措辭 |

個人貢獻用 **DCO**（commit `Signed-off-by:`）；企業貢獻簽 **CCLA**（一次簽署，員工都覆蓋）。

---

## 授權

本專案以 **[Apache License 2.0](./LICENSE)** 發佈。
著作權歸 **The LARM Authors**（所有貢獻者集體）所有。
詳見 [`NOTICE`](./NOTICE) 對外部資料來源與第三方套件的歸屬。

---

## 引用

若在學術工作中使用 LARM，請引用（CITATION.cff 與 arXiv preprint 將於 v0.1 發佈後提供）：

```
The LARM Authors (2026). LARM: A Deterministic Low-Altitude Drone Operation
  Risk Model for Subtropical Climates with SORA 2.5 Integration.
  arXiv preprint (pending).
```

---

## 聯絡 / 回報安全問題

見 [`SECURITY.md`](./SECURITY.md)。一般問題請開 GitHub issue。
