# Phase 9 Spike — コマ組 UX（塾マネ比較）

## 目標

教室長が **コマ組 + PrintSheet + Sync Dock** だけで週次運用（配置・繰り返し・出欠・振替・SF 同期）を完結。塾マネ同等のコピー/移動/定期を欠かない。

## 塾マネ vs TRG 拡張

| 塾マネ | Phase 9 対応 |
|--------|-------------|
| ドラッグ配置 | コピー/貼付/2クリック移動 + 矢印キー |
| 講師/生徒定期 | 生徒繰り返し（既存）+ **講師繰り返し**（9a） |
| 振替待ち | **振替待ちフィルタ** + サイドバー（9b） |
| 週コピー | **前週→今週**（講師+生徒揃いのみ）（9b） |
| 学年マスタ連動 | **catalog Grade 自動 fill**（9a） |

## スコープ（非包含）

- 講師給与・請求 UI（Manabie/SF 側）
- 翌年度準備（R04）
- Excel DataExport シート完全再現

## 実装マップ

| サブフェーズ | モジュール |
|-------------|-----------|
| 9a | `booth-slot-clipboard.ts`, `booth-teacher-repeat.ts`, `booth-grade-lookup.ts`, day toolbar |
| 9b | 振替待ち, `registerTransfer` ウィザード, `booth-week-copy.ts` |
| 9c | `periodStartTimes`, highlight, keyboard nav |

## G0 成果

→ [phase9-booth-ux-review-g0.md](./phase9-booth-ux-review-g0.md)
