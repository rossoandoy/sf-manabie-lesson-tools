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
  ├─ lesson schedule calendar UI
  ├─ closed date calendar UI
  ├─ import plan preview
  └─ sandbox execution

Service worker
  └─ Cookie Broker only: obtain sid cookie and return session context

Dashboard direct fetch
  └─ Salesforce REST / sObject APIs
```

This follows the Salesforce Inspector Reloaded style used by `sf-manabie-product-creator`.

## Tabs

| Tab | Purpose |
|-----|---------|
| 授業スケジュール | Lesson schedule input (lesson-csv-app equivalent) |
| 休校日 | Closed date input (closed_date_csv equivalent) |
| 登録内容の確認 | ImportPlan preview + CSV audit export |

Primary CTA: **Manabieへ登録** (Sandbox confirmation phrase: `EXECUTE SANDBOX`).

CSV export remains available as audit/fallback output only.

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

Phase 9 adds booth slot clipboard, teacher repeat, grade auto-fill, day toolbar, transfer queue, and week copy — see [phase9-booth-ux-spike.md](./phase9-booth-ux-spike.md).
