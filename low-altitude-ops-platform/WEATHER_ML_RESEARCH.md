# Weather Prediction ML Research — 適用於 LARM 的開源天氣 ML 模型調研

> 調研日期：2026-03-24
> 目標：找出 GitHub 上最熱門的自我訓練/學習/ML 模型，適用於提升 LARM 天氣預測準確性與降低誤差率

---

## 1. 現有 LARM 天氣系統分析

### 現有架構
LARM v2.0 目前使用**規則式風險評分 + 輕量統計校正**：

| 組件 | 方法 | 限制 |
|---|---|---|
| 氣象數據 | Open-Meteo / ECMWF IFS / CWA API | 依賴第三方預報，無自有模型 |
| 集成預報 | ECMWF 50 members → P10/P50/P90 | 只做統計彙總，不做 ML 後處理 |
| 偏差修正 | `forecast-tracker.ts` 線性扣除 | 簡單平均偏差，非 adaptive |
| 風險評分 | 查表 + 加權公式 | 無法從歷史事件中學習 |
| 交叉驗證 | Open-Meteo vs CWA vs JMA 比對 | 只報告差異，不融合預報 |

### 可改善方向
1. **預報後處理（Post-processing）**：用 ML 校正 NWP 模型輸出
2. **臨近預報（Nowcasting）**：0–6h 短期降雨/風速預測
3. **集成融合（Ensemble Blending）**：智慧融合多源預報
4. **區域降尺度（Downscaling）**：全球模型 → 台灣局部精細化

---

## 2. GitHub 熱門天氣 ML 模型總覽

### Tier 1：全球基礎模型（Foundation Models）

#### 2.1 GraphCast — Google DeepMind
- **GitHub**: `google-deepmind/graphcast` (~5,000+ stars)
- **架構**: Graph Neural Network (GNN)，icosahedral mesh
- **訓練方式**: Self-supervised on ERA5 reanalysis (1979–2017)
- **輸入**: 0.25° 全球格點，6 個大氣層級，37 個變量
- **輸出**: 6h 步長自回歸預報，可延伸至 10 天
- **精度**: 在 1,380 個驗證指標中超越 ECMWF HRES 的 90%
- **特色**:
  - 颱風路徑追蹤精度極高
  - 風場預測是強項（對 LARM 風速硬停判斷有用）
  - 單次推論 < 1 分鐘（TPU v4）
- **Fine-tune**: 可用自訂數據重新訓練，但需大量 GPU 資源
- **硬體需求**: 推論需 TPU/GPU（32GB+ VRAM）
- **LARM 適用性**: ★★★★☆ — 風速中期預測強，但不適合臨近預報

#### 2.2 Pangu-Weather — Huawei
- **GitHub**: `198808xc/Pangu-Weather` (~4,000+ stars)
- **架構**: 3D Swin Transformer（四個獨立模型：1h / 3h / 6h / 24h）
- **訓練方式**: Supervised on ERA5
- **輸入**: 0.25° 全球格點，13 個氣壓層 + 地表
- **輸出**: 對應時間步長的全球天氣場
- **精度**: 首個在所有時間尺度上超越 ECMWF IFS 的 AI 模型
- **特色**:
  - 1h 模型可用於短期精確預報
  - 3D 結構捕捉垂直大氣動態
  - 推論速度 ~1.4 秒/步（V100 GPU）
- **Fine-tune**: 需自行準備 ERA5 格式數據
- **硬體需求**: 推論 ~16GB GPU
- **LARM 適用性**: ★★★★☆ — 1h 模型可補強短期風速預報

#### 2.3 FourCastNet — NVIDIA
- **GitHub**: `NVlabs/FourCastNet` (~1,500+ stars)
- **架構**: Adaptive Fourier Neural Operator (AFNO) — Vision Transformer 變體，使用 Fourier mixing layers
- **訓練方式**: Supervised on ERA5
- **輸入**: 0.25° 全球格點，20 個變量
- **輸出**: 6h 步長預報
- **精度**: 接近 ECMWF IFS，部分指標持平
- **特色**:
  - **推論極快**（~2 秒/步），可即時產生大量集成成員
  - 適合產生 1000+ ensemble members → 精確 P10/P50/P90
  - Fourier 層在頻域捕捉全球模式
