# Master Catalog SOQL

Generated for trg2-extuat baseline. Re-run `npm run discover` after org schema changes.

**Org 別の Account フィールド差:** [org-configuration.md](./org-configuration.md)

## Org-wide（前提マスタ同期）

### locations（拠点 Account）

**trg2--extuat** — `TRG_BoothCount__c` のみ（`Booth__c` / `Capacity__c` は Account に存在しない）

```sql
SELECT Id, Name, MANAERP__Location_Type__c, MANAERP__Status__c,
       MANAERP__Academic_Calendar__c, TRG_BoothCount__c
FROM Account
WHERE MANAERP__Location_Type__c = 'Center' AND MANAERP__Status__c = 'Operating'
ORDER BY Name
LIMIT 2000
```

**デフォルト（その他 org）** — `Booth__c` + `Capacity__c`

```sql
SELECT Id, Name, MANAERP__Location_Type__c, MANAERP__Status__c,
       MANAERP__Academic_Calendar__c, Booth__c, Capacity__c
FROM Account
WHERE MANAERP__Location_Type__c = 'Center' AND MANAERP__Status__c = 'Operating'
ORDER BY Name
LIMIT 2000
```

実装: `buildLocationAccountsSoql(hostname)` in [`booth-count-from-account.ts`](../apps/extension/lib/booth-count-from-account.ts)

```sql
-- academicYears
SELECT Id, Name FROM MANAERP__Academic_Year__c ORDER BY Name DESC

-- locationCourses
SELECT Id, Name, MANAERP__Account__c, MANAERP__Course_Offering__c
FROM MANAERP__Location_Course__c ORDER BY Name

-- classes
SELECT Id, Name, MANAERP__Location_Course__c FROM MANAERP__Class__c ORDER BY Name

-- classrooms
SELECT Id, Name, MANAERP__Account__c FROM MANAERP__Classroom__c ORDER BY Name

-- teachers (org-wide fallback)
SELECT Id, Name FROM Contact WHERE RecordType.Name = 'Staff' ORDER BY Name

-- students (org-wide fallback; Lesson_Capacity は center-scoped のみ)
SELECT Id, Name, MANAERP__Grade__r.Name FROM Contact WHERE RecordType.Name = 'Student' ORDER BY Name

-- subjects
SELECT Id, Name FROM MANAERP__Subject_Master__c ORDER BY Name

-- academicCalendars
SELECT Id, Name FROM MANAERP__Academic_Calendar__c ORDER BY Name
```

## Center-scoped（コマ組ピッカー / Phase 11–13）

Affiliation で所属校舎 Account が解決された後、`center-scoped-catalog.ts` が実行。

**授業一覧（Phase 13）:** 「絞り込み」で生徒 or 講師を選んだ後、同じ center-scoped SOQL 結果を名前検索モーダル（`entity-search-modal.ts`）で表示。一括削除（F04）の名前選択も同じ catalog を使用。

### 生徒（Enrolled + Temporary · 2段階クエリ Phase 19）

relationship を WHERE に使わず FLS 失敗を回避。`center-scoped-catalog.ts` が以下を順に実行。

**Step 1 — Contact（Main_Location のみ）**

```sql
SELECT Id, Name, MANAERP__Enrollment_Status__c, MANAERP__Grade__r.Name
FROM Contact
WHERE RecordType.Name = 'Student'
  AND MANAERP__Main_Location__c = '{拠点 Account Id}'
ORDER BY Name
```

**Step 2 — Enrollment Status（Step 1 の lookup Id を IN 句で取得）**

```sql
SELECT Id, MANAERP__Current_Status__c
FROM MANAERP__Enrollment_Status__c
WHERE Id IN ('{id1}', '{id2}', ...)
```

クライアント側で `MANAERP__Current_Status__c IN ('Enrolled', 'Temporary')` のみ残す。Step 2 失敗時は警告 toast のうえ全 Contact を表示（Enrollment 未確認）。

| Status | UI 表示 |
|--------|---------|
| Enrolled | 在籍中 |
| Temporary | 未入会（体験） |

### 講師（Staff · Affiliation 所属）

```sql
SELECT MANAERP__Contact__c, MANAERP__Contact__r.Id, MANAERP__Contact__r.Name
FROM MANAERP__Affiliation__c
WHERE MANAERP__Account__c = '{拠点 Account Id}'
  AND MANAERP__Contact__r.RecordType.Name = 'Staff'
ORDER BY MANAERP__Contact__r.Name
```

参照: lesson-manage `manabie_data_integration_strategy.md`（extuat 大森北校実測）
