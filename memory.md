# Project Memory — Low Altitude Ops Platform

最後更新：2026-05-04

## 當前分支

`claude/data-integration-sprint-1` — 21 commits ahead of `main`

## Data Integration Sprint 1 — 完成狀態

全部 15 個 task 皆已 commit。

| # | Task | 狀態 |
|---|---|---|
| 1–3 | DB 擴充 + 時序分區表 + events / geo 表 | ✅ |
| 4 | `@openlarm/ingest-types`（NormalizedObservation / Forecast / Ensemble schemas）| ✅ |
| 5 | CWA AWS adapter（QC + bias filters）| ✅ |
| 6 | CWA Rainfall station adapter | ✅ |
| 7 | CWA Radar adapter（Supabase Storage 上傳）| ✅ |
| 8 | EPA Air-Quality 風場 adapter | ✅ |
| 9 | Open-Meteo Forecast adapter（含 daily budget guard）| ✅ |
| 10 | Open-Meteo Archive adapter（30 天歷史）| ✅ |
| 11 | `apps/ingest-worker` Railway scaffold + scheduler + healthz | ✅ |
| 12 | `@openlarm/ingest-builder` + `queryWeather30d` + freshness classifier | ✅ |
| 13 | `queryWeatherToday` 多源融合 + `buildLARMInput` | ✅ |
| 14 | `/api/weather/context` 改為由 Builder 從 Supabase 讀取 | ✅ |
| 15 | Railway 部署 + 24h smoke test + acceptance suite + runbook | ✅ |

### Worker 部署修正

- `7be3571` Dockerfile `EXPOSE 8080` 對齊 Railway PORT 預設
- `a0f8dcc` health server bind `0.0.0.0`（最新 commit）

## 未 commit（獨立小修）

`low-altitude-ops-platform/frontend/src/app/api/line/webhook/route.ts`
— 把錯誤訊息中的 `larm.drone168.com/quote` 換成 `https://quote.drone168.com`，並抽成常數 `RECREATE_QUOTE_URL`。

## 下一步候選

1. **跑 24h 驗收**（Task 15 acceptance suite）→ 通過後依 plan 走 `superpowers:finishing-a-development-branch` 合回 main
2. **Commit LINE webhook URL 修正**（獨立提交）
3. **Sprint 2 預留項目**：
   - `BuildingSiteInput` 真實 geo wiring（Task 13 目前回 placeholder defaults）
   - `predictability_score` 由 forecast vs obs RMSE 推導（目前固定 0.7）
   - `thunder_risk` 加入 CWA lightning（目前只用 Open-Meteo weather code）
   - ERA5 climate profile

## 開源發佈狀態（2026-04-24）

- ✅ `@openlarm/core@0.1.0-alpha.0` + `@openlarm/regions-taiwan@0.1.0-alpha.0` — staged，pre-publish dry-run 通過（tarballs 50 KB + 11 KB）
- ⏸ 正式 `npm publish` 待 npm 登入授權
- ✅ Vercel production deploy green on `main`
- ⏸ `LEGAL/DISCLAIMER.md` 律師定稿
- ⏸ GitHub teams `@openlarm/code-tsc` / `model-governance` / `spec-editors` 建立

## 相關文件

- 計畫：`docs/superpowers/plans/2026-04-27-data-integration-sprint-1.md`
- 規範：`spec/LARM-v2.0.md`
- 概念：`low-altitude-ops-platform/LARM_CONCEPT_GUIDE.md`
- 參數手冊：`low-altitude-ops-platform/LARM_PARAM_GUIDE.md`
