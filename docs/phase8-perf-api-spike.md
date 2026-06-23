# Phase 8 — Performance & API Spike

**日付:** 2026-06-20  
**目的:** Manabie SOQL ガバナ節約 + 描画コスト削減の設計根拠

## Query budget（現状 vs 目標）

| 操作 | 現状 SOQL | 目標 SOQL |
|------|-----------|-----------|
| ダッシュボード初回ロード | 3（fiscal range） | 3 |
| ブースセル 1 回保存 | 3 | **0** |
| 20 セル連続編集 | ~60 | **0** |
| 週ナビ（gap banner） | 0–3 | **0**（fiscal slice） |
| Manabie 週参照 | 1（bypass cache） | **0**（fiscal cache 再利用） |
| Sync Dock「Manabie データ更新」 | — | 3 |
| Execute 直前（stale 時） | 3 | 3 |
| 回数報告 Manabie ソース | 1（独立） | **0**（dashboard cache 共有） |
| Account 変更 | 3 | 3 |

## SOQL 更新トリガー（採用）

1. **編集中:** SOQL なし。`manabieCacheStale = true` のみ。
2. **手動:** Sync Dock「Manabie データ更新」→ 3 parallel SOQL。
3. **Execute 前:** stale なら confirm 付きで 1 回 fetch。
4. **初回 load / Account 変更 / マスタ同期後:** fetch。

## Fiscal cache clobber 修正

**問題:** `refreshBoothWeekGap` が week-only `fetchManabieQueryCache` を呼ぶと、`manabieQueryCache` が狭い range で上書きされ Sync Dock プランが古くなる。

**対策:** `ManabieCacheRegistry` で account ごとに fiscal entry を保持。week fetch は fiscal を拡張する場合のみ merge。plan build は常に fiscal entry を参照。

## buildManaerpLessonQuerySoql

- Phase 8 では LIMIT 追加は defer（org 依存リスク）。
- fiscal range は booth 行 min–max のまま。将来: visible week + buffer で分割 fetch。

## 描画（Part C）

| 箇所 | 対策 |
|------|------|
| booth 入力 | `renderGrid` 150ms debounce |
| slot 選択 | class toggle |
| Sync Dock | refresh coalesce（rAF 1 回） |
| PrintSheet 仮想化 | defer P2 |
