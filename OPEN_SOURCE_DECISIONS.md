# LARM 開源化：關鍵決策記錄

> **目的**：記錄 4 份開源規劃文件（Audit + Task 2/3/4 Plans）之後，與專案擁有人確認的 7 個關鍵決策結果。
>
> **狀態**：已定案，進入實作規劃階段的依據。
>
> **日期**：2026-04-16

---

## 決策總覽

| # | 決策主題 | 結果 |
|---|---|---|
| 1 | 領域免責聲明強度 | **顯眼警告 + 法務審核** |
| 2 | 貢獻者授權機制 | **DCO（個人）+ CCLA（企業）** |
| 3 | 治理結構 | **三層治理**（Code TSC / Model Governance / Spec Editors） |
| 4 | 區域架構 | **v0.1 就拆 `@larm/regions-taiwan`** |
| 5 | 學術路線 | **自己寫 + 發 arXiv preprint** |
| 6 | 文件站技術棧 | **Nextra** |
| 7 | 品牌命名 | **完全重新命名，具體名稱之後再挑** |

---

## 1. 領域免責聲明：顯眼警告 + 法務審核

**決定**：README 頂部、spec 首頁、以及 `@larm/core` 套件 README 都放置顯眼的 Safety Notice；上線前請法務或執業律師審核確切措辭。

**範本方向**（待律師定稿）：
```
⚠️ SAFETY NOTICE
LARM is a decision-support tool, not a regulatory compliance certification.
- Does NOT guarantee flight safety
- Is NOT a substitute for Pilot-in-Command (PIC) judgment
- Is NOT approved by CAA/FAA/EASA or any aviation authority
- MUST be used with applicable aviation regulations
- Operators bear full responsibility for all flight decisions
```

**參考來源**：醫療 AI 領域 FDA "Software as a Medical Device" 免責範本。

**實作注意**：
- 此聲明需在 **3 處**同時出現：根目錄 README、spec LARM-v1.1.md §0、模型套件 README
- 法務審核後的最終版本需記入 `LEGAL/DISCLAIMER.md`
- 任何 README 更新 PR 不得移除此聲明（加到 CODEOWNERS 和 PR template 的 checklist）

---

## 2. 貢獻者授權：DCO（個人）+ CCLA（企業）

**決定**：
- 個人貢獻者在 commit 加 `Signed-off-by:`（DCO）
- 企業貢獻者由公司 entity 一次簽署 Corporate CLA，之後該公司所有員工貢獻覆蓋

**為什麼不純 DCO**：台灣業界對企業授權有明確法律背書需求。
**為什麼不純 CLA**：嚇跑個人貢獻者，門檻過高。
**參考先例**：Kubernetes、CNCF、Apache Software Foundation 皆採用此混合。

**實作注意**：
- `CONTRIBUTING.md` 需明確說明兩條路徑
- CCLA 範本可採 Apache Software Foundation 的 CCLA（改寫專案名即可）
- 個人 DCO 不需額外文件（Linux kernel 標準）
- 不需架設 CLA bot（初期 PR 量小，手動管理 CCLA 清單即可）

---

## 3. 治理結構：三層治理

**決定**：採用三層委員會，因 LARM 參數變動直接影響「會不會飛」的決策。

| 委員會 | 負責範圍 | 變動門檻 |
|---|---|---|
| **Code TSC** | `@larm/core` API、架構、效能、工具鏈 | 多數決 |
| **Model Governance Committee** | 參數值、W-code/R-level 邊界、硬停規則、WR matrix、EDR 閾值 | 全體共識 + RFC |
| **Spec Editors** | `LARM-v1.x.md` 規範性條款的措辭 | 與 Model Governance 共同簽核 |

**實務**：初期使用者一人身兼三職，但文件先立規則。有外部成員加入時已有框架。

**實作注意**：
- `GOVERNANCE.md` 詳列三個委員會組成規則、決策程序、異議處理
- `MAINTAINERS.md` 明確標示每個委員會成員（初期只有一人時也寫上）
- `CODEOWNERS` 按檔案類別分組：
  - `src/` → Code TSC
  - `src/lib/engines/weather-regime-params.ts` → Model Governance
  - `spec/` → Spec Editors
- 模型參數 PR 需 Model Governance 全員 approve（CODEOWNERS 強制）

