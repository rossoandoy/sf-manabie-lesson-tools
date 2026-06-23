# Phase 4 UX Review — Codex G1（confirm-modal + Sync Dock）

**日付:** 2026-06-20  
**ゲート:** G1（Part B 完了後）  
**合格基準:** ネイティブ dialog ゼロ、破壊的操作の誤タップリスク低減

## 結論

**合格。**

## ネイティブ dialog 置換

| 旧 UI | 新 UI | ファイル |
|-------|-------|----------|
| `prompt` (F19 / 3B) | `confirmSandboxExecute` + フレーズ一致 | `slot-sync-panel.ts` |
| `prompt` (F13) | `confirmSandboxExecute` | `report-panel.ts` |
| `prompt` (休校日 / 授業登録) | `confirmSandboxExecute` | `dashboard.ts` |
| `window.confirm` (週参照) | `confirmAction` + 箇条書き | `booth-grid-panel.ts` |
| `window.alert` | `showToast` / `showAlert` | `booth-grid-panel.ts` |
| `confirm` (全削除) | `confirmAction` + danger | `lesson-calendar-panel.ts`, `closed-date-calendar-panel.ts` |

## Sync Dock POC

- PrintSheet 下部に `sync-dock-panel.ts` を集約
- preview タブから `slot-sync-panel-root` を削除
- 実行結果はトースト + Sync Dock 内サマリ（`<details>` 実行ログは詳細用に維持）

## リスク低減

- Sandbox 実行: フレーズ完全一致まで「実行」ボタン disabled
- 週参照: 上書き件数 / スキップ件数をモーダル内リスト表示
- 全削除: `danger` スタイル + 明示ラベル

## テスト

- `confirm-modal.test.ts`: キャンセル / 一致 / 不一致 disabled
- `sync-dock-panel.test.ts`: render smoke