- **Fine-tune**: 架構簡潔，相對容易微調
- **硬體需求**: 推論 ~8GB GPU（最輕量的基礎模型之一）
- **LARM 適用性**: ★★★★★ — 可直接替代/補強 ECMWF ensemble，低硬體門檻

#### 2.4 Aurora — Microsoft Research
- **GitHub**: `microsoft/aurora` (~1,500+ stars)
- **架構**: 3D Swin Transformer Foundation Model
- **訓練方式**: Pretrained on ERA5 + CMIP6 多源數據，**設計即支援 fine-tune**
- **輸入**: 可變解析度（0.25° 至 0.1°），多變量
- **輸出**: 任意預報步長（可配置）
- **精度**: 與 GraphCast 同級，fine-tune 後可超越
- **特色**:
  - **Foundation Model 設計**：預訓練 → 少量數據微調
  - 支援大氣化學、空氣品質等多任務
  - 可針對特定區域（如台灣）fine-tune
- **Fine-tune**: ✅ 原生支援，文件完善
- **硬體需求**: 推論 ~16GB GPU，fine-tune 需 32GB+
- **LARM 適用性**: ★★★★★ — 最適合台灣區域微調的基礎模型

#### 2.5 GenCast — Google DeepMind
- **GitHub**: `google-deepmind/gencast` (~800+ stars)
- **架構**: Diffusion Model on icosahedral mesh
- **訓練方式**: Self-supervised，**原生機率式預報**
- **輸入**: 0.25° 全球格點
- **輸出**: 機率分佈式集成預報（非單一確定值）
- **精度**: 在 97.2% 的指標上超越 ECMWF ENS（集成預報）
- **特色**:
  - **唯一原生機率模型**：直接輸出不確定性分佈
  - 與 LARM 的機率式決策（rain prob > 60%）完美契合
  - 極端天氣事件預報能力強
- **Fine-tune**: 需自行實作
- **硬體需求**: 推論 ~32GB GPU
- **LARM 適用性**: ★★★★★ — 機率輸出直接對接 LARM 決策邏輯

#### 2.6 ClimaX — Microsoft
- **GitHub**: `microsoft/ClimaX` (~1,200+ stars)
- **架構**: Vision Transformer（ViT）
- **訓練方式**: Pretrained on CMIP6 氣候模擬數據，可 fine-tune
- **輸入**: 可變解析度、可變變量數（tokenization 設計）
- **輸出**: 天氣預報、降尺度、氣候投影
- **精度**: Fine-tune 後接近專門模型
- **特色**:
  - **少量數據即可微調**（few-shot capability）
  - 原生支援 downscaling（全球 → 區域）
  - 輕量級，適合快速實驗
- **Fine-tune**: ✅ 原生支援，有詳細教程
- **硬體需求**: 推論 ~8GB GPU
- **LARM 適用性**: ★★★★☆ — 降尺度能力對台灣局部預報有價值

---

### Tier 2：臨近預報與降雨專用（Nowcasting）

#### 2.7 pySTEPS — 業界標準臨近預報框架
- **GitHub**: `pySTEPS/pysteps` (~500+ stars)
- **架構**: Optical Flow + 隨機擾動（**非深度學習**）
- **方法**: Lagrangian extrapolation + stochastic noise
- **輸入**: 雷達降雨觀測序列
- **輸出**: 0–6h 機率式降雨預報
- **特色**:
  - 業界標準，氣象局廣泛採用
  - **無需 GPU**，CPU 即可運行
  - 完整 Python 套件，`pip install pysteps`
  - 內建多種 blending 方法（NWP + nowcast）
- **LARM 適用性**: ★★★★★ — 最容易整合，直接改善 Rain Score

#### 2.8 DGMR — DeepMind Generative Model of Rain
- **GitHub**: `openclimatefix/skillful_nowcasting` (~300+ stars)
- **架構**: Conditional GAN（生成對抗網路）
- **輸入**: 過去 20 分鐘雷達序列（4 幀 × 5 分鐘）
- **輸出**: 未來 90 分鐘降雨場（18 幀 × 5 分鐘）
- **精度**: 在 MetOffice 評測中，89% 氣象學家認為優於傳統方法
- **特色**:
  - 保留空間結構（非模糊化）
  - 機率式輸出（多次 sampling）
  - 對強降雨事件特別有效