---

## 4. 區域架構：v0.1 就拆

**決定**：第一次公開發佈 (`v0.1.0-alpha`) 即把台灣參數從 `@larm/core` 分離。

架構：
```
@larm/core                   — 模型框架、型別、計算邏輯（region-agnostic）
@larm/regions-taiwan         — 台灣氣候校準參數集（W-code 閾值、region_weight_table）
@larm/regions-japan          — 未來
@larm/regions-southeast-asia — 未來
```

**對 Task 3 API 的影響**：
- `evaluateRisk(input, options)` 的 `params` 必填（不再有預設台灣值）
- `@larm/regions-taiwan` 匯出 `TAIWAN_PARAMS_V2_0: WeatherRegimeParams`
- 呼叫端明確選擇：`import { TAIWAN_PARAMS_V2_0 } from "@larm/regions-taiwan"`
- 這是一個**預期的 breaking change**，但在 alpha 版就定型，避免正式版後再改

**對 Task 2 spec 的影響**：
- spec §10 參數章節拆為兩部分：
  - §10.1 Core parameter schema（normative）
  - §10.2 Taiwan calibration（informative；範例，非強制）
- 新增 §10.3 Region adapter specification（如何新增其他區域）

**代價**：v0.1 發佈時程增加約 1 週（多一個套件的 build/publish 配置）。

---

## 5. 學術路線：自己寫 arXiv preprint

**決定**：v0.1 發佈後 2–4 週內自行撰寫並發表 arXiv preprint。

**論文規劃**：
- **暫定標題**：`[NEW NAME]: A Deterministic Low-Altitude Drone Operation Risk Model for Subtropical Climates with SORA 2.5 Integration`
- **篇幅**：5–8 頁
- **內容**：
  1. Motivation（為什麼需要新模型，vs threshold-based）
  2. Model formulation（6 個組件、R-level mapping、gating）
  3. SORA 2.5 integration（M1A/M1B/M1C mitigations、iGRC）
  4. Taiwan calibration validation（需要 validation dataset — 這是要補的工作）
  5. Open-source ecosystem 概述
- **發表時機**：GitHub release v0.1 後 2–4 週
- **效益**：arXiv ID → citable → 進下游論文 → 事實標準

**實作注意**：
- **驗證資料集是關鍵前置**：Section 4 需要 N ≥ 100 的標註資料（任務輸入 → 實際結果）。若無，論文先用 synthetic benchmark 暫時取代，並在 Limitations 章節明說
- 使用 Overleaf + LaTeX (IEEE style 或 AIAA style)
- 採 CC BY 4.0 授權，鼓勵被引用
- 同步更新 `CITATION.cff`

---

## 6. 文件站技術棧：Nextra

**決定**：採 Nextra（Next.js 生態）。

**理由**：
- 現有 `frontend/` 已是 Next.js，技術棧一致
- MDX 原生支援 → spec 文件可內嵌互動範例
- Vercel 一鍵部署
- 維護成本最低

**建議部署結構**：
```
docs.[new-name].dev     ← Nextra 文件站（API reference + spec + 教學）
play.[new-name].dev     ← Playground（互動範例）
www.[new-name].dev      ← Landing page（可併入 docs 或獨立）
```

---

## 7. 品牌命名：重新命名

**決定**：放棄「LARM」作為專案/套件/域名識別，具體名稱**之後再挑**。

**發現的衝突**：
- `larm.dev` — 已被商用 uptime monitoring SaaS 占用（2026 仍在運營，EU 主機，$19–49/月）
- `larm.io` — 待售 $1,199
- GitHub `@larm` — 2015 建立的低活躍個人帳號占用
- Trademark Class 42 風險：larm.dev 若申請 → 我們的無人機 SaaS 可能衝突
- 瑞典/挪威語 "larm" = 警報/噪音（對安全工具反而語意契合，但北歐市場有品牌混淆風險）
- 無任何衝突的部分：USPTO 無人機/航空風險領域無 LARM 商標

**模型本身仍稱 LARM**（類似 COCO dataset 模式）：
- 規格文件可保留 `LARM-v1.1.md` 命名
- 模型概念 / acronym 保留
- 只更換 npm scope / github org / 域名 → 用全新名稱

