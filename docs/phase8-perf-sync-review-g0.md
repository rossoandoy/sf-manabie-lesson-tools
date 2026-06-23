# Phase 8 Review — Codex G0

**日付:** 2026-06-20  
**ゲート:** G0（Part B 着手前）  
**入力:** phase8-perf-api-spike.md, phase8-sync-ux-spike.md, phase4-ux-review-g0.md

## 結論

**合格。** 手動 Manabie データ更新 + Execute 前 stale 警告で API 浪費を解消。Sync UX 案 C（ドット + ボーダー）を採用。

## SOQL トリガー（確定）

| タイミング | SOQL |
|-----------|------|
| 編集中 | 0 |
| Manabie データ更新ボタン | 3 |
| Execute 前（stale） | 3 + confirm |
| 初回 / Account 変更 / マスタ同期 | 3 |
| 週ナビ gap | 0 |

Execute confirm 文言（stale 時）: 「Manabie データが最新ではありません。更新せずに実行しますか？」

## Sync UX（確定）

- 案 C: micro 3-segment dot（slot|attendance|reallocation）
- テキスト badge 廃止
- PrintSheet「未同期のみ」フィルタ: **採用**

## 非包含

- Production Execute
- PrintSheet 仮想スクロール
- SOQL LIMIT 追加
- Playwright Dashboard E2E

## Part B 着手条件

- [x] Query budget 合意
- [x] Fiscal cache registry 方針
- [x] Sync Manifest hash フィールド
- [x] UX 案 C 採用
