# UI Flow — Low Altitude Operations Platform (Mock)

**版本：** v1.0 (Presentation Prototype)
**用途：** 會議展示用高擬真流程稿（可直接交給 Claude Code / Figma 設計）

---

## 0. 產品定位（在 UI 中必須可被感知）

本系統是「任務生成 + 風險控制 + 合規留痕」的決策中樞，不是 CRM / 排班工具。

**UI 原則：**

- 每一步都要呈現「輸入 → 判定 → 輸出」
- 每一步都要顯示「規則版本 / 評估時間 / 負責人」
- 核心引擎（風險 / 報價 / 時間）對外顯示 *解釋*，不顯示公式細節

---

## 1. 主要導覽與頁面結構（Mock 必備）

### Global Navigation

| 項目 | 說明 |
|---|---|
| Missions（任務） | 主要作業入口 |
| Buildings（建物庫） | 建物資料管理 |
| Teams（人員/認證） | 飛手與資格管理 |
| Equipment（設備履歷） | 設備健康與校準 |
| Rules & Versions（規則/參數版本） | Mock 可只做展示頁 |
| Documents（文件中心） | 可選 |

### Mission 主流程頁面（Stepper）

- **New Mission Wizard**（新任務精靈）— 主要 Demo 使用
- **Mission Detail**（任務詳情頁）

---

## 2. New Mission Wizard（10 步驟 Stepper）

> 核心展示流程：地址 → 空域 → 建物 → 天氣 → 風險 → 時間 → 報價 → 指派 → 規劃書 → 申請包

---

### Step 1 — Address Input（輸入地址）

**UI 元件**

- Address text input（必填）
- Mission type selector（必填：Cleaning / Inspection / Coating / Solar / Other）
- 客戶 / 案名（可選）

**系統行為（Mock）**

- 一鍵「解析地址」
- 顯示解析結果卡片（可寫死資料）

**輸出（需顯示）**

| 欄位 | 說明 |
|---|---|
| 經緯度 | Lat / Lng |
| 海拔 | m |
| 行政區 | 縣市 / 區 |
| 解析狀態 | Success / Failed |
| Evidence Snapshot | 已保存（mock） |

**Error States**

- 地址無法解析 → 提示手動輸入 lat/lng（mock 可省略）
- 任務類型未選 → 不可下一步

---

### Step 2 — Airspace Check（空域確認）

**UI 元件**

- Airspace status card（OK / Need Permit / No-Fly）
- Map preview（可選，mock 可用靜態圖）
- Notes（可選）

**輸出（需顯示）**

| 欄位 | 說明 |
|---|---|
| 空域結果 | ✅ 可作業 / ⚠ 需申請 / ❌ 禁飛 |
| 申請原因 | 文字說明 |
| 影響 | 是否增加行政天數（例如 +3 天） |
| `ruleset_version` | 例如：ruleset_v1.0 |

**Error States**

- 禁飛（No-Fly）→ 顯示「任務不可生成」+ 提供「建立例外申請」按鈕（mock 可做不可點）

---

### Step 3 — Building Basics（建物基本資料）

**UI 元件（表單）**

| 欄位 | 型別 | 必填 |
|---|---|---|
| Building name / label | text | 可選 |
| Height（m 或 floors） | number | ✅ |
| Building type | select：commercial / luxury / house / factory / solar | ✅ |
| Number of facades | number（預設 4，可調） | ✅ |
| Rooftop access condition | select：Good / Limited / Not Available | 可選 |
| Water supply | select：Provided / Need Self-supply | ✅ |
| Power supply | select：Provided / Need Self-supply | ✅ |

**輸出（需顯示）**

- 建物摘要卡（高度、類型、水電、屋頂）

**Error States**

- 高度 / 類型未填 → 不可下一步

---

### Step 4 — Facade Scope（立面範圍與面積）

**UI 元件**