**候選名稱初擬**（待後續確認可用性）：
- `uasrisk` — 業界術語（UAS = Unmanned Aircraft System）
- `skyrm` — 短、清晰（sky + risk model）
- `dronecast` — 類比 weathercast，暗示預報
- `airrm` — 短、中性
- `opensky-risk` — 呼應開源 + 空域
- `aeroguard` — 防護形象
- `larm-spec` — 保留 LARM 識別的折衷方案（npm `@larm-spec/core`）

**後續工作**：
1. 每個候選名做可用性檢查（domain / npm / github / trademark）
2. 找台灣/英語圈 native speaker 各 1–2 位做「唸起來順不順」測試
3. 選定後 1 週內註冊所有 handle

**短期做法**：
- 實作階段暫用 placeholder（程式碼 import 寫死、之後 find-replace 即可）
- `CLAUDE.md` 和 spec 文件可以暫時繼續用 LARM（反正模型名不變）

---

## 對實作順序的影響

這些決策確立後，**Batch A（P0 檔案建立）** 可以開始：

### Batch A — 首次公開發佈前必做（10 檔）
1. `LICENSE`（Apache 2.0 全文）
2. `NOTICE`（含 LARM 著作權聲明）
3. `README.md`（開源版，**含 Safety Notice**）
4. `README.en.md`
5. `SECURITY.md`（含回報 email + PGP key）
6. `CHANGELOG.md`（Keep a Changelog 格式）
7. `MODEL_CHANGELOG.md`（單獨記錄模型參數變動）
8. `.github/workflows/ci.yml`（build + typecheck + lint）
9. `frontend/package.json` 改：`private:false` + 加 `license` 欄位（name 待命名確定再改）
10. vitest 設定 + 10 個 golden tests

### Batch A' — 依賴前面的決策（6 檔）
1. `CONTRIBUTING.md`（含 DCO + CCLA 流程）
2. `GOVERNANCE.md`（三層治理）
3. `MAINTAINERS.md`
4. `.github/CODEOWNERS`（依三層治理分工）
5. `CORPORATE_CLA.md`（CCLA 範本）
6. `LEGAL/DISCLAIMER.md`（律師定稿版免責）

### Batch B — v0.1 發佈後（P1）
7. `CODE_OF_CONDUCT.md`（Contributor Covenant 2.1）
8. `rfcs/0000-template.md` + RFC 流程文件
9. PR template、3 種 issue template
10. `.github/dependabot.yml`
11. `.github/workflows/codeql.yml`
12. `.github/workflows/release.yml`（changesets + npm provenance）
13. `CITATION.cff`
14. Logo + 品牌視覺規範
15. Nextra 文件站 scaffold

### Batch C — 平行工作
- arXiv preprint 草稿（可在 Batch A 進行時平行）
- 命名候選篩選（進 Batch B 前要定案）
- Model Governance Committee 章程具體條款
- 驗證資料集蒐集（arXiv 論文需要）

---

## 懸而未決的事項（下一輪要繼續討論）

1. **最終命名**：用哪個候選？何時註冊？
2. **律師諮詢管道**：台灣律所？哪一家？預算？
3. **CCLA 簽署流程**：初期只有自己，但架構要先設好
4. **Model Governance 成員招募**：何時開始找第二人？（業界、學界都可）
5. **arXiv 驗證資料集**：有多少歷史任務資料可用？需不需要先做資料清理？
6. **Playground 的技術實作**：要用現有 `(quote)/quote/` 拆出來，還是全新做？

---

## 參考前置文件

- [OPEN_SOURCE_DECOUPLING_AUDIT.md](./OPEN_SOURCE_DECOUPLING_AUDIT.md) — engines 耦合盤點
- [OPEN_SOURCE_TASK_2_PLAN.md](./OPEN_SOURCE_TASK_2_PLAN.md) — spec 文件骨架
- [OPEN_SOURCE_TASK_3_PLAN.md](./OPEN_SOURCE_TASK_3_PLAN.md) — `@larm/core` API 設計（需依本文件 §4 更新為 region-agnostic）
- [OPEN_SOURCE_TASK_4_PLAN.md](./OPEN_SOURCE_TASK_4_PLAN.md) — 開源就緒清單與 32 項 P0/P1/P2 任務
