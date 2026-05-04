# LARM v2.0 模型參數調整指南

> 本文件說明各可調整參數的意義、調整方向，以及彼此之間的計算關聯。
> 所有參數均可在 `/admin/params` 頁面調整，調整結果存於 localStorage 並即時生效。
>
> **v2.0 重點差異**（對照舊 v1.x）：
> - `B_score` 更名為 `G_score`（Ground/Geography score，含 SORA 2.5 ground-consequence + TKE proxy，不再只評建物）
> - WeatherNow 上限 50 → **42**；weights 改為 wind 0.55 + rain 0.35 + instability **0.10**（加總 1.00）
> - G_score 上限 25 → **20**；O_score 上限 15 → **12**；E_score 上限 10 → **8**
> - Buffer ratio 上限 40% → **55%**
> - 新增 EDR 湍流硬停（> 0.8）、W5 颱風趨勢修正、W4 午後時段 ×1.5 乘數
> - Pricing 參數（如 `quote_max_multiplier`）從 `WeatherRegimeParams` 拆出，移至 `PricingParams`
>
> 詳見 `MODEL_CHANGELOG.md` v2.0 entry 與 `spec/LARM-v2.0.md`。

---

## 一、R_score 完整公式鏈

```
R_score = clamp( Base(W) + WeatherNow + G_score + O_score + E_score , 0, 100 )
```

| 組件 | 符號 | 範圍 | 來源 / 可調參數 |
|---|---|---|---|
| 天候基礎分 | Base(W) | 3–22 | `regimes[W].base_score`（+ W5 颱風趨勢修正 `w5_typhoon_trend_bonus`） |
| 即時天候分 | WeatherNow | 0–42 | 風雨規則、各項權重、EDR 湍流調整 |
| 地面/建物評分 | G_score（舊稱 B_score） | 0–20 | 任務表單（樓層/海拔/立面 + SORA 2.5 iGRC + TKE proxy） |
| 作業評分 | O_score | 0–12 | 任務表單（夜間/週末/急件/人流/疲勞） |
| 設備評分 | E_score | 0–8 | 任務表單（設備 Block +3 / Warn +1.5 每件） |
| **合計** | **R_score** | **0–100** | 四捨五入，clamp |

> 相容性：`RiskResult.b_score` 欄位作為 backward-compat alias 仍等於 `g_score`。

**硬停條件**（不論 R_score，直接 NO-GO）：

| 條件 | 對應參數 |
|---|---|
| `wind_now ≥ hard_stop.wind_kmh`（預設 39 km/h） | `thresholds.hard_stop.wind_kmh` |
| `rain_mmph > hard_stop.rain_mmph`（預設 10）**且** `rain_prob > hard_stop.rain_prob_pct`（預設 60%） | `thresholds.hard_stop.rain_mmph` / `.rain_prob_pct` |
| `edr > hard_stop.edr_threshold`（預設 0.8，v2.0 新增） | `thresholds.hard_stop.edr_threshold` |
| `R_score > r4_nogo_threshold`（預設 92，v2.0 新增） | `r4_nogo_threshold` |
| `E_score ≥ 8` | 固定邏輯，不可調 |

---

## 二、WeatherNow 詳細公式

### 公式展開

```
步驟 1：決定有效風速
  effectiveWind = (forecast_confidence < ensemble_low_conf_threshold)
                  ? wind_p90_kmh          ← 集成預報信心不足 → 保守使用 P90
                  : wind_now_kmh          ← 信心充足 → 使用即時風速

步驟 2：查風速評分
  windScore = wind_score_table.lookup(effectiveWind)
  windComp  = min(50, windScore × wind_weight_scale)

步驟 3：計算加權和
  raw = wind        × windComp
      + rain        × getRainScore(rain_prob, rain_mmph)
      + instability × instability_index × instability_scale
      − predictability_discount × predictability_score
      + thunder_add   (若 thunder_risk = 1)

步驟 4：乘上地形係數
  raw = raw × region_weight_table[W][region]   （可選，任務表單有設地形時）

步驟 5：截斷
  WeatherNow = max(0, min(50, raw))
```

### 2-A　風速評分表（`thresholds.wind_score_table`）

