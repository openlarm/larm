# Task 4 規劃：LARM 開源專案化補齊清單

> **定位**：Plan 1–3 聚焦「程式碼如何從 Next.js 拆出」，本 plan 補齊「變成真正開源專案」所需的法務、治理、安全、CI、社群、學術、供應鏈、品牌、啟動策略。

---

## 1. Context

前 3 份 plan 只解決 **30%** 的開源化工作（純程式碼層面）。剩下 70% 是「專案要成為開源專案本身」需要的一切其他東西。

**現狀盤點**（對 repo 掃描結果）：

- ❌ LICENSE、NOTICE、CoC、CONTRIBUTING、SECURITY、CODEOWNERS — 全缺
- ❌ `.github/workflows/` 不存在 — 沒有任何 CI
- ❌ 沒有測試框架（devDeps 無 vitest/jest）
- ❌ `package.json` 是 `private: true`，name 為 `"frontend"`
- ❌ 無 CHANGELOG、CITATION.cff、FUNDING.yml
- ⚠️ README 僅內部用途，無英文版
- ✅ 域文件（`LARM_CONCEPT_GUIDE` / `LARM_PARAM_GUIDE`）品質好
- ✅ 命名「LARM」已確定（但可用性未驗證）

**為什麼 LARM 情境特殊**：
1. **安全關鍵**：影響 GO/NO-GO 決策 → 責任歸屬、免責聲明標準高於一般 OSS
2. **域特定**：目前僅以台灣氣候驗證 → 需預留多區域架構
3. **商業意圖**：已有 pricing/quote 引擎 → 天然 Open Core 模式

---

## 2. 分類與優先順序

### P0 — 首次公開發佈前 Blockers（10 項）

| # | 項目 | 為什麼關鍵 |
|---|---|---|
| 1 | `LICENSE`（Apache 2.0） | 沒 license 等於法律上無人能使用 |
| 2 | `NOTICE` | Apache 2.0 要求，聲明著作權與衍生作品 |
| 3 | `package.json` 改：`private:false` + `name:"@larm/core"` + `"license":"Apache-2.0"` | 目前 `private:true` 直接擋住 npm 發佈 |
| 4 | **領域免責聲明**（README + LICENSE 補充） | LARM 影響 GO/NO-GO → 出事會被律師拉下水 |
| 5 | `SECURITY.md` + 回報管道（email + PGP key） | 安全關鍵模型必備 |
| 6 | 最小 CI（build + typecheck + lint，GitHub Actions） | 無 CI = 無人敢 fork |
| 7 | 開源版 `README.md`（根目錄，含徽章、安裝、授權、英文 stub） | 第一印象 |
| 8 | 測試框架（vitest）+ 至少 10 個 golden tests | 改 code 不會意外改動模型行為 |
| 9 | `CHANGELOG.md`（Keep a Changelog 格式）+ `MODEL_CHANGELOG.md` 分離 | 程式碼版本 vs 模型版本要分軌 |
| 10 | Copyright header 在所有 .ts 檔 | Apache 2.0 實務要求 |

### P1 — v0.1 發佈後 3 個月內（15 項）

| # | 項目 | 說明 |
|---|---|---|
| 11 | `CONTRIBUTING.md` | PR 流程、DCO sign-off、RFC 流程 |
| 12 | `CODE_OF_CONDUCT.md`（Contributor Covenant 2.1） | 社群健康基線 |
| 13 | `GOVERNANCE.md` | 三層治理：Code TSC / Model Governance / Spec Editors |
| 14 | `MAINTAINERS.md` | 誰有 merge 權 |
| 15 | `CODEOWNERS` | PR 自動指派 reviewer |
| 16 | PR template、3 種 issue template（bug / RFC / adapter） | 降低 signal-to-noise |
| 17 | `rfcs/0000-template.md` + RFC 流程文件 | 模型改動必經 RFC |
| 18 | Dependabot + CodeQL + npm provenance | 供應鏈安全 |
| 19 | Changesets + 自動 npm 發佈 workflow | 版本治理 |
| 20 | `CITATION.cff` | 學術引用 |
| 21 | Logo + 品牌視覺規範 | R0–R4 漸層配色視覺辨識 |
| 22 | 文件站（建議 Nextra，已是 Next.js 生態） | 規格 + API + 範例 |
| 23 | `README.en.md` + 核心 docs 英文化 | 出台灣必要 |
| 24 | Playground demo 站（`play.larm.dev` 或類似） | 最強 marketing 工具 |
| 25 | arXiv preprint（預印本論文） | 學術引用槓桿 |

