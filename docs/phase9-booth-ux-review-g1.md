# Phase 9 G1 Review — Booth UX 完了

## 判定: Pass（CLI verify + signoff #33–#36）

## 実装サマリー

| 領域 | ファイル | テスト |
|------|---------|--------|
| Slot clipboard | `booth-slot-clipboard.ts` | `booth-slot-clipboard.test.ts` |
| Teacher repeat | `booth-teacher-repeat.ts` | `booth-teacher-repeat.test.ts` |
| Grade auto | `booth-grade-lookup.ts` | `booth-grade-lookup.test.ts` |
| Week copy | `booth-week-copy.ts` | `booth-week-copy.test.ts` |
| UI | `booth-grid-panel.ts`, `print-sheet-panel.ts` | 手動 #33–#36 |

## 成功基準チェック

- [x] F04 コマ copy/paste/move
- [x] F07 講師定期
- [x] R06 学年自動（catalog）
- [x] 日付列 一括出席 / 休校化 / 全削除
- [x] 振替待ち + ウィザード
- [x] 週コピー
- [x] R10 時限時刻（設定）
- [x] 強調ハイライト
- [x] キーボード booth ナビ

## 残リスク

- 振替ウィザードは簡易モーダル（Excel InputBox 相当）。複数生徒一括振替は Phase 10。
- 週コピーは「占有先スキップ」のみ（上書きなし）。

## Sign-off

→ [e2e-sandbox-signoff.md](./e2e-sandbox-signoff.md) #33–#36
