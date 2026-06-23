# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.3.0] - 2026-06-21

### Added

- Phase 10–17: Excel 同型ブース表、Affiliation 所属校舎、center-scoped 生徒/講師 catalog、名前検索モーダル、一括削除（右ペイン）、R04 翌年度準備、繰り返し配置 UX（prefill / 検索 / 終了 / conflict）
- Org 別 Account SOQL（`accountLocationFieldConfig` / `buildLocationAccountsSoql`）— trg2--extuat は `TRG_BoothCount__c`
- Entity name picker UI（授業一覧 / 回数報告 / 一括削除）— クリックで選択する表示ボタン
- ヘッダー折りたたみ、時限ヘッダー sticky、教科 Subject Master プルダウン
- Developer doc: [docs/org-configuration.md](docs/org-configuration.md)

### Changed

- 生徒/講師名選択: readonly input から表示専用ボタン（▾）へ
- 休校日タブ: 月ビューのみ
- 出欠 UI: 出席/欠席/振替の視覚強化

### Fixed

- 前提マスタ同期: trg2--extuat で存在しない `Booth__c` / `Capacity__c` による `INVALID_FIELD`
- マスタ同期成功後 `refreshClosedPanel?.()` が `partial.catalog` でクラッシュする問題
- Contact 生徒 SOQL から org 上存在しない `MANAERP__Lesson_Capacity__c` を除外（center-scoped のみ使用）

## [0.2.0] - 2026-06-20

### Added

- Phase 9: booth slot copy/paste/move, teacher repeat, grade auto-fill, day toolbar (bulk attend / closed / clear day)
- Transfer pending filter, transfer wizard, week copy, period start times, cell highlight, keyboard grid nav
- `docs/feature-parity.md`, Phase 9 spike/G0/G1 review docs
- Master catalog sync and Sandbox `Lesson_Slot__c` upsert (F19)
- Manabie read (Lesson + Student Session), attendance write (3B), Session create (3B+)
- Schedule Gap warnings, invoice cache (F13), paid koma column (Phase 6)
- Reallocation bridge (3C) for transfer rows with `transferFrom`
- Sync Manifest: F19 / 3B / 3C per-slot sync state with dot indicators
- Student repeat scheduling, attendance/transfer, A3 print, report CSV
- E2E live tests and sandbox signoff checklist (#1–#32)

### Changed

- Editing booth/PrintSheet no longer triggers automatic Manabie SOQL; use Sync Dock **Manabie データ更新**
- PrintSheet SF column uses 3-segment dots instead of text badges

### Fixed

- Fiscal Manabie cache no longer clobbered by week-only gap fetches
- Booth grid render debounced; Sync Dock refresh coalesced via rAF
