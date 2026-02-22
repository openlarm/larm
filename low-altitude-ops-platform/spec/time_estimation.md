# Time Estimation Engine

## 作業時間預測模型規格 v1.0 (Mock / MVP)

---

## 1. Purpose

Time Estimation Engine 的目的是：

- 將低空作業所需時間量化
- 讓報價與風險模型連動
- 控制作業成本與毛利
- 作為排程與空域申請依據

本模型為**規則型模型（Rule-based）**，未使用機器學習。

---

## 2. Design Principles

1. 作業時間 ≠ 面積 ÷ 速度
2. 所有係數可版本化
3. 每次估算需保存快照（不可回溯修改）
4. 模型可逐步演進（v2 可加入回饋機制）

---

## 3. 核心計算結構

### 3.1 基本公式

```
實際效率 (Adjusted Productivity) =
    Baseline Productivity
    × Height Coefficient
    × Wind Coefficient
    × Complexity Coefficient
    × Contamination Coefficient
    × Time Window Coefficient

總作業時間 =
    (有效面積 ÷ 實際效率)
    + Setup Time
    + Teardown Time
    + Legal Rest Time
    + Interruption Buffer
```

---

## 4. Baseline Productivity

Baseline Productivity 依任務類型與建物類型設定。

| 任務類型 | 建物類型 | Baseline Productivity (㎡/hr) |
|---|---|---|
| Cleaning | Commercial | 250 |
| Cleaning | Luxury | 200 |
| Cleaning | Factory | 280 |
| Cleaning | Solar | 500 |
| Inspection | Any | 600 |
| Coating | Any | 150 |

> 此表為 `time_model_version` 的參數之一，詳見 `productivity_baseline_v1.csv`。

---

## 5. Coefficient Definitions

### 5.1 Height Coefficient

| 條件 | 係數 |
|---|---|
| ≤ 10F | 1.00 |
| 11–20F | 0.90 |
| 21–30F | 0.85 |
| > 30F | 0.75 |

原因：水壓衰減、風影響加劇、管線長度增加。

---

### 5.2 Wind Coefficient

依即時或預測風速判斷。

| 風速 (m/s) | 係數 |
|---|---|
| 0–3 | 1.00 |
| 4–5 | 0.90 |
| 6–7 | 0.80 |
| 8–9 | 0.65 |
| ≥ 10 | 作業中止 |

---

### 5.3 Structural Complexity Coefficient

| 複雜度 | 係數 |
|---|---|
| None | 1.00 |
| Light | 0.95 |
| Medium | 0.85 |
| Heavy | 0.70 |

---

### 5.4 Contamination Coefficient

| 污染類型 | 係數 |
|---|---|
| 灰塵 | 1.00 |
| 水垢 | 0.85 |
| 黑黴 | 0.80 |
| 油污 | 0.70 |
| 多重污染 | 0.65 |

---

### 5.5 Time Window Coefficient

| 作業時段 | 係數 |
|---|---|
| 白天 | 1.00 |
| 週末 | 0.95 |
| 夜間 | 0.75 |

---

## 6. Setup & Teardown Model

### 基本值

| 項目 | 時間 |
|---|---|
| Setup | 90 分鐘 |
| Teardown | 60 分鐘 |

### 條件加成

| 條件 | 增加時間 |
|---|---|
| 自備水源 | +30 min |
| 自備電源 | +20 min |
| 封路申請 | +45 min |
| 屋頂條件不佳 | +30 min |

---

## 7. Legal Rest Time

依職安規範：每 2 小時作業需休息 30 分鐘。

```
Legal Rest Time =
    floor(純作業時間 / 2hr) × 30min
```

---

## 8. Interruption Buffer

為降低天候中斷風險，需預留緩衝。

| Risk Level | Buffer Ratio |
|---|---|
| R0 | 5% |
| R1 | 10% |
| R2 | 20% |
| R3 | 不排 |
| R4 | 禁止 |

```
Interruption Buffer =
    (純作業時間 + Setup + Teardown) × Buffer Ratio
```

---

## 9. 建議作業天數計算

假設每日最大有效作業時間：**8 小時**（不含休息）

```
建議天數 = ceil(總作業時間 / 8hr)
```

若 > 1 天：系統需重新檢查可作業日期窗口。

---

## 10. 系統輸出格式

Time Estimation Engine 必須輸出以下 JSON 結構：

```json
{
  "baseline_productivity": 250,
  "adjusted_productivity": 153,
  "pure_operation_hours": 29.4,
  "setup_minutes": 120,
  "teardown_minutes": 60,
  "rest_minutes": 180,
  "buffer_minutes": 300,
  "total_minutes": 2640,
  "suggested_days": 3,
  "time_model_version": "v1.0"
}
```

---

## 11. Versioning Strategy

每次計算必須儲存：

- `time_model_version`
- coefficient snapshot
- input parameters snapshot
- timestamp

**不得修改歷史資料。**

---

## 12. Future Evolution (v2+)

| Phase | 內容 |
|---|---|
| Phase 2 | 實際工時 vs 預估工時比對；自動校正 productivity |
| Phase 3 | 機器學習效率預測；區域風速模型優化；多任務排程最佳化 |

---

## 13. Out of Scope (Mock Version)

- 真實氣象 API 串接
- 即時風場模擬
- 自動排程最佳化
- AI 模型自學習

---

## 14. Strategic Value

Time Estimation Engine 是整個系統的成本核心。

它直接影響：

- 報價
- 毛利
- 排程
- 空域申請時間
- 風險暴露時間

> 這不是輔助工具。這是低空作業 OS 的計算核心之一。
