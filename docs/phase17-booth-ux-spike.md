# Phase 17 Spike — 1:2 コマ組 UX レビュー + 繰り返し配置仕上げ

**日付:** 2026-06-21  
**前提:** Phase 16 完了（187 tests Pass）

## Codex / 内部監査 結論

### D&D 判定: **No-Go**（Phase 18+ defer）

| 観点 | 評価 |
|------|------|
| Phase 9/15 方針 | copy/paste + 2-click move + keyboard で F04 相当をカバー済み |
| 実装コスト | 2 席/コマ + sticky + day window で D&D は高コスト |
| 既存代替 | Tab 巡回 / Ctrl+C/V/X / フォーカス保持（Phase 15） |
| 塾マネ比較 | D&D 単体より **repeat prefill / 検索 / 終了 / conflict** の ROI が高い |

**推奨:** clipboard/keyboard の磨き込みを継続。D&D は Phase 18 で再評価のみ。

### 繰り返し配置レビューギャップ

| 項目 | 生徒 | 講師 |
|------|------|------|
| 実装 | あり（Phase 2 以降） | Phase 9 |
| 手動 signoff | #46 のみ | #34（PrintSheet 表記ドリフト） |
| マニュアル | 欠落 | §148–150 |
| 選択コマ prefill | なし → **Phase 17 で追加** | なし → **Phase 17 で追加** |
| 検索モーダル | なし → **Phase 17 で追加** | なし → **Phase 17 で追加** |
| 手動終了 | なし → **Phase 17 で追加** | なし → **Phase 17 で追加** |
| conflict プレビュー | buildRepeatPlan で満席 skip | 講師衝突 skip → **Phase 17 で追加** |

## F07/F04 優先度 Top 5（Phase 17 採用）

| 優先 | 改善 | 根拠 |
|------|------|------|
| 1 | 選択コマ → repeat prefill | 振替 v2 と同パターン、入力ミス削減 |
| 2 | 生徒/講師 検索モーダル統一 | typo 防止、catalog 整合 |
| 3 | 定期「終了」UI | R04 以外の運用ニーズ |
| 4 | 講師 conflict プレビュー | 上書き事故防止 |
| 5 | マニュアル + signoff 整備 | 生徒 repeat の運用空白解消 |

## 実装

| モジュール | 変更 |
|-----------|------|
| `booth-repeat-panel.ts` | prefill / 検索 / 終了ボタン |
| `booth-session-state.ts` | `endRepeatRecord` |
| `booth-teacher-repeat.ts` | conflict skip + `endTeacherRepeatRecord` |
| `booth-grid-panel.ts` | `getSelectedSlot` 拡張 + `getTeacherRecords` |

## 非スコープ（Phase 18）

- 1:2 グリッド D&D
- Production Execute allowlist
- Playwright Dashboard E2E
- ended repeat の cells `repeatId` 掃除

## G0 判定

**Go** — D&D No-Go、repeat UX 4 項目を Phase 17 で実装。
