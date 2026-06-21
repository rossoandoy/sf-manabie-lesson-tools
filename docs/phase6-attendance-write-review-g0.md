# Phase 6 Attendance Write — Codex G0 Review

**Gate:** Part C 着手前  
**Date:** 2026-06-20  
**Verdict:** **Pass** — 狭義 mapping のみ。Reallocation 非包含。

## 採用 mapping

| Booth | Manabie `MANAERP__Attendance_Status__c` | Note |
|-------|----------------------------------------|------|
| 出席 | Attend | — |
| 欠席 | Absent | — |
| 休講 | Absent | `MANAERP__Attendance_Note__c` = `"休講"` |
| 振替 | —（write しない） | ローカル `transferFrom/To` 維持 |
| 未確定 | —（write しない） | — |

## create / update 分岐

```text
PrintSheet row + Session exists  → studentSessionUpdatePlanBuilder (3B)
PrintSheet row + Session missing → studentSessionCreatePlanBuilder (3B+)
  └─ 休講も create 対象（Lesson 解決済みの場合）
```

## 非包含（固定）

- `MANAERP__Reallocation__c` レコード作成
- 振替先 Lesson 自動解決
- Production Execute
- Option C フル移行

## リスク受理

| リスク | 対策 |
|--------|------|
| Absent 休講が TRG レポートと不一致 | Note で区別、signoff #25 |
| Note フィールド権限 | Sandbox live + signoff |

## 参照

- [phase6-attendance-policy-spike.md](phase6-attendance-policy-spike.md)
- [`manaerp-attendance-map.ts`](../apps/extension/lib/manaerp-attendance-map.ts)
