# Phase 17 G0 Review — Booth UX + 繰り返し配置

## 判定: Go（17b 実装）

## 採用スコープ

| ID | 機能 | モジュール |
|----|------|-----------|
| P17-1 | 選択コマ → repeat prefill（生徒/講師） | `booth-repeat-panel.ts` |
| P17-2 | 生徒/講師 検索モーダル | `entity-search-modal` 再利用 |
| P17-3 | 定期「終了」（cells/slotMeta 非削除） | `endRepeatRecord` / `endTeacherRepeatRecord` |
| P17-4 | 講師 conflict プレビュー | `dryRunTeacherRepeat(session)` |

## 非採用（Phase 18+）

| 項目 | 理由 |
|------|------|
| 1:2 グリッド D&D | ROI 低、Phase 15 keyboard/clipboard で代替 |
| repeat 一覧 UX 統合 | Phase 17 スコープ外 |
| cells repeatId 掃除 | Phase 16 ポリシー踏襲 |
| Production Execute | Phase 18 |
| Playwright E2E | Phase 18 |

## Sign-off 計画

Sandbox 0801 / `kohei.ando+trg@manabie.com` — #67–#72（[`e2e-sandbox-signoff.md`](e2e-sandbox-signoff.md)）

## CLI カバー

| テスト | signoff |
|--------|---------|
| `booth-repeat.test.ts` | #67 / #69 / #70 |
| `booth-teacher-repeat.test.ts` | #68 / #71 |
