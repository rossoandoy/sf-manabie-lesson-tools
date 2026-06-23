# Phase 5 Session Create — Codex G0 Review

**Gate:** Part C 着手前 read-only スコープ固定  
**Date:** 2026-06-20  
**Verdict:** **Pass** — narrow create scope approved; Option C excluded

## Scope under review

| Condition | Action |
|-----------|--------|
| Manabie Lesson **exists** for date | Eligible for create lookup |
| Student_Session **missing** for date + student | **Create** batch |
| Booth attendance = 出席 or 欠席 | Map to Manabie attendance on create |
| Booth attendance = 振替 / 休講 / 未確定 | Skip (unchanged from 3B) |
| Schedule Gap day (Lesson missing) | Skip create; 3D warning only |
| Same day, multiple Lessons, ambiguous match | Skip with `LESSON_AMBIGUOUS` |
| Student not in master catalog | Skip with `STUDENT_NOT_RESOLVED` |
| Session already exists | Skip; proceed to 3B update |

## Explicitly out of scope (Option C)

- Manabie **Lesson** create from booth grid
- Booth aggregation → Lesson mapping redesign
- Schedule auto-generation from booth
- 振替/休講 → Manabie write
- Production Execute (blocked by `production-guard`)

## Create / update split

```text
PrintSheet row
  ├─ Session exists → studentSessionUpdatePlanBuilder (3B update)
  └─ Session missing + Lesson resolved → studentSessionCreatePlanBuilder (3B+ create)
       └─ After create → rebuild plans → 3B update on next Execute
```

## UX placement

Sync Dock (PrintSheet tab): **Manabie Session 作成（3B+）** section appears when create candidates exist, above **Manabie 出欠同期（3B）**. Both use `confirmSandboxExecute` modal.

## Risks accepted

| Risk | Mitigation |
|------|------------|
| Org permission denies Student_Session create | Sandbox signoff + optional live test |
| Ambiguous same-day Lessons | Warning + manual resolution in Manabie UI |
| Create then immediate update race | `onStudentSessionCreateExecuted` rebuilds slot plan |

## Implementation reference

- [`studentSessionCreatePlanBuilder.ts`](../apps/extension/src/services/studentSessionCreatePlanBuilder.ts)
- [`registrationExecutor.ts`](../apps/extension/src/services/registrationExecutor.ts) — generic `create` batch
- [`slot-sync-panel.ts`](../apps/extension/dashboard/components/slot-sync-panel.ts) — UI + Execute wiring