每列代表一個風速區間，**區間門檻（min_kmh / max_kmh）和分數（score）均可調整**。

| 列 | min_kmh | max_kmh | score | windComp（×0.8）| WeatherNow 最大貢獻（×wind=0.55）|
|---|---|---|---|---|---|
| 0 | 0（固定）| 可調 | 可調 | 0 | 0 |
| 1 | 可調 | 可調 | 可調 | 8.0 | 4.4 |
| 2 | 可調 | 可調 | 可調 | 16.0 | 8.8 |
| 3 | 可調 | 可調 | 可調 | 28.0 | 15.4 |
| 4 | 可調 | 可調 | 可調 | 44.0 | 24.2 |
| 5 | 可調 | ∞（固定）| 可調 | 50.0（上限）| 27.5 |

**預設值**：`0–10 → 0, 11–18 → 10, 19–25 → 20, 26–32 → 35, 33–38 → 55, 39+ → 80`

**調整原則**：

| 目標 | 做法 |
|---|---|
| 中等風速更早觸發高分 | 降低 L4 的 `min_kmh`（如 33→28） |
| 整體風險評分上移 | 提高各列 `score` 值 |
| 強風容忍度更高 | 提高 L4/L5 的 `min_kmh` 門檻 |
| score 必須嚴格遞增 | 每列 score 需大於前一列，否則低風速反而比高風速得分高 |

> `windComp = min(50, score × 0.8)`，故 score=63 以上對 windComp 無效（上限 50）

### 2-B　降雨評分規則（`thresholds.rain_score_rules`）

四條規則**由上往下，第一個符合者**回傳對應分數。

| 規則 | 邏輯 | 條件 A（機率）| 條件 B（雨量 mm/h）| 分數 | WeatherNow 貢獻（×0.35）|
|---|---|---|---|---|---|
| r0 乾燥 | A **AND** B | 機率 < `rain_prob_lt_pct`（預設 20%）| 雨量 < `rain_mmph_lt`（預設 1）| 0 | 0 |
| r1 小雨 | A **OR** B | `gte`–`lte`%（預設 20–40%）| `gte`–`lte` mm/h（預設 1–3）| 10 | 3.5 |
| r2 中雨 | A **OR** B | `gte`–`lte`%（預設 40–60%）| `gte`–`lte` mm/h（預設 3–10）| 25 | 8.75 |
| r3 大雨 | A **OR** B | 機率 > `rain_prob_gt_pct`（預設 60%）| 雨量 > `or_mmph_gt`（預設 10）| 45 | 15.75 |

> r0 的兩個條件為 AND（都乾燥才算乾燥）；r1–r3 為 OR（任一條件超標即觸發）

**調整建議**：

| 目標 | 做法 |
|---|---|
| 對小機率降雨更保守 | 降低 r0 的 `rain_prob_lt_pct`（20→10%） |
| 中雨分數更高 | 提高 r2 的 `score`（25→35） |
| 大雨門檻更低 | 降低 r3 的 `rain_prob_gt_pct`（60→45%） |

### 2-C　WeatherNow 各項權重（`weather_now_weights`）

| 參數 | 預設值 | 計算式位置 | 升高的效果 | 降低的效果 |
|---|---|---|---|---|
| `wind` | 0.55 | `raw += wind × windComp` | 風速主導 R_score | 風速影響減弱 |
| `rain` | 0.35 | `raw += rain × rainScore` | 降雨主導 R_score | 降雨影響減弱 |
| `instability` | 0.15 | `raw += instability × instability_index × instability_scale` | 不穩定天氣更危險 | 熱對流懲罰減少 |
| `instability_scale` | 15 | 乘以 `instability_index` | 放大不穩定指數 | 收窄不穩定指數影響 |
| `predictability_discount` | 10 | `raw -= discount × predictability_score` | 低可預測性扣分更多 | 可預測性折扣減少 |
| `thunder_add` | 5 | `raw += thunder_add` | 雷日加分更多 | 雷日懲罰減少 |
| `ensemble_low_conf_threshold` | 55 | 決定是否切換至 P90 | 更常使用保守 P90 | 僅極低信心才保守 |

