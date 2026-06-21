# Atlassian プラグイン活用デモ — Lesson CSV Chrome 拡張 統合実装計画

> **生成日**: 2026-06-20  
> **対象リポジトリ**: `sf-manabie-lesson-tools`  
> **ベースアーキテクチャ**: [sf-manabie-product-creator](https://github.com/rossoandoy/sf-manabie-product-creator)

---

## 1. Atlassian MCP 接続状況

| 項目 | 結果 |
|------|------|
| MCP サーバー | `user-Atlassian MCP` — セッションに登録済み |
| 認証 | **403** — Confluence API トークン失効または権限不足 |
| 対応 | Cursor Settings → MCP → `Atlassian MCP` の API トークンを [Atlassian アカウント設定](https://id.atlassian.com/manage-profile/security/api-tokens) で再発行し、`~/.cursor/mcp.json` を更新 |

認証復旧後、以下のプロンプトで Confluence 原文を再取得できます:

```
/search-company-knowledge
Manabie Lesson CSV 仕様と Salesforce Object 構造を Confluence から取得し、
本ドキュメントと突合して差分を報告して。
page/1844740108, 1850671236, 2360836102, 1819508815, 2530050055, 2530082824
```

---

## 2. Confluence 参照ページ（仕様ソース）

| ページ | pageId | 用途 | ローカル反映先 |
|--------|--------|------|----------------|
| [CSV（授業予定）](https://manabie.atlassian.net/wiki/spaces/~61c3b17749f195006991f4e0/pages/1844740108/CSV) | 1844740108 | 既存 Web アプリ UI / CSV カラム定義 | `scheduleImportPlanBuilder.ts`, `lesson-calendar-panel.ts` |
| [CSV（休校日）](https://manabie.atlassian.net/wiki/spaces/~61c3b17749f195006991f4e0/pages/1850671236/CSV) | 1850671236 | 休校日 CSV 統合仕様 | `closedDatePlanBuilder.ts`, `closed-date-calendar-panel.ts` |
| [Scheduling](https://manabie.atlassian.net/wiki/spaces/~61c3b17749f195006991f4e0/pages/1819508815/Scheduling) | 1819508815 | Lesson ドメイン全体像 | `docs/02-lesson-domain.md` |
| [Salesforce Object](https://manabie.atlassian.net/wiki/spaces/~61c3b17749f195006991f4e0/pages/2360836102/Salesforce+Object) | 2360836102 | 登録対象 sObject / フィールド | `apps/extension/data/discovery-trg2-extuat.json` |
| [マスタ管理](https://manabie.atlassian.net/wiki/spaces/~61c3b17749f195006991f4e0/pages/2530050055) | 2530050055 | 前提マスタ取得元 | `lessonMasterCatalog.ts`, `docs/master-catalog-soql.md` |
| [授業管理](https://manabie.atlassian.net/wiki/spaces/~61c3b17749f195006991f4e0/pages/2530082824) | 2530082824 | 登録フロー / 業務ルール | `registrationExecutor.ts`, `dashboard.ts` |

**既存 Web アプリ（UI 参考）**

- 授業スケジュール: https://roua12tnt.github.io/lesson-csv-app/
- 休校日: https://roua12tnt.github.io/closed_date_csv/

---

## 3. 対象 sObject 一覧（CSV 行 → Salesforce）

### 3.1 授業スケジュール CSV

**レガシー CSV ヘッダ**（Confluence page/1844740108 準拠）:

```csv
拠点,年度,開始日,終了日,指導法種別,授業形態,拠点コース,クラス,教室,授業名,講師名,定員
```

| CSV 列 | sObject | フィールド API 名 | 備考 |
|--------|---------|-------------------|------|
| 拠点 | `MANAERP__Lesson_Schedule__c` | `MANAERP__Location__c` | Account (Center) 参照 |
| 年度 | 同上 | `MANAERP__Academic_Year__c` | |
| 開始日 | 同上 | `MANAERP__Start_Date_Time__c` | ISO8609 +09:00 |
| 終了日 | 同上 | `MANAERP__End_Date_Time__c` | 繰り返し終了日 |
| 指導法種別 | 同上 | `MANAERP__Teaching_Method__c` | 集団 / 個別 |
| 授業形態 | 同上 | `MANAERP__Teaching_Medium__c` | オフライン / オンライン |
| 拠点コース | 同上 | `MANAERP__Location_Course__c` | |
| クラス | `MANAERP__Lesson_Schedule_Class__c` | `MANAERP__Class__c` | junction、Schedule 作成後 |
| 教室 | `MANAERP__Lesson_Schedule_Classroom__c` | `MANAERP__Classroom__c` | junction、Schedule 作成後 |
| 授業名 | `MANAERP__Lesson_Schedule__c` | `Name` | |
| 講師名 | `MANAERP__Lesson_Schedule_Teacher__c` | `MANAERP__Teacher_Name__c` または `MANAERP__Teacher__c` | Contact 参照があれば ID 優先 |
| 定員 | `MANAERP__Lesson_Schedule__c` | `MANAERP__Lesson_Capacity__c` | |

### 3.2 休校日 CSV

**レガシー CSV ヘッダ**（Confluence page/1850671236 準拠）:

```csv
休校日,日付,年度
```

| CSV 列 | sObject | フィールド API 名 | 備考 |
|--------|---------|-------------------|------|
| 休校日 | `MANAERP__Closed_Date__c` | `Name` | |
| 日付 | 同上 | `MANAERP__Date_Time__c` | 日付 + T00:00:00+09:00 |
| 年度 | 同上 | `MANAERP__Academic_Year__c` | |
| （junction） | `MANAERP__Academic_Calendar_Closed_Dates__c` | `MANAERP__Closed_Date__c`, `MANAERP__Academic_Calendar__c` | Closed Date 作成後にリンク |

### 3.3 前提マスタ（Confluence マスタ管理 page/2530050055 準拠）

| カタログ | sObject | SOQL 概要 |
|----------|---------|-----------|
| locations | `Account` | `Location_Type__c = 'Center'`, `Status__c = 'Operating'` |
| academicYears | `MANAERP__Academic_Year__c` | |
| locationCourses | `MANAERP__Location_Course__c` | |
| classes | `MANAERP__Class__c` | |
| classrooms | `MANAERP__Classroom__c` | |
| teachers | `Contact` | `RecordType.Name = 'Staff'` |
| academicCalendars | `MANAERP__Academic_Calendar__c` | 休校日 junction に必須 |

Discovery 正本: `apps/extension/data/discovery-trg2-extuat.json`

---

## 4. API 登録バッチ順序

sf-manabie-product-creator の `RegistrationExecutor` パターン（依存順トポロジカルソート + `{{ref:localRef}}` 解決）をそのまま適用。

### 4.1 授業スケジュール ImportPlan

```text
batch-lesson-schedule          MANAERP__Lesson_Schedule__c          (create)
  ├─ batch-lesson-schedule-teacher     MANAERP__Lesson_Schedule_Teacher__c    dependsOn: schedule
  ├─ batch-lesson-schedule-classroom   MANAERP__Lesson_Schedule_Classroom__c  dependsOn: schedule (optional)
  └─ batch-lesson-schedule-class       MANAERP__Lesson_Schedule_Class__c      dependsOn: schedule (optional)
```

実装: `apps/extension/src/services/scheduleImportPlanBuilder.ts`

### 4.2 休校日 ImportPlan

```text
batch-closed-date                        MANAERP__Closed_Date__c
  └─ batch-academic-calendar-closed-date MANAERP__Academic_Calendar_Closed_Dates__c  dependsOn: closed-date
```

実装: `apps/extension/src/services/closedDatePlanBuilder.ts`

### 4.3 実行ガード（MPC パターン踏襲）

| ガード | 値 |
|--------|-----|
| 確認フレーズ | `EXECUTE SANDBOX` |
| Production 書き込み | ブロック（初期 MVP） |
| プレースホルダ残存 | 実行拒否 |
| CSV 出力 | 監査 / フォールバックのみ |

実装: `apps/extension/src/services/registrationExecutor.ts`

---

## 5. UI 画面構成

### 5.1 Dashboard タブ（Phase 1 — 実装済み）

```text
[授業スケジュール] [休校日] [登録内容の確認]
```

| タブ | 由来 | 主要コンポーネント |
|------|------|-------------------|
| 授業スケジュール | [lesson-csv-app](https://roua12tnt.github.io/lesson-csv-app/) | `lesson-calendar-panel.ts` — 週カレンダー + 授業詳細モーダル |
| 休校日 | [closed_date_csv](https://roua12tnt.github.io/closed_date_csv/) | `closed-date-calendar-panel.ts` — 月カレンダー + 休校日モーダル |
| 登録内容の確認 | sf-manabie-product-creator Preview 相当 | `schedule-preview-panel.ts` — ImportPlan + CSV 監査 |

**Primary CTA**: 「Manabieへ登録」（Sandbox 確認フレーズ必須）

### 5.2 マスタ同期パネル（全タブ共通）

- 拠点選択 → Academic Calendar 自動解決
- 「マスタ同期」ボタン → `syncMasterCatalog()` で 7 カタログを一括取得
- 実装: `master-sync-panel.ts`, `lessonMasterCatalog.ts`

### 5.3 Phase 2 タブ追加案（lesson-manage 統合）

```text
[授業スケジュール] [休校日] [コマ組] [回数報告] [登録内容の確認]
```

詳細: `docs/phase2-booth-grid-design.md`

---

## 6. MVP スコープと実装ステータス

| # | タスク | Confluence 根拠 | ステータス |
|---|--------|-----------------|------------|
| 1 | Extension bootstrap（MPC から fork） | Scheduling | **完了** — MV3 + Cookie Broker |
| 2 | Master sync | マスタ管理 page/2530050055 | **完了** — `lessonMasterCatalog.ts` |
| 3 | 授業予定 UI | CSV page/1844740108 | **完了** — カレンダー + モーダル |
| 4 | 休校日 UI 統合 | CSV page/1850671236 | **完了** — 別タブで統合 |
| 5 | ImportPlan builder | Salesforce Object page/2360836102 | **完了** — schedule + closed date |
| 6 | API 登録 executor | 授業管理 page/2530082824 | **完了** — Sandbox 限定 Execute |
| 7 | E2E Sandbox 検証 | — | **要実施** — `npm run verify` + 手動 Sign-off |

**MVP の最重要 UX**: CSV ダウンロード → Data Import Wizard ではなく、Dashboard 内「Manabieへ登録」1 ボタンで REST API 登録。

---

## 7. Phase 2 候補（lesson-manage FeatureList より）

| Phase | FeatureList ID | 機能 | Chrome 拡張モジュール |
|-------|----------------|------|----------------------|
| 2A | F03, F04, F08 | ブース表 1:2 グリッド、Settings | `booth-grid-panel.ts` |
| 2B | F05, F07 | PrintSheet（1行=1生徒）、繰り返し | `print-sheet-panel.ts` |
| 2C | F04 出欠, R08 | 出欠/振替、日曜非表示 | `attendance-panel.ts` |
| 2D | F19, F13 | `Lesson_Slot__c` upsert、請求キャッシュ | SF sync 拡張 |
| 2E | F06, F11, F12 | 回数報告、A3 印刷、データ出力 | `report-panel.ts` |
| 2F | F15 | 休校日ガード統合 | Phase 1.5 closed date と共有 |

参照: `~/Documents/dev/sfdev/TRG-PROJECT/lesson-manage/excel-vba/specs/FeatureList.md`

---

## 8. アーキテクチャ対応表（MPC → Lesson Tools）

| sf-manabie-product-creator | sf-manabie-lesson-tools |
|----------------------------|-------------------------|
| `ProductDefinition` | `LessonScheduleDefinition` / `ClosedDateDefinition` |
| `MasterCatalogSync` | `syncMasterCatalog()` |
| `importPlanBuilder` | `scheduleImportPlanBuilder` / `closedDatePlanBuilder` |
| `RegistrationExecutor` | `registrationExecutor.ts`（共通ロジック） |
| `SalesforceApiClient` | `lib/sf-api.ts` |
| Discovery JSON | `discovery-trg2-extuat.json` |
| Dashboard タブ | 授業 / 休校日 / プレビュー |
| 確認フレーズ Execute | `EXECUTE SANDBOX` |

---

## 9. 次のアクション

1. **Atlassian API トークン更新** — Confluence 原文との差分検証を可能にする
2. **Sandbox E2E** — trg2-extuat で授業スケジュール + 休校日の Execute 検証
3. **Phase 2A 着手** — `booth-grid-panel.ts` プロトタイプ（`docs/phase2-booth-grid-design.md` 参照）

---

## 付録: Atlassian プラグインが提供する価値（本デモで実証）

| 従来（手作業） | Atlassian プラグイン + Cursor |
|----------------|-------------------------------|
| Confluence 5+ ページを手動で開く | MCP `getConfluencePage` / `searchAtlassian` で一括取得 |
| CSV カラムと SF フィールドをスプレッドシートで照合 | エージェントが Confluence + discovery JSON を突合し ImportPlan を生成 |
| 仕様変更の追跡が困難 | 計画ドキュメントに Confluence pageId リンクを付与 |
| Jira チケット手動起票 | `/spec-to-backlog` で Epic + 子チケット自動生成（今回はスコープ外） |