- **硬體需求**: 推論 ~8GB GPU
- **LARM 適用性**: ★★★★☆ — 適合硬停規則（rain > 10mm/h）判斷

#### 2.9 NowcastNet — 清華大學
- **架構**: Physics-informed NN（對流生成 + 平流演化雙網路）
- **輸入**: 雷達反射率 + NWP 引導場
- **輸出**: 0–3h 降雨預報
- **精度**: 發表於 Nature，強降雨預報顯著優於 pySTEPS
- **特色**:
  - 物理約束提升泛化能力
  - 對流初生（convective initiation）預報能力強
  - 特別適合台灣午後雷陣雨（W4 regime）
- **LARM 適用性**: ★★★★☆ — 對 W4 午後對流預報特別有幫助

---

### Tier 3：時序模型 & 預報後處理

#### 2.10 Temporal Fusion Transformer (TFT)
- **GitHub**: `google-research/google-research` (內含 TFT)
- **架構**: Multi-horizon attention-based 時序模型
- **特色**:
  - 可解釋性強（variable importance、attention weights）
  - 處理多變量時序數據（風速、溫度、濕度、氣壓）
  - 內建 quantile 輸出（P10/P50/P90）
- **LARM 適用性**: ★★★★☆ — 可替代線性 bias correction

#### 2.11 Informer / Autoformer
- **GitHub**: `zhouhaoyi/Informer2020` (~4,000+ stars) / `thuml/Autoformer` (~1,800+ stars)
- **架構**: Efficient Long-Sequence Transformer
- **特色**:
  - ProbSparse self-attention（降低計算量）
  - 長序列預測（氣候趨勢）
  - Autoformer 加入 auto-correlation mechanism
- **LARM 適用性**: ★★★☆☆ — 適合長期趨勢，非即時決策

#### 2.12 LSTM / GRU 風速預測
- **架構**: 循環神經網路
- **特色**:
  - 訓練簡單，數據需求低
  - 站點級風速時序預測
  - 可在 client-side（TensorFlow.js）運行
- **LARM 適用性**: ★★★☆☆ — 可作為 Phase A 輕量升級

---

## 3. 自我訓練 / 自我學習機制

以下模型支援 **self-training** 或 **continuous learning**：

| 模型 | 自學習方式 | 說明 |
|---|---|---|
| **Aurora** | Fine-tune on local data | 用台灣歷史數據微調預訓練權重 |
| **ClimaX** | Few-shot fine-tuning | 少量樣本即可適應新區域 |
| **GenCast** | Score-based diffusion | 學習數據分佈而非點預測 |
| **TFT** | Online learning | 可增量訓練新數據 |
| **LSTM/GRU** | Continuous training | 每日用新觀測數據更新模型 |
| **pySTEPS** | Adaptive parameters | 自動調整光流參數 |

### LARM 現有可改善的自學習機制

目前 `forecast-tracker.ts` 的 bias correction 可升級為：

```
目前: corrected = forecast - mean_bias         (靜態平均)
升級1: corrected = forecast - kalman_bias       (Kalman Filter, adaptive)
升級2: corrected = lstm_model(forecast, context) (神經網路校正)
升級3: corrected = tft_model(multi_var_input)    (多變量融合)
```

---

## 4. LARM 需求 × 最佳模型配對

| LARM 需求 | 最佳候選 | 為什麼 |
|---|---|---|
| 風速硬停判斷（≥39 km/h） | FourCastNet、GenCast | 快速集成 → 精確 P90 風速估計 |
| 降雨機率決策（>10mm/h + >60%） | GenCast、pySTEPS、DGMR | 原生機率輸出 |
| 臨近預報（0–2h 作業窗口） | DGMR、pySTEPS、NowcastNet | 專為短期設計 |
| 台灣區域微調 | Aurora、ClimaX | Foundation model 支援 fine-tune |
| 最低整合門檻 | pySTEPS | Python 套件，無需 GPU |
| 集成預報升級 | FourCastNet | 可產生 1000+ members |
| Bias correction 升級 | TFT、LSTM | 取代線性修正 |
| 午後對流（W4）預報 | NowcastNet | 物理約束的對流預報 |

---

## 5. 建議實施路線圖