> **三個主權重之和**（wind+rain+instability = 0.55+0.35+0.15 = 1.05）略大於 1.0 是刻意設計，允許三項同時高分時超過單項上限，但最終被 `min(50,…)` 截斷。

---

## 三、W-code 分類

### 3-A　後端分類規則（`classifyWeatherRegime` — 優先序由上往下）

> ⚠️ 以下閾值目前硬編碼在 `risk-engine.ts` 的 `classifyWeatherRegime()` 函式中，**不在 Admin Params UI**。輸入為過去 30 日統計資料（`Weather30dInput`）。

| 優先序 | W-code | 觸發條件 | 代表情境 |
|---|---|---|---|
| 1 | **W5** | `wind_p90_kmh ≥ 39` **或** `gust_p90_kmh ≥ 50` | 颱風外圍 / 強風 |
| 2 | **W3** | `rain_days_30 ≥ 15` **且** `heavy_rain_days_30 ≥ 3` | 梅雨滯留 |
| 3 | **W4** | `instability_index ≥ 0.70` **且** `heavy_rain_days_30 ≥ 2` | 午後熱對流 |
| 4 | **W1** | `wind_p90_kmh ≥ 33` **且** `predictability_score ≥ 0.60` | 東北季風 |
| 5 | **W2** | `8 ≤ rain_days_30 ≤ 14` **且** `predictability_score < 0.55` | 鋒面過境 |
| 6 | **W0** | 以上均不符合 | 穩定高壓晴朗 |

**分類信心度**（confidence）— 當多個規則同時觸發時下降：

| 觸發規則數 | confidence |
|---|---|
| 1 | 1.00 |
| 2 | 0.78 |
| 3 | 0.62 |
| 4+ | 0.50 |

> confidence 直接影響 Buffer Ratio：信心越低，緩衝越大（見第六節）

### 3-B　W-code 基礎分（`regimes[W].base_score`）

**位置**：Admin Params → 天候分類 Tab → 天候基礎分

| W-code | 天候類型 | 預設 `base_score` | 合理調整範圍 | 調整說明 |
|---|---|---|---|---|
| W0 | 穩定高壓晴朗 | 3 | 1–8 | 台灣夏季 W0 實際仍有午後熱可升高 |
| W1 | 東北季風 | 10 | 6–15 | 迎風面城市（基隆、宜蘭）可調高 |
| W2 | 鋒面掃過 | 12 | 8–18 | 春雨季可調高 |
| W3 | 梅雨滯留 | 18 | 14–25 | 6月下旬梅雨峰期可調高 |
| W4 | 午後熱對流 | 16 | 12–22 | 內陸山區可調高 |
| W5 | 颱風外圍環流 | 22 | 18–30 | 颱風季（7–9月）可考慮調高 |

> `Base(W)` 是固定底分，與 WeatherNow 相加後才進行 R-level 判定。若 W5 base=22、WeatherNow=28，則即使 B/O/E 都很低（合計=5），R_score 已達 55（R2）。

### 3-C　UI 即時天候推斷閾值（`ui_infer_thresholds`）

**位置**：Admin Params → 天候分類 Tab → UI 天候推斷閾值

> 僅用於 **Climate 頁面**和**任務嚮導 Step 5** 的即時天候標籤顯示。
> **不影響**後端 `risk-engine.ts` 的 `classifyWeatherRegime()` 計算。

| 參數 | 預設值 | 推斷邏輯 |
|---|---|---|
| `W5_wind_now_kmh` | 28 | `wind_now ≥ 28 AND gust_p90 ≥ W5_gust_p90_kmh` → W5 |
| `W5_gust_p90_kmh` | 39 | 同上 |
| `W4_rain_prob_pct` | 40 | `thunder_risk=1 AND rain_prob ≥ 40%` → W4 |
| `W3_rain_days` | 15 | `rain_days_30 ≥ 15 AND rain_prob ≥ W3_rain_prob_pct` → W3 |
| `W3_rain_prob_pct` | 60 | 同上 |
| `W2_rain_days` | 10 | `rain_days_30 ≥ 10 AND rain_prob ≥ W2_rain_prob_pct` → W2 |
| `W2_rain_prob_pct` | 40 | 同上 |
| `W1_wind_now_kmh` | 20 | `wind_now ≥ 20 AND wind_p90 ≥ W1_wind_p90_kmh` → W1 |
| `W1_wind_p90_kmh` | 28 | 同上 |

