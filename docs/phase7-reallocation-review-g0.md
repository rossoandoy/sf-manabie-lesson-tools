# Phase 7 Reallocation — Codex G0 Review

**Gate:** Part C 着手前  
**Date:** 2026-06-20  
**Verdict:** **Pass** — 狭義 Reallocation create のみ

## 採用スコープ

| 条件 | Action |
|------|--------|
| `attendance=振替` + `transferFrom` 設定 | Reallocation create 対象 |
| 元日 Session（transferFrom + 生徒名） | `Original_Student_Sessions__c` |
| 先日 Lesson（transferTo + lessonDayIndex） | `New_Lesson__c` / `New_Lesson_Date__c` |
| 同日複数 Lesson | `LESSON_AMBIGUOUS` スキップ |
| Schedule Gap 日（先日） | スキップ + warning |
| 振替先 Session 不在 | warning のみ（3B+ 別途） |

## 非包含（固定）

- 振替先 Student_Session 自動 create
- Reallocation update / delete
- `MANAERP__New_Student_Sessions__c` 必須化
- Production Execute
- Option C

## 参照

- [phase7-reallocation-spike.md](phase7-reallocation-spike.md)
- [`reallocationPlanBuilder.ts`](../apps/extension/src/services/reallocationPlanBuilder.ts)
