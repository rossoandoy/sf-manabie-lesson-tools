# Phase 7 Part A: Reallocation Discovery Spike

**Status:** TRG 合意 — 狭義 create（2026-06-20）  
**Org:** trg2-extuat

## 調査方法

```bash
npm run discover -- trg2--extuat
```

[`scripts/discover-lesson-objects.py`](../scripts/discover-lesson-objects.py) が `MANAERP__Reallocation__c` を describe します。

## 必須フィールド（create 時）

| API 名 | ラベル |
|--------|--------|
| `MANAERP__Original_Student_Sessions__c` | 元の生徒セッション |
| `MANAERP__Reallocate_Status__c` | 振替ステータス |

## 主要 lookup / 日付

| API 名 | 用途 |
|--------|------|
| `MANAERP__Original_Lesson__c` | 元授業 |
| `MANAERP__Original_Lesson_Date__c` | 元授業日（= `transferFrom`） |
| `MANAERP__New_Lesson__c` | 振替先授業 |
| `MANAERP__New_Lesson_Date__c` | 振替先日（= `transferTo`） |
| `MANAERP__Original_Student_Name__c` | 生徒名 |
| `MANAERP__Reason__c` | 理由（任意 — `"TRG booth transfer"`） |

## Reallocate_Status picklist

- `Open`（新規 create のデフォルト）
- `Approved`
- `Rejected`

## 実データ

```sql
SELECT Id, MANAERP__Original_Student_Sessions__c, MANAERP__New_Lesson__c,
       MANAERP__Reallocate_Status__c
FROM MANAERP__Reallocation__c LIMIT 5
```

**extuat サンプル: 0 件** — live テストは create → verify → delete。

## TRG 合意（Phase 7 実装ポリシー）

| 条件 | 動作 |
|------|------|
| PrintSheet `attendance=振替` + `transferFrom` あり | Reallocation create |
| 元日 Session 解決 | `Original_Student_Sessions__c` 設定 |
| 先日 Lesson 解決 | `New_Lesson__c` + dates |
| 先日 Session 不在 | **warning のみ** — 3B+ は別 Execute |
| 振替先 Session 自動 create + Reallocation 一括 | **Phase 7 非包含** |

## TRG 確認チェックリスト

- [x] 新規 Reallocation は `Open` で create してよいか
- [x] 振替先 Session 不在時は Reallocation のみ（先に 3B+ は別操作）
- [ ] `Approved` への自動遷移は不要か
- [ ] Reason 固定 `"TRG booth transfer"` でよいか
- [ ] 同一 transferFrom/To/生徒の重複 create 防止方針

## Sandbox 手動検証手順

1. コマ組で振替登録（振替元 Session が Manabie に存在する週）
2. PrintSheet で振替行 + transferFrom 確認
3. Sync Dock **Manabie 振替登録（3C）** → Execute
4. SOQL で Reallocation 1 件確認 → テスト後 delete