---

## 四、R_score → R-level 對應（`thresholds.mapping_r_level`）

**位置**：Admin Params → 緩衝係數 Tab → R 等級分數對應

| R-level | 預設分數範圍 | 預設決策 | 說明 |
|---|---|---|---|
| R0 | 0–20 | GO | 無風險，正常排程 |
| R1 | 21–40 | GO + 監控 | 輕微，即時監控 |
| R2 | 41–65 | CONDITIONAL-A | 中度，視條件執行 |
| R3 | 66–85 | CONDITIONAL-B | 重度，需主管審核 |
| R4 | 86–100 | NO-GO | 禁止飛行 |

**調整邊界的效果**：

| 調整 | 效果 |
|---|---|
| R2 min 從 41 → 35 | 35–40 分的任務從 R1(GO) 升至 R2(COND)，管控更嚴 |
| R3 min 從 66 → 70 | 66–69 分的任務從 R3(COND-B) 降至 R2(COND-A)，放寬主管審核門檻 |
| R4 min 從 86 → 80 | 80–85 分的任務從 R3 升至 R4(NO-GO) |

---

## 五、WR 決策矩陣（`wr_matrix`）

**位置**：Admin Params → WR 矩陣 Tab（點擊格子循環切換）

`getWRDecision(W, R)` 查詢矩陣，輸出最終 **go / cond / nogo**。

| | R0 | R1 | R2 | R3 | R4 |
|---|---|---|---|---|---|
| **W0** | go | go | cond | nogo | nogo |
| **W1** | nogo | go | cond | cond | nogo |
| **W2** | nogo | cond | cond | cond | nogo |
| **W3** | nogo | nogo | cond | cond | nogo |
| **W4** | nogo | cond | cond | cond | nogo |
| **W5** | nogo | nogo | cond | cond | nogo |

> **注意**：WR 矩陣是在 R_score → R-level 對應**之後**再查詢，因此 R_score 邊界的調整（第四節）會間接影響最終 go/cond/nogo 結果。

**常見調整場景**：

| 場景 | 建議修改 |
|---|---|
| 季風期 W1 的 R1 場景比目前更保守 | 將 W1×R1 從 `go` 改為 `cond` |
| W3 梅雨期允許低風險任務 | 將 W3×R1 從 `nogo` 改為 `cond` |
| 颱風外圍一律禁止 | 將 W5×R2 和 W5×R3 從 `cond` 改為 `nogo` |

---

## 六、Buffer Ratio 公式（`buffer_coefficients` + `volatility_buffer_add`）

**位置**：Admin Params → 緩衝係數 Tab

```
buffer = base
       + risk_score / score_divisor
       + volatility_buffer_add[W]
       + (1 − regime_confidence) × regime_conf_penalty
       + (1 − forecast_confidence / 100) × ensemble_penalty

buffer = clamp(buffer, min, max)
```

### Buffer Coefficients 表

| 參數 | 預設值 | 升高效果 | 降低效果 |
|---|---|---|---|
| `base` | 0.05 | 所有任務底層緩衝增加 | 緩衝起始值更緊 |
| `score_divisor` | 250 | 分數對緩衝影響更小（需更高分才增加緩衝）| 高分日緩衝膨脹更快 |
| `regime_conf_penalty` | 0.04 | 天候分類不確定時更保守 | 減少模糊天候的懲罰 |
| `ensemble_penalty` | 0.08 | 集成預報低信心時更保守 | 減少預報不確定的懲罰 |
| `min` | 0.05 | — | 不建議低於 0.05 |
| `max` | 0.40 | — | 不建議高於 0.40 |

### 各天候型態波動緩衝（`volatility_buffer_add[W]`）

| W-code | 預設值 | 說明 |
|---|---|---|
| W0 | 0.00 | 穩定天氣，無額外緩衝 |
| W1 | 0.02 | 季風略有變動性 |
| W2 | 0.03 | 鋒面系統，時間點不確定 |
| W3 | 0.04 | 梅雨不確定性偏高 |
| W4 | 0.05 | 熱對流突發性強 |
| W5 | 0.06 | 颱風環境最大緩衝 |