- Facade list（N / E / S / W 或 A / B / C）
  - `area_m2`（必填）
  - `material`（tile / stone / glass / metal / paint / solar）
  - `complexity`（none / light / medium / heavy）
  - Constraints toggles（封路、空間 < 5m、高壓電 / 基地台、水電自備、屋頂條件不佳）
- Quick add presets（可選）

**輸出（需顯示）**

| 欄位 | 說明 |
|---|---|
| Total area | 合計面積（㎡） |
| Scope summary | 哪些立面包含在本次任務 |

**Error States**

- 面積為 0 或缺失 → 不可下一步

---

### Step 5 — Weather Window（可作業日期 / 天候窗口）

**UI 元件**

- Date range selector（未來 7–14 天）
- Weather table（每日：風速 / 降雨 / 類型 W / 風險 R 預估 / 完成機率）— mock 用假資料
- Filter toggles（Hide R3 / R4）

**輸出（需顯示）**

| 欄位 | 說明 |
|---|---|
| 建議日期 Top 3 | 按完成機率排序 |
| Selected date | 必選，帶入後續流程 |

**Error States**

- 選到 R4 → 彈出「不建議，需改期或申請例外」

---

### Step 6 — Risk Evaluation（風險評估）

**UI 元件**

- Risk result card（W×R、Internal Grade、Go / Conditional / No-Go）
- Required controls checklist（自動產生）
- Approval requirement banner（若 Conditional）

**輸出（需顯示）**

| 欄位 | 說明 |
|---|---|
| `W` | 天候類型（W0–W5） |
| `R` | 風險等級（R0–R4） |
| Internal risk grade | A / B / C / D |
| 決策 | GO / CONDITIONAL / NO-GO |
| 升級審核需求 | 若有，說明條件 |
| `ruleset_version` | 版本號 |
| `evaluated_at` | 評估時間（mock 可固定） |
| `evaluator` | 評估者（mock 可固定） |

**Error States**

- NO-GO → 停止流程 + 允許返回修改日期 / 條件

---

### Step 7 — Time Estimation（作業時間預測）

**UI 元件**

- Time estimate summary card（總工時、建議天數、每日工時）
- Productivity breakdown（baseline + 各係數）— mock 顯示計算摘要即可
- Buffer & rest details（中斷預留 %、休息時間）

**輸出（需顯示）**

| 欄位 | 說明 |
|---|---|
| `adjusted_productivity_m2ph` | 調整後效率（㎡/人時） |
| `total_hours` | 總工時 |
| `total_minutes` | 總分鐘數 |
| `suggested_days` | 建議作業天數 |
| `disruption_buffer_ratio` | 中斷預留比例 |
| `time_model_version` | 版本號 |

**Error States**

- 建議天數 > 可選日期窗口 → 提示「需拆分多日」並回到 Step 5

---

### Step 8 — Pricing（報價預覽）

**UI 元件**

- Quote total card（總價、幣別、有效期限）
- Line items（對外可見：代碼與原因，不顯示內部公式）
- Risk attachment preview（W×R 說明附件）
- Margin guardrail banner（內部用，mock 可顯示：Margin OK）

**輸出（需顯示）**

| 欄位 | 說明 |
|---|---|
| `subtotal` | 整案小計 |
| `total` | 最終報價 |
| `quote_code` | Q-YYYYMMDD-xxx |
| W×R 代碼 | 顯示於報價單 |
| `pricing_version` | 版本號 |

**Error States**

- 低於低消 → 自動套用低消並提示原因
- 毛利過低 → 顯示「需主管審核」（Approval）

---

### Step 9 — Assign Team & Equipment（指派團隊與設備）

**UI 元件**

- Team picker（飛手、觀察手、安全員、PM）
- Qualification check results（pass / fail + reason）
- Equipment picker（drone / module / pump / hose…）
- Equipment health check results（ok / warn / block）

**輸出（需顯示）**

| 欄位 | 說明 |
|---|---|
| Assignment summary | 人員與設備彙整 |
| Fail 原因 | 每個 fail 必須顯示原因與解決方式 |

