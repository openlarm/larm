# Task 2 規劃：LARM Spec 文件骨架（`spec/LARM-v1.1.md`）

> **目的**：把模型從「TypeScript 程式碼」提升為「**規格文件**」—讓任何語言、任何團隊都能照著實作，且結果可逐位元驗證。
>
> **定位**：這份文件是 source of truth，程式碼只是其中一個 reference implementation。

---

## 1. 為什麼需要 spec 文件？

| 沒有 spec | 有 spec |
|---|---|
| 程式碼即規格，版本一多就漂移 | 多個實作可對齊（TS / Python / Rust port） |
| 使用者要讀 TS code 才知道公式 | 非工程師也能審閱（監管、客戶、學術） |
| 改模型 = 改 code，無討論紀錄 | RFC 流程，改動可被 review |
| 無法證明「這家 fork 版還是 LARM」 | 有「compliance test vector」可驗證 |

---

## 2. 文件骨架（建議章節）

```markdown
# LARM v1.1 Specification
# Low Altitude Risk Model — Formal Specification

**Status**: Stable
**Version**: 1.1.0
**License**: CC-BY 4.0 (spec) / Apache 2.0 (reference implementation)
**Last Updated**: 2026-04-16

---

## 0. Abstract
2–3 段，說明 LARM 是什麼、解決什麼問題、適用/不適用場景。
特別強調：這是「無人機作業」風險模型，不是「飛行安全認證」。

## 1. Conformance
### 1.1 Implementation Levels
- Level 1 (Core): 必須實作 Section 3–7 的所有計算
- Level 2 (Full): 含 Section 8 的 adapter 規範
- Level 3 (Certified): 通過 Section 12 的 test vectors

### 1.2 Interoperability Requirement
符合 spec 的實作，對同一組輸入必須產出同一組輸出（允許浮點誤差 < 0.01）。

## 2. Terminology
一頁 glossary：
- W-code / W0–W5
- R-level / R0–R4
- Base(W) / WeatherNow / G_score / O_score / E_score
- Buffer Ratio / Completion Probability
- Hard Stop / WR Matrix / Internal Grade
- Regime Confidence
- EDR (Eddy Dissipation Rate)
- SORA 2.5 GRC / M1A/M1B/M1C Mitigations

## 3. Input Schema
### 3.1 Weather30dInput（30 日氣候背景）
JSON Schema + 每個欄位語意、單位、範圍、允許 null 的條件

### 3.2 WeatherTodayInput（當日/預報）
含 `wind_now_kmh`, `rain_prob_today_pct`, `rain_mmph_forecast`,
`thunder_risk`, `forecast_confidence`, `edr`, `local_hour` 等

### 3.3 BuildingSiteInput（地面/建物）
含 `site_altitude_m`, `building_floors`, `facade_complexity`,
`population_density_class`, `sora_mitigations`, `wind_channel_effect` 等

### 3.4 OperationalContextInput（作業情境）
### 3.5 Equipment（設備清單）
### 3.6 完整 LARMInput 組合

## 4. Algorithm: Weather Regime Classification
### 4.1 Step A — W-code determination
包含偽代碼 + 判斷優先順序
```pseudo
if wind_p90_kmh >= 39 or gust_p90_kmh >= 50:
    matches.push("W5")
if rain_days_30 >= 15 and heavy_rain_days_30 >= 3:
    matches.push("W3")