**Buffer Ratio 計算範例（W2、R_score=41、confidence=0.78、forecast_confidence=70%）**：

```
base           = 0.05 + 41/250            = 0.214
volatility     = 0.03（W2）
regime_penalty = (1 − 0.78) × 0.04       = 0.0088
ensemble_pen   = (1 − 70/100) × 0.08     = 0.024
─────────────────────────────────────────────────
buffer         = 0.214 + 0.03 + 0.009 + 0.024 = 0.277（27.7%）
```

---

## 七、地形曝露係數（`region_weight_table`）

WeatherNow 計算最後乘上此係數（地形 × 天候型態交互）。

| W-code | windward 迎風 | leeward 背風 | coastal 沿海 | rooftop_open 屋頂 |
|---|---|---|---|---|
| W0 | 1.00 | 0.98 | 1.00 | 1.02 |
| W1 | **1.10** | 0.98 | **1.12** | 1.08 |
| W2 | 1.05 | 1.00 | 1.06 | 1.05 |
| W3 | 1.03 | 1.00 | 1.02 | 1.03 |
| W4 | 1.04 | 1.00 | 1.03 | 1.05 |
| W5 | **1.15** | 1.05 | **1.18** | **1.12** |

> W5 × coastal = 1.18：颱風外圍沿海地區的 WeatherNow 會再乘 1.18，使同樣的風雨條件在沿海得到更高分。

---

## 八、參數相互影響速查

| 調整目標 | 應修改的參數 | 方向 |
|---|---|---|
| 對風速整體更保守 | `weather_now_weights.wind` | ↑ |
| 提前觸發高風速分數 | `wind_score_table` L3/L4 的 `min_kmh` | ↓ |
| 更常使用保守 P90 風速 | `weather_now_weights.ensemble_low_conf_threshold` | ↑（如 55→70%） |
| 對小機率降雨更保守 | `rain_score_rules.r0.rain_prob_lt_pct` | ↓（如 20→10%） |
| 中雨懲罰更重 | `rain_score_rules.r2.score` | ↑（如 25→35） |
| 增加雷陣雨懲罰 | `weather_now_weights.thunder_add` | ↑（如 5→10） |
| 颱風季整體更嚴 | `regimes.W5.base_score` + `volatility_buffer_add.W5` | ↑ |
| 梅雨季整體更嚴 | `regimes.W3.base_score` | ↑（如 18→22） |
| 全面收緊決策門檻 | `thresholds.mapping_r_level` R2 的 `min` | ↓（如 41→35） |
| 增加預報不確定懲罰 | `buffer_coefficients.ensemble_penalty` | ↑（如 0.08→0.12） |
| 增加天候分類不確定懲罰 | `buffer_coefficients.regime_conf_penalty` | ↑（如 0.04→0.06） |
| 減少高分任務緩衝成長速度 | `buffer_coefficients.score_divisor` | ↑（如 250→400） |
| 放寬颱風外圍可執行性 | `wr_matrix.W5.R2` | `cond` → 保持，或調整 R3 邊界 |

---

## 九、完整計算範例

**案例設定**：W2 天候，台北沿海，風 22 km/h，雨機率 45%，雨量 4 mm/h，無雷，集成預報信心 70%