### Phase A：輕量統計升級（1–2 週）
**目標**：改善現有 bias correction，無需外部模型

- 將 `forecast-tracker.ts` 的線性 bias 升級為 **Exponential Moving Average** 或 **Kalman Filter**
- 加入 lead-time dependent decay（越遠的預報誤差越大）
- 加入 W-code conditional bias（不同天氣型態的偏差不同）
- **成本**: 零（純前端改動）
- **預期改善**: MAE 降低 10–15%

### Phase B：pySTEPS 降雨臨近預報（2–4 週）
**目標**：新增 0–6h 降雨臨近預報能力

- 在 server-side 新增 Python 微服務
- 接入 CWA 雷達數據（或 Open-Meteo radar）
- pySTEPS 產生機率式降雨預報
- 結果回饋至 WeatherNow 的 Rain Score
- **成本**: 低（CPU-only，無 GPU 需求）
- **預期改善**: 短期降雨命中率提升 20–30%

### Phase C：FourCastNet 集成預報（4–8 週）
**目標**：自有集成預報，替代/補強 ECMWF ensemble

- 部署 FourCastNet 推論服務（~8GB GPU）
- 產生 100–1000 ensemble members
- 計算 P10/P50/P90 風速與降雨
- 與 ECMWF ensemble 做 cross-validation
- **成本**: 中（需 GPU 推論服務）
- **預期改善**: 風速 P90 預報精度提升 15–25%

### Phase D：Aurora/ClimaX 區域微調（8–16 週）
**目標**：台灣區域專屬天氣預報模型

- 收集台灣 3–5 年歷史氣象數據（ERA5 + CWA 觀測）
- Fine-tune Aurora 或 ClimaX 至 0.1° 台灣解析度
- 部署推論服務，作為 LARM 主要氣象輸入
- **成本**: 高（需 32GB+ GPU 進行 fine-tune）
- **預期改善**: 台灣區域預報整體 MAE 降低 30–50%

### Phase E：NowcastNet 午後對流（可選）
**目標**：W4 regime 下的強化預報

- 針對台灣午後對流特徵訓練 NowcastNet
- 整合至 W4 時段的風險評分
- **預期改善**: W4 regime 預報命中率提升 25–35%

---

## 6. 模型比較總表

| 模型 | GitHub Stars | 架構 | 自學習 | GPU 需求 | 準確度 vs NWP | 整合難度 |
|---|---|---|---|---|---|---|
| GraphCast | ~5,000 | GNN | ○ | 32GB | 超越 HRES 90% | 高 |
| Pangu-Weather | ~4,000 | 3D Swin | ○ | 16GB | 超越 HRES | 高 |
| FourCastNet | ~1,500 | AFNO | ○ | 8GB | 接近 HRES | **中** |
| Aurora | ~1,500 | 3D Swin FM | **✓** | 16–32GB | 同級 | 中 |
| GenCast | ~800 | Diffusion | ○ | 32GB | 超越 ENS 97% | 高 |
| ClimaX | ~1,200 | ViT | **✓** | 8GB | Fine-tune 後接近 | **低** |
| pySTEPS | ~500 | Optical Flow | **✓** | **0 (CPU)** | 0–6h 業界標準 | **最低** |
| DGMR | ~300 | CGAN | ○ | 8GB | 0–90min 最佳 | 中 |
| Informer | ~4,000 | Transformer | ○ | 8GB | 長序列強 | 低 |
| TFT | N/A | Attention | **✓** | 4GB | 後處理強 | **低** |

**圖例**: ✓ = 原生支援自學習/fine-tune，○ = 需自行實作

---

## 7. 結論與建議

### 短期（立即可做）
- **pySTEPS** + **TFT/Kalman Filter** — 零到低成本，改善現有系統 15–30%

### 中期（3–6 個月）
- **FourCastNet** — 自有集成預報，風速預測大幅提升

### 長期（6–12 個月）
- **Aurora** fine-tune — 台灣區域專屬模型，整體預報品質質變

### 最佳 ROI（投資報酬比）
1. 🥇 **pySTEPS** — 最低成本、最快整合、直接改善降雨決策
2. 🥈 **FourCastNet** — 中等成本、大幅改善集成預報品質
3. 🥉 **Aurora** — 高成本但長期價值最大，台灣專屬模型
