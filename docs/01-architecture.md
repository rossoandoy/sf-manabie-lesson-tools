# Architecture

## Runtime architecture

```text
Salesforce page
  └─ content script detects Salesforce host

Extension popup
  ├─ checks Salesforce connection
  └─ opens dashboard.html in a new Chrome tab

Dashboard tab
  ├─ master catalog sync
  ├─ booth grid / lesson calendar (コマ組)
  ├─ print sheet (授業一覧) + Sync Dock
  ├─ report (回数報告)
  ├─ closed date calendar
  └─ sandbox execution (Manabie登録)

Service worker
  └─ Cookie Broker only: obtain sid cookie and return session context

Dashboard direct fetch
  └─ Salesforce REST / sObject APIs
```

This follows the Salesforce Inspector Reloaded style used by `sf-manabie-product-creator`.

## Tabs（v0.3.0）

| Tab | Purpose |
|-----|---------|
| コマ組 | Booth grid 1:2, calendar sub-view, repeat / bulk delete |
| 授業一覧 | PrintSheet rows, filters, Sync Dock (F19 / 3B / 3C) |
| 回数報告 | Monthly report, F13 invoice cache |
| 休校日 | Closed dates (month view) |
| Manabie登録 | ImportPlan preview + legacy schedule registration |

Primary CTA: **Manabieへ登録** (Sandbox confirmation phrase: `EXECUTE SANDBOX`).

## Org-specific configuration

Account ブース数など org ごとに異なるフィールドは hostname ベースで解決します。  
See [org-configuration.md](./org-configuration.md).

## Booth / PrintSheet data flow (Phase 8)

```text
Booth grid edit / PrintSheet edit
  → local storage (hostname-scoped)
  → NO automatic Manabie SOQL

Sync Dock "Manabie データ更新" (manual)
  → Lesson + Student Session cache refresh
  → Schedule Gap recompute

Sync Dock Execute (F19 / 3B / 3C)
  → Sync Manifest per slot (3 dots: F19 | 3B | 3C)
  → contentHash stale detection on edit
```

Phase 9–17 adds booth slot clipboard, teacher/student repeat, affiliation-scoped pickers, R04 rollover, and entity search modals — see phase spike docs in README.