```
輸入資料
  W-code            = W2（鋒面掃過，由 classifyWeatherRegime 判定）
  base_score[W2]    = 12
  wind_now_kmh      = 22
  rain_prob_today   = 45%
  rain_mmph         = 4
  thunder_risk      = 0
  forecast_confidence = 70%
  instability_index = 0.40
  predictability    = 0.65
  region            = coastal
─────────────────────────────────────────────────
步驟 1：Base(W)
  Base = 12

步驟 2：WeatherNow
  forecast_confidence(70%) ≥ ensemble_low_conf_threshold(55%)
  → effectiveWind = wind_now = 22 km/h

  22 km/h 落在 19–25 → windScore = 20
  windComp = min(50, 20 × 0.8) = 16

  45% / 4mm → r2（40–60% OR 3–10mm）→ rainScore = 25

  raw = 0.55 × 16           = 8.80
      + 0.35 × 25           = 8.75
      + 0.15 × 0.40 × 15   = 0.90
      − 0.65 × 10           = −6.50
      + 0（無雷）           = 0

  raw = 11.95
  region_weight[W2][coastal] = 1.06
  WeatherNow = min(50, 11.95 × 1.06) = 12.67 ≈ 13

步驟 3：B + O + E（假設）
  B = 10（5樓屋頂 + 輕度立面）
  O = 4（週末）
  E = 2（1 個 Warn 設備）

步驟 4：R_score
  R_score = 12 + 13 + 10 + 4 + 2 = 41 → R2（COND-A）

步驟 5：WR 矩陣
  wr_matrix[W2][R2] = cond → CONDITIONAL

步驟 6：Buffer Ratio
  base           = 0.05 + 41/250  = 0.214
  volatility     = 0.03（W2）
  regime_penalty = (1 − 0.78) × 0.04 = 0.009
  ensemble_pen   = (1 − 0.70) × 0.08 = 0.024
  buffer         = 0.277 → 27.7%
─────────────────────────────────────────────────
最終輸出：CONDITIONAL，緩衝 27.7%
```

---

## 十、Admin Params UI 各 Tab 對應參數速查

| Tab | 可調整的參數 |
|---|---|
| **WR 矩陣** | `wr_matrix[W][R]` — 6 × 5 格子，點擊循環切換 go / cond / nogo |
| **風雨評分** | `wind_score_table`（區間 min/max + score）<br>`weather_now_weights`（wind / rain / instability / instability_scale / predictability_discount / thunder_add / ensemble_low_conf_threshold）<br>`thresholds.rain_score_rules`（4 條規則各閾值與分數）<br>`thresholds.hard_stop`（風速 / 雨量 / 機率三個硬停門檻）|
| **天候分類** | `regimes[W].base_score`（W0–W5 各 base score）<br>`ui_infer_thresholds`（9 個即時顯示閾值）|
| **緩衝係數** | `buffer_coefficients`（base / score_divisor / regime_conf_penalty / ensemble_penalty / min / max）<br>`volatility_buffer_add`（W0–W5 各波動緩衝值）<br>`thresholds.mapping_r_level`（R0–R4 各等級的 min / max 邊界）|
| **R指標** | B_score 各分項對照表（唯讀參考）、O_score 各分項對照表（唯讀）、E_score + Tier 觸發閾值（唯讀）、completionForRL 完成率估計表（唯讀）|
| **報價** | 基本單價、立面/污染/清潔劑附加費、各類乘數一覽（唯讀參考）|

---

## 十一、R指標分項（B/O/E Score）

> 以下參數目前硬編碼於 `risk-engine.ts`，可在 Admin Params → **R指標 Tab** 查閱。

### 11-A　B_score 建築評分（上限 25）

**建物樓層**：

| 條件 | 分數 |
|---|---|
| ≤ 10 層 | +0 |
| 11–20 層 | +4 |
| 21–30 層 | +7 |
| > 30 層 | +10 |

**場址海拔**：

| 條件 | 分數 |
|---|---|
| ≤ 100 m | +0 |
| 101–300 m | +2 |
| 301–800 m | +4 |
| > 800 m | +6 |

**立面複雜度**：

| 等級 | 分數 |
|---|---|
| none | +0 |
| light | +2 |
| medium | +5 |
| heavy | +8 |

**環境危害（上限 8）**：

| 因素 | 分數 |
|---|---|
| 鄰近高壓電 | +4 |
| 鄰近基地台 | +2 |
| 風道效應 | +2 |
| 淨空 < 5 m | +2 |

**交互加成（上限 6）**：

| 組合條件 | 分數 |
|---|---|
| 高樓（>20F）× 風道效應 | +3 |
| 高壓電 × 無屋頂緊急降落 | +2 |
| 山區（>300m）× 淨空 < 5m | +3 |

> **B_score 計算式**：`min(25, altScore + heightScore + complexityScore + min(8, envRaw) + min(6, interaction))`

### 11-B　O_score 作業評分（上限 15）

