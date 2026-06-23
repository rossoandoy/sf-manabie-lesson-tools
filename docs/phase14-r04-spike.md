# Phase 14 Spike — R04 翌年度準備

**正本:** Excel `M06_Report.PrepareNextYear`（lesson-manage v0.6.0+）  
**拡張:** [`booth-fiscal-rollover.ts`](../apps/extension/lib/booth-fiscal-rollover.ts)

## Excel 処理順

| Step | Excel | 説明 |
|------|-------|------|
| 1 | トークン `FY{deleteYear}` | `deleteYear = currentYear - 1`。誤操作防止 |
| 2 | `SaveCopyAs` | ブック全体バックアップ |
| 3 | `ArchiveAndDeletePrintRows` | 前々年度 PrintSheet 行をアーカイブ後削除。**振替元/先あり行は残す** |
| 4 | FiscalYear +1 | Settings + ブース表ヘッダ更新 |
| 5 | 表示期間 4/1〜3/31 | 新年度の開始/終了日 |
| 6 | `InitBoothGrid` | グリッド再描画 |

## 拡張マッピング

| Excel | Chrome 拡張 |
|-------|---------------|
| `Settings.FiscalYear` | `BoothGridSettings.fiscalYear` |
| `currentYear` | `resolveCurrentFiscalYear(session)` — 設定空欄時は anchor 日付から `schoolYearFromDate` |
| `deleteYear` 範囲 | `{deleteYear}-04-01` 〜 `{deleteYear+1}-03-31` |
| PrintSheet 行削除 | `session.cells` 削除（seat 単位） |
| 振替跨ぎ保護 | `transferFrom` or `transferTo` 非空 → **削除しない** |
| Archive シート | `buildRolloverBackupJson()` → JSON ダウンロード |
| slotMeta 削除 | 同年度範囲の `slotMeta` 削除（repeatRecords は Phase 14 非対象） |
| syncManifest | 削除 slotKey の manifest エントリ除去 |
| InitBoothGrid | `saveBoothSession` + panel `renderAll` |
| 授業一覧期間 | `resetPrintDateRange` で新年度 4/1〜3/31 |

## 非包含（Phase 16 で解消）

- ~~前々年度 `repeatRecords` / `teacherRepeatRecords` 自動整理~~ → Phase 16 実装済

## 非包含（Phase 17+）

- 休校日マスタの年度整理
- R02 休校日削除後の再配置
- Production Execute allowlist

## G0 判定

**Go** — Excel 手順と 1:1 マッピング可能。破壊的操作はトークン + JSON バックアップで Mitigate。