### P2 — 社群成熟後（7 項）

| # | 項目 |
|---|---|
| 26 | `FUNDING.yml` + Open Collective |
| 27 | Trademark 註冊（"LARM" + logo） |
| 28 | 主動與監管機構溝通（台灣民航局、EASA） |
| 29 | 加入 foundation（OpenSSF 或 Linux Foundation LFAI） |
| 30 | 保險 / 風險轉嫁（E&O insurance） |
| 31 | Telemetry opt-in（若真需要） |
| 32 | Python port（`larm-py`）成為 reference implementation 之一 |

---

## 3. 需要使用者決策的 7 個關鍵議題

### A. 領域免責聲明措辭

LARM 影響「會不會讓無人機飛」的決策。假設某操作者依 LARM 判 GO → 墜機 → 律師找來，責任分配如何？

Apache 2.0 License 第 7 條已有標準免責（AS IS, NO WARRANTY），但**不夠**。需在 README 與 spec 兩處顯眼聲明：

```markdown
## ⚠️ Safety Notice

LARM is a **decision-support tool**, not a regulatory compliance certification.

This software:
- Does NOT guarantee flight safety
- Is NOT a substitute for Pilot-in-Command (PIC) judgment
- Is NOT approved by CAA/FAA/EASA or any aviation authority
- MUST be used in conjunction with applicable aviation regulations
- Operators bear full responsibility for all flight decisions

By using LARM, you agree that the authors and contributors bear no
liability for any outcome, direct or indirect, arising from its use.
```

**參考來源**：醫療 AI 領域 FDA "Software as a Medical Device" 免責範本。

### B. DCO vs CLA

| 方案 | 貢獻者體驗 | 法律保護 |
|---|---|---|
| **DCO** | 只需 `git commit -s` 加 `Signed-off-by:` | Apache 2.0 + 專利條款已足 |
| **CLA** | 需簽紙本或 CLA bot | 可收回授權重新發行 |

**建議 DCO**，理由：
1. Apache 2.0 已含專利授權
2. Open Core 模式下不需收回授權
3. 對亞洲貢獻者門檻最低

**CLA 的唯一使用情境**：未來想把 `@larm/core` 從 Apache 2.0 re-license 為 AGPL/BSL 雙授權。

### C. 三層治理模型（LARM 特有）

一般 OSS 有 BDFL 或 TSC 就夠。但 LARM 參數改 1 分就影響「會不會飛」的決策。建議三軌：

| 委員會 | 負責範圍 | 變動門檻 |
|---|---|---|
| **Code TSC** | `@larm/core` API、架構、效能 | 多數決 |
| **Model Governance Committee** | 參數值、W-code/R-level 邊界、硬停規則、WR matrix | **全體共識 + RFC** |
| **Spec Editors** | `LARM-v1.1.md` 規範性條款 | 與 Model Governance 同意 |

**實務**：第一年可由您一人身兼三職，但文件先立規則，有人加入時已有框架。

### D. 區域拆分（Region-agnostic 架構）

LARM 目前隱含台灣調校（`region_weight_table` 係數、W-code 閾值）。建議 **v0.1 就預留區域拆分**：

```
@larm/core                      — 模型框架、型別、計算邏輯（無區域資料）
@larm/regions-taiwan            — 台灣參數集（預設使用）
@larm/regions-japan             — 未來
@larm/regions-southeast-asia    — 未來
```

**好處**：
- 日本/韓國/菲律賓團隊可以貢獻自己的區域校準
- `@larm/core` 真正做到 region-agnostic
- 學術論文可單獨驗證「core framework」與「Taiwan calibration」

**代價**：v0.1 時程增加 ~1 週

### E. 學術路線（arXiv preprint）

若要被跨國採用，**發一篇 arXiv preprint** 是最高 ROI 動作：

- 標題：`LARM: A Deterministic Low-Altitude Drone Operation Risk Model for Subtropical Climates with SORA 2.5 Integration`
- 篇幅：5–8 頁；含公式、validation、vs. threshold-based approach 比較
- 發佈時機：GitHub release v0.1 後 2–4 週
- 效果：arXiv ID → citable → 進其他論文 → 事實標準