| 因素 | 分數 |
|---|---|
| 夜間作業 | +6 |
| 週末 | +2 |
| 封路需求 | +4 |
| 急件 ≤ 3 天 | +6 |
| 急件 4–7 天 | +4 |
| 高人流密度 | +4 |
| 中人流密度 | +2 |
| 初級操作員 | +2 |
| 長工期疲勞 ≥ 7 天 | +4 |
| 長工期疲勞 4–6 天 | +2 |

> **O_score 上限**：`min(15, 各項加總)`

### 11-C　E_score 設備評分（上限 10）

| 設備狀態 | 分數（每件） |
|---|---|
| Block | +4 |
| Warn | +2 |
| OK | 0 |

> **E_score 上限**：`min(10, 加總)`

**Tier 觸發閾值**（CONDITIONAL 審批等級）：

| 條件 | 結果 |
|---|---|
| R2 + (夜間 OR 高壓電 OR 風道) + E ≥ 6 | 升至 CONDITIONAL **Tier B**（主管事前審批）|
| E ≥ 8（任何情況）| 強制 CONDITIONAL **Tier C**（主管 + 客戶雙方書面確認）|
| R3（任何情況）| CONDITIONAL **Tier B** |

### 11-D　完成率估計（completionForRL）

**公式**：`max(5, min(99, base[R] − wIdx × 3))`（wIdx = W等級數字，0–5）

| R-level | 基礎完成率 | W0 | W1 | W2 | W3 | W4 | W5 |
|---|---|---|---|---|---|---|---|
| R0 | 97% | 97 | 94 | 91 | 88 | 85 | 82 |
| R1 | 82% | 82 | 79 | 76 | 73 | 70 | 67 |
| R2 | 60% | 60 | 57 | 54 | 51 | 48 | 45 |
| R3 | 35% | 35 | 32 | 29 | 26 | 23 | 20 |
| R4 | 10% | 10 | 7 | 5 | 5 | 5 | 5 |

> 最低值 5%（min clamp），最高值 99%（max clamp）。

---

## 十二、報價引擎參數（pricing-engine.ts）

> 可在 Admin Params → **報價 Tab** 查閱。
>
> **報價總額公式**：
> ```
> total = round( subtotal × floor_mult × time_mult × risk_mult × urgent_mult )
> subtotal = Σ [ 有效面積 × (base_price + 各類附加費) ]（小計不足 min_order 時補差）
> ```

### 12-A　基本單價（BASE_PRICE，NTD / ㎡）

| 建築類型 | 單價 |
|---|---|
| 商辦 commercial | 30 |
| 豪宅 luxury | 33 |
| 透天/獨棟 house | 200 |
| 廠房 factory | 28 |
| 太陽能板 solar | 8 |

### 12-B　立面附加費（Section B，每立面各自計算）

**立面複雜度加價（NTD / ㎡）**：

| 等級 | 加價 |
|---|---|
| none | 0 |
| light | +4 |
| medium | +6 |
| heavy | +8 |

**立面條件加價（NTD / ㎡）**：

| 條件 | 加價 |
|---|---|
| 封路 road_closure | +4 |
| 空間受限 tight_perimeter | +6 |
| 高風險環境 high_risk_env | +7 |
| 鄰樹（全面通道障礙） adjacent_trees | +5 |
| 鄰樹影區（納入清洗範圍） clean_tree_floors | 額外 +10/㎡ |

**建物條件加價（NTD / ㎡，所有立面共用）**：

| 條件 | 加價 |
|---|---|
| 自備用水（SelfSupply） | +7 |
| 自備電力（SelfSupply） | +7 |
| 屋頂條件不佳 | +12 |

### 12-C　專案附加費（Section C，全案共用）

**污染類型（可疊加，上限 15 / ㎡）**：

| 類型 | 加價 |
|---|---|
| dust 粉塵 | 0 |
| scale 水垢 | +7 |
| bird 鳥糞 | +4 |
| mold 黴菌 | +5 |
| exhaust 廢氣排放 | +6 |
| grease 油污 | +12 |

**清潔劑（NTD / ㎡）**：

