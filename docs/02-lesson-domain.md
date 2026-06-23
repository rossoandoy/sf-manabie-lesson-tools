# Lesson Domain Model

## Lesson schedule CSV mapping

Legacy web app columns:

```csv
拠点,年度,開始日,終了日,指導法種別,授業形態,拠点コース,クラス,教室,授業名,講師名,定員
```

## Salesforce objects (trg2-extuat baseline)

| Batch | Object |
|-------|--------|
| lessonSchedule | `MANAERP__Lesson_Schedule__c` |
| lessonScheduleTeacher | `MANAERP__Lesson_Schedule_Teacher__c` |
| lessonScheduleClassroom | `MANAERP__Lesson_Schedule_Classroom__c` |
| lessonScheduleClass | `MANAERP__Lesson_Schedule_Class__c` |

## Closed date CSV mapping

```csv
休校日,日付,年度
```

| Batch | Object |
|-------|--------|
| closedDate | `MANAERP__Closed_Date__c` |
| academicCalendarClosedDate | `MANAERP__Academic_Calendar_Closed_Dates__c` |

Phase 1.5 enables closed date API registration from the preview tab.

## Master catalogs

- locations (`Account` Center)
- academicYears
- locationCourses
- classes
- classrooms
- teachers (`Contact` Staff, when available)
- academicCalendars

Discovery profile: `apps/extension/data/discovery-trg2-extuat.json`

## TRG booth operations (Phase 2)

| Layer | Object | Role |
|-------|--------|------|
| Booth / PrintSheet | local session | 1 seat = 1 student daily assignment |
| SF sync (2D) | `Lesson_Slot__c` | Excel F19 compatible upsert via `Slot_Key__c` |

### 1:2 ブース = 1 生徒 1 Slot レコード（Phase 11 確認）

1 ブース・1 時限の 1:2 授業でも、**席1・席2それぞれが独立した PrintSheet 行 → `Lesson_Slot__c` 1 件**。

- `boothCellsToPrintRows`: seat 1 / seat 2 → 別 `PrintSheetRow`
- `Slot_Key__c`: `{accountId}_{YYYYMMDD}_P{period}_B{booth}_{studentName}`（席番号はキーに含めず、生徒名で一意）
- 回数報告: 1 row = 1 コマ（集計にそのまま利用）

Manabie 標準の 1 Lesson + N Student_Sessions モデルとは粒度が異なる。TRG 日常運用の正本は **Lesson_Slot__c（F19）**。

## Reporting (Phase 2E–2F)

Monthly report aggregates booth activity via `LessonActivitySource` → `BoothActivitySource` (Phase 2E). Closed dates are excluded from right-table metrics (Phase 2F / F15).

### Billing cache (Phase 2F / F13)

Excel `SyncTranFromSF` equivalent:

```text
MANAERP__Invoice__c (SOQL) → invoice_cache_by_host → 回数報告 左表（請求中 / 支払済 コマ数）
```

| Field / setting | Role |
|-----------------|------|
| `TRG_IF_RevenueMonth__c` | Month key (`YYYY/MM`) |
| `MANAERP__Contact__r.Name` | Student name for lookup |
| `invoiceBilling.billItemRelationship` | Optional child relation for koma counts (org-specific) |
| `invoiceBilling.billedKomaField` | Billed koma field on bill item |
| `invoiceBilling.paidKomaField` | Paid koma field on bill item |

Discovery profile optional block: `config.invoiceBilling` in `apps/extension/data/discovery-trg2-extuat.json`. When bill_item settings are unset, sync succeeds but left-table koma stays empty (same as Excel before Settings are configured).

Implementation: [`invoiceSyncService.ts`](../apps/extension/src/services/invoiceSyncService.ts), [`invoice-cache-state.ts`](../apps/extension/lib/invoice-cache-state.ts), [`report-panel.ts`](../apps/extension/dashboard/components/report-panel.ts).

### Closed date guard (Phase 2F / F15)

Phase 1.5 closed dates are reconciled into booth session cells (`休講`, `countTarget=false`) via [`closed-date-guard.ts`](../apps/extension/lib/closed-date-guard.ts). **Phase 2H** adds bidirectional reconcile: removing a closed date restores prior attendance when the cell was auto-marked. Report aggregation also skips dates in the closed-date set as a safety net.

### Excel parity (Phase 2G — complete)

PrintSheet / booth session include teacher (slot meta), grade, lesson kind, student type, note. Slot sync maps extended columns to `Lesson_Slot__c`. Makeup counts include `振替` even when `countTarget=false` (Excel M06 parity).

### Manabie read bridge (Phase 3A — implemented)

[`manaerpLessonQueryService.ts`](../apps/extension/src/services/manaerpLessonQueryService.ts) queries `MANAERP__Lesson__c` + `MANAERP__Student_Sessions__r`. [`ManaerpStudentSessionSource`](../apps/extension/lib/lesson-activity-source.ts) feeds the monthly report when the dashboard data source is set to Manabie SF. Booth grid **Manabie 週参照** merges SF attendance into matching cells by date + student name.

### Manabie write bridge (Phase 3B — implemented)