### F. 文件站技術棧

| 選項 | 優勢 | 劣勢 |
|---|---|---|
| **Nextra** | 和 frontend 一樣是 Next.js 生態；MDX 原生；Vercel 一鍵部署 | 社群較小 |
| **Docusaurus** | Meta 維護；plugin 生態最豐；多語言內建 | React 技術棧重；bundle 大 |
| **Starlight**（Astro） | 最快；SEO 最佳；支援多框架 | MDX 支援稍弱 |
| **VitePress** | Vue 生態；Vitest 團隊作品 | 若 playground 用 React 會混棧 |

**建議 Nextra** — 技術棧一致，維護成本最低。

### G. 品牌命名驗證

「LARM」需在開源前驗證：
- [ ] `larm.dev` / `larm.org` / `larm.io` 可否註冊
- [ ] npm `@larm` organization 可否
- [ ] GitHub org `@larm` 可否
- [ ] 英語圈諧音測試（alarm / lame）
- [ ] 既有產品衝突（Google "LARM drone"）

**備選命名**（若 LARM 不可用）：`openlarm`、`larm-spec`、`skyrisk`、`dronelarm`。

---

## 4. 要建立的關鍵檔案清單

實作階段會**新增**以下檔案（不修改既有程式碼，除 `package.json`）：

### 根目錄（12 個）
`LICENSE`、`NOTICE`、`README.md`（開源版）、`README.en.md`、`CHANGELOG.md`、`MODEL_CHANGELOG.md`、`SECURITY.md`、`CONTRIBUTING.md`、`CODE_OF_CONDUCT.md`、`GOVERNANCE.md`、`MAINTAINERS.md`、`CITATION.cff`

### `.github/`（10 個）
`CODEOWNERS`、`FUNDING.yml`、`dependabot.yml`、`PULL_REQUEST_TEMPLATE.md`、`ISSUE_TEMPLATE/bug_report.md`、`ISSUE_TEMPLATE/rfc.md`、`ISSUE_TEMPLATE/adapter_request.md`、`workflows/ci.yml`、`workflows/release.yml`、`workflows/codeql.yml`

### `rfcs/`、`spec/`
`rfcs/0000-template.md`、`spec/LARM-v1.1.md`（骨架，實作時參照 Task 2）、`spec/test-vectors/v1.1/`

### 修改 1 個既有檔案
`frontend/package.json` — 僅此處：`private:false`、`name:"@larm/core"`、加 `license`、`publishConfig`、`exports`、`files`

---

## 5. 相依關係與實作順序

```
Plan 1 解耦（P0 1–5）
    ↓
Plan 3 API 設計
    ↓
Plan 4 P0-1~10（LICENSE / CI / 免責 / README / 測試）
    ↓
首次 npm publish（@larm/core 0.1.0-alpha）
    ↓
Plan 2 spec 骨架補完 + arXiv preprint 草稿
    ↓
Plan 4 P1（治理 / 社群 / 品牌 / playground / 文件站）
    ↓
Public launch（Show HN + 發表 preprint）
    ↓
Plan 4 P2（funding / foundation / trademark / regulatory）
```

**關鍵時點**：第一次 `git push` 到 public repo 之前，Plan 4 的 P0 **必須**全部完成。否則：
- 無 LICENSE → 法律上無人可用
- 無免責 → 第一個事故律師就找上門
- 無 CI → 外部 PR 無從驗證

---

## 6. 非目標（明確排除）

本 plan **不涵蓋**：
- 程式碼重構本身（Plan 1/3 的範圍）
- 商業產品線規劃（企業版功能、定價、銷售）
- 技術實作細節（單一檔案的 YAML/文字內容）— 留到實作階段

---

## 7. 後續工作

此 plan 通過後：
1. ✅ 使用 `AskUserQuestion` 確認 7 個關鍵決策（下一輪）
2. 進入「建立實體檔案」的實作 phase
3. 建立檔案分兩批：
   - **Batch A（P0）**：LICENSE、README、SECURITY、CI、測試、package.json
   - **Batch B（P1）**：治理、社群、文件站、playground、品牌

每批獨立 PR，方便 review 與回退。
