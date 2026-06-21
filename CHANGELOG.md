# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