Query-then-update strategy via [`studentSessionUpdatePlanBuilder.ts`](../apps/extension/src/services/studentSessionUpdatePlanBuilder.ts): booth PrintSheet attendance (出席/欠席 only) → `MANAERP__Attendance_Status__c` update. Dashboard **Manabie 出欠同期（3B）** runs alongside `Lesson_Slot__c` upsert (F19). F13 billing uses `invoiceBilling.billedKomaField = TRG_Purchased_Slot__c` on `MANAERP__Invoice_Bill_Items__r`.

### Schedule gap warning (Phase 3D — implemented)

[`lessonScheduleGapService.ts`](../apps/extension/src/services/lessonScheduleGapService.ts) compares booth active days vs Manabie `Lesson` / `Lesson_Schedule` for the visible week. Warnings appear in booth toolbar and PrintSheet sync panel when Lesson instances are missing (explains 3B `SESSION_NOT_MATCHED` skips).

### Dashboard UX / Sync Dock (Phase 4 — implemented)

PrintSheet 下部に **Sync Dock** を集約: F19 + 3B + マスタ前提バッジ + 直近実行サマリ。Sandbox Execute は `confirmSandboxExecute` モーダル（フレーズ一致まで disabled）。ヘッダー下 **Setup checklist** でマスタ / Account / F13 初回同期を誘導。

Implementation: [`sync-dock-panel.ts`](../apps/extension/dashboard/components/sync-dock-panel.ts), [`confirm-modal.ts`](../apps/extension/dashboard/components/confirm-modal.ts), [`operator-messages.ts`](../apps/extension/dashboard/components/operator-messages.ts).

### Student Session create (Phase 5 / 3B+ — implemented)

When Manabie **Lesson exists** but **Student_Session is missing**, Sync Dock **Manabie Session 作成（3B+）** creates sessions for 出席/欠席 rows only. Same-day multiple Lessons → `LESSON_AMBIGUOUS` skip. Days in Schedule Gap → no create (3D warning unchanged).

Implementation: [`studentSessionCreatePlanBuilder.ts`](../apps/extension/src/services/studentSessionCreatePlanBuilder.ts), [`manabie-query-cache.ts`](../apps/extension/lib/manabie-query-cache.ts) (gap reuse from fiscal SOQL cache).

### Booth performance (Phase 5 / Phase 15)

[`booth-grid-panel.ts`](../apps/extension/dashboard/components/booth-grid-panel.ts) + [`booth-grid-virtual.ts`](../apps/extension/lib/booth-grid-virtual.ts): when `boothCount × periods × weekDays × 2 > 400`, renders a **2-day window** with ◀日/日▶ toolbar navigation; week nav resets `dayScrollOffset`. Text input uses partial DOM updates (no full grid re-render on keystroke). [`manabie-query-cache.ts`](../apps/extension/lib/manabie-query-cache.ts) reuses cached Lesson/Session queries for week gap subset.

### F13 paid koma (Phase 6 — implemented)

Left-table **支払済** uses the same `TRG_Purchased_Slot__c` as billed, summed only on bill items where `TRG_IF_PaidAmount__c` is populated (`paidKomaWhenField`). See [phase6-paidkoma-spike.md](phase6-paidkoma-spike.md).

### Attendance write extension (Phase 6 — implemented)

3B / 3B+ write **休講** as `Absent` + `MANAERP__Attendance_Note__c = "休講"`. See [phase6-attendance-policy-spike.md](phase6-attendance-policy-spike.md).

### Reallocation bridge (Phase 7 — implemented)

PrintSheet 振替行（`transferFrom` あり）→ [`reallocationPlanBuilder.ts`](../apps/extension/src/services/reallocationPlanBuilder.ts) → `MANAERP__Reallocation__c` create via Sync Dock **Manabie 振替登録（3C）**. See [phase7-reallocation-spike.md](phase7-reallocation-spike.md).

### Performance & sync UX (Phase 8 — implemented)

- **Manual Manabie refresh:** editing booth/PrintSheet does not trigger SOQL; Sync Dock **Manabie データ更新** refetches Lesson + Session + gap.
- **Sync Manifest:** [`sync-manifest.ts`](../apps/extension/lib/sync-manifest.ts) tracks F19 / 3B / 3C layers per slotKey with `contentHash` stale detection.
- **Visual:** PrintSheet SF column uses 3-segment dots (no text badge). See [phase8-sync-ux-spike.md](phase8-sync-ux-spike.md).

## Manabie standard bridge (Phase 3 roadmap)

The original [lesson-csv-app](https://roua12tnt.github.io/lesson-csv-app/) targets **Manabie standard** objects:

```text
Lesson Schedule (Phase 1) → Lesson (platform) → Student_Session (attendance)
```

TRG booth tools use `Lesson_Slot__c` for daily operations. Convergence plan (see `docs/manaerp-lesson-mapping-spike.md`):

| Phase | Goal |
|-------|------|
| 3A Read | Query `MANAERP__Lesson__c` + `MANAERP__Student_Sessions__c`; report source toggle + booth week reference | **Done (read-only)** |
| 3B Write | Update attendance on Student_Session; keep Lesson_Slot during transition | **Done** |
| 3C Report | `ManaerpStudentSessionSource` implements `LessonActivitySource` | **Done (3A)** |
| 3D Schedule | Warn when Lesson Schedule exists but Lesson instances missing for booth week | **Done** |

Implementation detail: [`apps/extension/lib/lesson-activity-source.ts`](../apps/extension/lib/lesson-activity-source.ts) abstracts activity records so report logic stays stable across data sources.