...
```
### 4.2 Confidence scoring
matches 數量 → 信心值 {1, 0.78, 0.62, 0.50}
### 4.3 W5 氣候趨勢修正
`recent_typhoon_count > 3.6 → base += 2`

## 5. Algorithm: Component Scores
### 5.1 Base(W) — 3 到 22
5.1.1 每個 W-code 的 base_score（表格）
5.1.2 W5 trend bonus

### 5.2 WeatherNow — 0 到 42
5.2.1 Wind sub-score（分段表 + 低信心 P90 保守值規則）
5.2.2 Rain sub-score（4 條規則）
5.2.3 Instability sub-score（W4 特例 scale=28）
5.2.4 Predictability discount
5.2.5 Thunder add
5.2.6 EDR adjustment（4 段閾值）
5.2.7 Region exposure weight（w_code × exposure 矩陣）
5.2.8 W4 午後時段乘數（14:00–18:00）
5.2.9 合成公式與 cap

### 5.3 G_score — 0 到 20（SORA 2.5 整合）
5.3.1 Structural sub-dim（樓層 + 海拔 + 立面，cap 10）
5.3.2 Ground Consequence — SORA iGRC（人口密度 + M1 mitigations，cap 6）
5.3.3 TKE Proxy（風道/樓層代理因子，cap 3）
5.3.4 Environment + Interaction（cap 4）
5.3.5 合成 + total cap 20

### 5.4 O_score — 0 到 12
夜間 / 週末 / 封路 / 急件 / 人流 / 新手操作員 / 疲勞
每項的分值（表格）、cap 規則

### 5.5 E_score — 0 到 8
Block (+3) / Warn (+1.5)，cap 8

## 6. Algorithm: Risk Score Aggregation
```pseudo
R_score = min(100, max(0, round(
  base_w + weather_now + g_score + o_score + e_score
)))
```
### 6.1 R-level mapping
R0: [0,20] / R1: [21,40] / R2: [41,65] / R3: [66,85] / R4: [86,100]

### 6.2 Internal Grade
A / B / C / D1 / D2 對應

## 7. Algorithm: Decision Gating
### 7.1 Hard Stops（最高優先）
- wind_now_kmh ≥ 39 → NO-GO
- rain_mmph > 10 AND rain_prob_pct > 60 → NO-GO
- edr > 0.8 → NO-GO
- R4 且 risk_score > 92 → NO-GO

### 7.2 CONDITIONAL Tiers
- Tier A: 可執行 + 即時監控（R2 輕度條件）
- Tier C: 需主管審批（R2 嚴重 / E≥6）
- Tier D1: R3 重度
- Tier D2: R4 極高（86–92 分）

### 7.3 WR Matrix lookup
6×5 矩陣的完整表格

### 7.4 完整 Gating 流程圖（Mermaid）

## 8. Buffer Ratio
```pseudo
buffer = base + risk_score / score_divisor
       + volatility_buffer_add[w_code]
       + (1 - confidence) × regime_conf_penalty
       + (1 - forecast_confidence/100) × ensemble_penalty
buffer = clamp(buffer, 0.05, 0.55)
```

## 9. Completion Probability
`[97, 82, 60, 35, 10]` by R-level，−3% per W-level index，
clamp [5%, 99%]，regional `localAdjustment` multiplier.

## 10. Parameter Registry
### 10.1 v1.0 vs v2.0 對照表
Breaking changes 列表、升級注意事項
### 10.2 可調 vs 不可調參數界線
### 10.3 Parameter override 機制（推薦：顯式傳入）

## 11. Determinism & Reproducibility
- 不使用 Math.random（除 quote_code 等非核心欄位）
- 時間注入（clock injection）
- 浮點精度約定（Math.round × 10 / 10 為標準）

## 12. Conformance Test Vectors
### 12.1 Basic suite（10 個輸入 → 預期輸出）
### 12.2 Edge cases（hard stops, W5, EDR, SORA mitigations）
### 12.3 JSON 格式的機器可讀 fixtures

## 13. Non-Goals / Out of Scope
明確列出 LARM **不做**什麼：
- 不做空域避讓（交給 `@larm/airspace`）
- 不做航路規劃
- 不做天氣預報（只消費預報資料）
- 不做 U-space/UTM 整合

## 14. Known Limitations
- 目前僅以台灣氣候驗證
- 山區 > 1500m 海拔未充分驗證
- 夜間作業資料點不足

## 15. Changelog
v1.0 → v1.1 的所有變動

## 16. References
- SORA 2.5 (JARUS)
- ICAO Doc 10082 (EDR)
- 相關論文/標準

## Appendix A: Full Parameter Values (v1.1)
完整 JSON，可機器讀取

## Appendix B: Reference Implementation
連結到 `@larm/core` 的對應 commit hash
```

