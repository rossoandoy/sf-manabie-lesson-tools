# Phase 15 Spike — 1:2 コマ組 UI/UX 改善

**日付:** 2026-06-21  
**前提:** Phase 14 完了（173 tests Pass）

## 背景

Phase 12 でコマ組を **週全体1テーブル** に統一した結果、Phase 5 で実装していた **day windowing 仮想スクロール** がコードから消失（ドキュメントのみ残存）。同時に `input` ハンドラの `debouncedRenderGrid()` がタイプ中のフォーカス喪失を招く。

## 回帰 vs 復元方針

| 項目 | Phase 5 | Phase 12 後 | Phase 15 |
|------|---------|-------------|----------|
| グリッド DOM | 2 日 window | 全週 innerHTML | **2 日 window + 単一テーブル sticky** |
| 閾値 | 400 cells | なし | `booth-grid-virtual.ts` で復元 |
| 日ナビ | ◀日/日▶ | なし | ツールバーに復活 |
| 入力 | debounce render | 同左 | **partial class update のみ** |

## キーボード（Phase 4 G2 残）

| 操作 | モジュール |
|------|-----------|
| Tab / Shift+Tab | `booth-grid-keyboard.ts` — 講師→席1→席2 巡回 |
| Ctrl+C/V/X | `booth-slot-clipboard.ts` 再利用 |
| Escape | move / clipboard キャンセル |
| 矢印 | 既存 + `focusSlotInput` で field 維持 |

## 振替 v2

- 選択中コマからウィザード prefill
- center-scoped 生徒ピッカー
- `registerTransferPair` — 同コマ 2 席一括
- 振替待ちリスト → grid select + scroll

## 非スコープ（Phase 16）

- Production Execute / Playwright / R04 repeat 整理
- ドラッグ&ドロップ配置（塾マネ型）