| 類型 | 加價 |
|---|---|
| water 清水 | 0 |
| neutral 中性劑 | +3 |
| acid 酸性劑 | +10 |
| alkali 鹼性劑 | +10 |

### 12-D　乘數（Section D Multipliers）

**樓層乘數（FLOOR_MULTIPLIER）**：

| 樓層 | 乘數 |
|---|---|
| ≤ 10 層 | ×1.0 |
| 11–20 層 | ×1.3 |
| 21–30 層 | ×2.0 |
| > 30 層 | ×3.0 |

**時間窗口乘數（TIME_WINDOW_MULTIPLIER）**：

| 時段 | 乘數 |
|---|---|
| 日間 day | ×1.0 |
| 週末 weekend | ×1.2 |
| 夜間 night | ×1.5 |

**風險等級乘數（RISK_MULTIPLIER）**：

| R-level | 乘數 | 說明 |
|---|---|---|
| R0 | ×1.00 | 無附加費 |
| R1 | ×1.05 | 輕微風險加成 |
| R2 | ×1.15 | 中度風險加成 |
| R3 | ×1.40 | 重度風險加成 |
| R4 | — 拒承 | 禁止排程，不生成報價 |

**急件乘數**：×1.33（`urgent = true` 時）

**最低訂單金額**：NT$ 15,000（小計不足時補差至 MIN_ORDER）

### 12-E　報價參數調整建議

| 調整目標 | 做法 |
|---|---|
| 颱風季/高風險任務報價更高 | 提高 RISK_MULTIPLIER R3（如 1.40 → 1.60）|
| 夜間作業加成更高 | 提高 TIME_WINDOW_MULTIPLIER.night（如 1.5 → 1.8）|
| 高樓作業加乘更陡 | 調整 FLOOR_MULTIPLIER 各層閾值 |
| 油污清洗報價更高 | 提高 grease 污染加價（如 12 → 15）|
| 酸鹼劑報價更高 | 提高 acid/alkali 清潔劑加價（如 10 → 15）|
| 最低訂單門檻提高 | 調整 MIN_ORDER（如 15000 → 20000）|

> ⚠️ 目前報價參數定義於原始碼，若需調整請修改 `pricing-engine.ts` 後重啟服務。

---

## 附錄：關鍵函式與檔案對照

| 公式/邏輯 | 實作位置 |
|---|---|
| `classifyWeatherRegimeWithParams()` | `packages/core/src/engines/risk-engine.ts` |
| `evaluateRisk()` — 完整 R_score 計算 | `packages/core/src/engines/risk-engine.ts` |
| `computeGScore()` — G_score（舊稱 B_score） | `packages/core/src/engines/risk-engine.ts` |
| `computeOperationalScore()` — O_score | `packages/core/src/engines/risk-engine.ts` |
| `computeEquipmentScore()` — E_score | `packages/core/src/engines/risk-engine.ts` |
| `computeGating()` — CONDITIONAL Tier 判斷 | `packages/core/src/engines/risk-engine.ts` |
| `inferWCode()` — UI 即時推斷 | `packages/core/src/engines/model-helpers.ts` |
| `completionForRL()` — 完成率估計 | `packages/core/src/engines/model-helpers.ts` |
| `getWRDecision()` | `packages/core/src/engines/model-helpers.ts` |
| 參數 schema（型別） | `packages/core/src/params/schema.ts` |
| Taiwan 校準數值（V1/V2） | `packages/regions-taiwan/src/v1.ts` / `v2.ts` |
| 客戶端 localStorage 覆寫層 | `low-altitude-ops-platform/frontend/src/lib/params-store.ts` |
| Pricing 參數（`PricingParams`，含 `quote_max_multiplier`） | `low-altitude-ops-platform/frontend/src/lib/engines/pricing-params.ts` |
| `generateQuote()` — 報價引擎（已從 core 解耦） | `low-altitude-ops-platform/frontend/src/lib/engines/pricing-engine.ts` |
| frontend re-export bridge（24+ in-app importers 相容用） | `low-altitude-ops-platform/frontend/src/lib/engines/*.ts` |
| Admin Params UI | `src/app/(main)/admin/params/page.tsx` |
| Climate 氣候日曆 | `src/app/(main)/climate/page.tsx` |
