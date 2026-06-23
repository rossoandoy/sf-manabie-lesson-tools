# Phase 16 Spike — R04 repeat 自動整理

**日付:** 2026-06-21  
**前提:** Phase 14 R04 コア完了（cells / slotMeta / manifest + JSON backup）

## 背景

Phase 14 の [`booth-fiscal-rollover.ts`](../apps/extension/lib/booth-fiscal-rollover.ts) は `repeatRecords` / `teacherRepeatRecords` を触らず、翌年度準備後も **前年度 active 定期が残る** 問題があった。

## 採用ポリシー

翌年度準備後の新年度起点: **`nextYear` の 4/1**（`fiscalYearBounds(nextYear).from`）

| 条件 | 処理 |
|------|------|
| `endDate < nextYear-04-01` | `status: 'ended'` |
| `endDate >= nextYear-04-01` かつ `startDate < nextYear-04-01` | `startDate = nextYear-04-01`（クリップ）、`active` 維持 |
| 上記以外 | 変更なし |

## 実装

| 関数 | 役割 |
|------|------|
| `planRepeatCleanup` | dry-run 件数 |
| `applyRepeatCleanup` | mutation + `updatedAt` |
| `formatRepeatCleanupSummary` | UI 文言 |
| `previewFiscalRollover` | `repeatCleanup` を preview に含める |
| `applyFiscalRollover` | cells 処理後に repeat 整理 |

## 非包含

- 終了 repeat に紐づく cells の `repeatId` 掃除
- 休校日マスタ年度整理
- Production Execute / Playwright

## G0 判定

**Go** — Excel R04 の repeat ギャップを Phase 14 設計に沿って最小 diff で解消。