> 若任何 fail → 不能進入下一步（或觸發例外審核）

**Error States**

- 飛手證照過期 → 提示不能指派
- 設備 `health_status = block` → 提示更換設備

---

### Step 10 — Mission Plan & Permit Package（規劃書 + 申請包）

**UI 元件**

- Generate buttons：
  - Generate Mission Plan（PDF / Preview）
  - Generate Permit Package（PDF / Zip / JSON）
- Document preview panel（mock 用靜態預覽）
- Final status badge（Mission Ready / Pending Approval / Blocked）

**Mission Plan 包含：**

| 區塊 | 內容 |
|---|---|
| 任務摘要 | 類型、地點、預計日期 |
| 建物資訊 | 樓層、面積、結構特徵 |
| 風險等級 | W×R 分級結果 |
| 作業時間預測 | 總工時、建議天數、中斷預留 |
| 團隊配置 | 飛手、地勤、督導 |
| 設備清單 | 機體、電池、工具 |
| 空域狀態 | 可行性判定、申請狀態 |
| 控制措施 | 必要安全控制清單 |
| 版本資訊 | ruleset_version / pricing_version / time_model_version |

**Error States**

- 若未完成必要審核（Approval pending）→ 顯示「不可產出申請包」

---

## 3. Mission Detail（任務詳情頁）

> 用於會議展示「留痕與回溯」— 非常重要

### Sections

| Section | 內容 |
|---|---|
| 1. Overview | 任務摘要 + 狀態 |
| 2. Timeline / Audit | 每一步的事件與版本紀錄 |
| 3. Risk & Compliance | 風險結果、控制措施、審核紀錄 |
| 4. Time Estimation | 估算結果與 breakdown |
| 5. Pricing | 報價、附件、版本 |
| 6. Assignments | 人員與設備 |
| 7. Documents | 規劃書 / 申請包 / 附件 |

### 必須顯示

- `Mission Status`
- `Last Updated`
- `Rule / Price / Time Versions`
- `Evidence Snapshots`（至少顯示「已保存」與 ID）

---

## 4. Admin / Reference Pages（Mock 可做簡版）

### Buildings（建物庫）

- 建物列表、立面資料、歷史任務連結

### Teams（人員/認證）

- 人員列表、證照到期提醒（mock 可用標籤顯示）

### Equipment（設備履歷）

- 設備列表、健康狀態、最近保養 / 校準（mock 可固定）

### Rules & Versions（版本展示頁）

- `ruleset_version` 列表（active / archived）
- `pricing_version` 列表
- `time_model_version` 列表

> Mock 只要能展示「版本化」概念，不必可編輯

---

## 5. Mock Data Requirements（最少要準備）

| 類型 | 數量 | 說明 |
|---|---|---|
| 地址案例 | 3 | OK / Need Permit / No-Fly |
| 天氣情境 | 3 | W0–R0 / W1–R2 / W5–R3 |
| 建物模板 | 3 | 商辦 / 豪宅 / 工廠 |
| 團隊組合 | 2 | 資格完整 vs 缺證照 |
| 設備組合 | 2 | 健康 OK vs Block |

---

## 6. Demo Script 指示（UI 要配合）

每個 step 的右上角顯示：

```
Ruleset: v1.0   Pricing: v1.0   Time Model: v1.0   Evidence Saved ✓
```

> 這會在會議中強化「合規留痕 + 版本化」的核心敘事。

---

## 7. Out of Scope（Mock 不做的事）

- 真實空域 API 串接
- 真實天氣 API 串接
- 真實資料庫與權限系統
- 真實 PDF 生成（可用靜態模板）
- 真實簽核流程（可用假按鈕 / 假狀態）

---

## 8. Success Criteria（會議展示成功標準）

- 觀眾能在 10 分鐘內理解：這是決策引擎，不是排班
- 能看懂 W×R 與 Conditional Go 的邏輯
- 能看懂作業時間預測如何影響報價與排程
- 能看到「版本化與留痕」頁面並信服其價值