---

## 3. 撰寫原則

1. **每個公式都有 3 種形式**：
   - 白話描述（1 句）
   - 偽代碼（算法步驟）
   - 實際常數表（可 copy 貼到其他語言）

2. **每個常數都要有「為什麼是這個值」的註解**
   - 例：`w4_time_multiplier = 1.5` → "基於 2024 年 Q2–Q3 台灣午後熱對流 187 筆事件的實證校準"
   - 找不到實證來源的，標註 `[heuristic]`，讓未來有資料時可以改

3. **區分「規範性 (normative)」與「資訊性 (informative)」段落**
   - 規範性：必須遵守（用 RFC 2119 MUST/SHOULD/MAY 詞彙）
   - 資訊性：解釋、背景、範例

4. **所有表格用 Markdown**，不用 HTML（方便 GitHub render + 機器解析）

5. **保留 v1.0 → v1.1 的 diff section**，讓下游知道什麼變了、怎麼遷移

---

## 4. 產出交付物

1. `spec/LARM-v1.1.md` — 本文件，預估 ~3,500 行（不含 test vectors）
2. `spec/test-vectors/v1.1/*.json` — 機器可讀的合規測試向量
3. `spec/rfcs/0000-template.md` — RFC 模板
4. `spec/MODEL_CHANGELOG.md` — 獨立的模型版本變更記錄

---

## 5. 工序建議

| 階段 | 動作 | 產出 |
|---|---|---|
| 1 | 從現有 CLAUDE.md + 程式碼抽骨架 | 章節大綱 + 半成品 |
| 2 | 逐章節填內容（Sections 3–9 最核心） | 公式完整版 |
| 3 | 從 `src/app/admin/params/page.tsx` 產生 Appendix A 參數表 | 完整常數表 |
| 4 | 寫 10 個 test vectors（手算或從現有單元測試抽） | JSON fixtures |
| 5 | 交叉校驗：用 spec 人工算一次 vs 程式跑一次 | 差異清單 |
| 6 | 找 1 位非原作者 review | 修正 + 定稿 |

**預估工作量**：不給時間估計。但可切成「每天 2 章節」的 PR 批次。

---

## 6. 風險

- **風險 1**：寫 spec 的過程會**發現模型內部矛盾**（尤其是 pricing_engine 和 risk_engine 的 `quote_max_multiplier` 跨耦合）。這反而是好事，但要記錄為 Known Issues。
- **風險 2**：`simpleRiskFromW()` 和 `completionForRL()` 屬於 UI 輔助，**不是**正式 LARM 輸出。spec 要明確聲明它們是 informative 而非 normative。
- **風險 3**：v2.0 的幾個 `[Bug N]` 註記（見 `weather-regime-params.ts`）表示最近還在修正中。spec 應等 v2.0 穩定後再凍結，或明確標註 v1.1 vs v2.0 狀態。

---

## 7. 與 Task 1 / Task 3 的關係

- Task 1（解耦盤點）→ 告訴我「哪些 code 是 core」
- **Task 2（spec）→ 凍結 core 的行為定義**
- Task 3（API 設計）→ 實作 core 時對應 spec 的介面

建議執行順序：**Task 1 → Task 3 → Task 2 的骨架 → 實作 v0.1 → Task 2 補完 → 凍結 v1.1**

（Task 2 完整撰寫不一定要在 v0.1 發佈前做完，但骨架和 Section 3–7 需要先有，才能讓第一個 external contributor 看得懂。）
