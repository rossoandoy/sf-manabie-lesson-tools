import type { BoothGridSettings } from '../../lib/booth-session-state';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import type {
  ImportBatch,
  ImportPlanRecord,
  LessonMasterCatalog,
  ReallocationPlan,
  ReallocationSourceRow,
  ValidationIssue,
} from '../contracts';
import { DEFAULT_DISCOVERY_CONFIG, SANDBOX_CONFIRMATION_PHRASE } from '../contracts';
import type { LessonDayIndex, NormalizedLessonSession } from './manaerpLessonQueryService';

const REALLOC_REASON = 'TRG booth transfer';
const REALLOC_STATUS_OPEN = 'Open';

function sessionKey(date: string, studentName: string): string {
  return `${date}|${studentName.trim()}`;
}

function isTransferRow(row: PrintSheetRow): boolean {
  return row.attendance === '振替' && Boolean(row.transferFrom?.trim());
}

function resolveLessonId(
  date: string,
  studentName: string,
  lessonDayIndex: LessonDayIndex,
): { lessonId: string | null; ambiguous: boolean } {
  const entries = lessonDayIndex.get(date) ?? [];
  if (!entries.length) return { lessonId: null, ambiguous: false };
  const candidates = entries.filter((entry) => !entry.studentNames.has(studentName));
  if (candidates.length === 1) return { lessonId: candidates[0]!.lessonId, ambiguous: false };
  if (entries.length === 1 && !entries[0]!.studentNames.has(studentName)) {
    return { lessonId: entries[0]!.lessonId, ambiguous: false };
  }
  if (candidates.length > 1) return { lessonId: null, ambiguous: true };
  return { lessonId: null, ambiguous: false };
}

export function buildReallocationPlan(input: {
  rows: PrintSheetRow[];
  sessions: NormalizedLessonSession[];
  lessonDayIndex: LessonDayIndex;
  settings: BoothGridSettings;
  catalog: LessonMasterCatalog | null;
  accountName?: string;
  daysMissingLessons?: string[];
}): ReallocationPlan {
  const { settings, catalog, sessions, lessonDayIndex } = input;
  const validationIssues: ValidationIssue[] = [];
  const accountId = settings.accountId.trim();
  const accountName =
    input.accountName ??
    catalog?.catalogs.locations.find((loc) => loc.id === accountId)?.name ??
    settings.classroomName;

  if (!catalog) {
    validationIssues.push({ severity: 'error', code: 'NO_CATALOG', message: '前提マスタが未同期です。' });
  }
  if (!accountId) {
    validationIssues.push({ severity: 'error', code: 'NO_ACCOUNT', message: 'コマ組設定の Account ID が未入力です。' });
  }

  const reallocFields = DEFAULT_DISCOVERY_CONFIG.fields.reallocation ?? {};
  const originalSessionField = reallocFields.originalSession ?? 'MANAERP__Original_Student_Sessions__c';
  const originalLessonField = reallocFields.originalLesson ?? 'MANAERP__Original_Lesson__c';
  const originalLessonDateField = reallocFields.originalLessonDate ?? 'MANAERP__Original_Lesson_Date__c';
  const newLessonField = reallocFields.newLesson ?? 'MANAERP__New_Lesson__c';
  const newLessonDateField = reallocFields.newLessonDate ?? 'MANAERP__New_Lesson_Date__c';
  const originalStudentNameField = reallocFields.originalStudentName ?? 'MANAERP__Original_Student_Name__c';
  const reallocateStatusField = reallocFields.reallocateStatus ?? 'MANAERP__Reallocate_Status__c';
  const reasonField = reallocFields.reason ?? 'MANAERP__Reason__c';

  const sessionMap = new Map<string, NormalizedLessonSession>();
  for (const session of sessions) {
    sessionMap.set(sessionKey(session.date, session.studentName), session);
  }

  const missingLessonDays = new Set(input.daysMissingLessons ?? []);
  const transferRows = input.rows.filter(isTransferRow);
  const seen = new Set<string>();
  const sourceRows: ReallocationSourceRow[] = [];
  const records: ImportPlanRecord[] = [];
  let skipCount = 0;

  for (const row of transferRows) {
    const studentName = row.studentName.trim();
    const transferFrom = row.transferFrom!.trim();
    const transferTo = (row.transferTo?.trim() || row.date).trim();
    const dedupeKey = `${transferFrom}|${transferTo}|${studentName}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const sourceRow: ReallocationSourceRow = {
      localSlotKey: row.slotKey,
      studentName,
      transferFrom,
      transferTo,
    };

    const originalSession = sessionMap.get(sessionKey(transferFrom, studentName));
    if (!originalSession?.sessionId) {
      sourceRow.skipReason = '元Session未マッチ';
      skipCount += 1;
      validationIssues.push({
        severity: 'warning',
        code: 'REALLOCATION_NO_ORIGINAL_SESSION',
        message: `${transferFrom} ${studentName}: 振替元の Manabie Session が見つかりません。`,
      });
      sourceRows.push(sourceRow);
      continue;
    }

    if (missingLessonDays.has(transferTo)) {
      sourceRow.skipReason = '先日Lesson未生成';
      skipCount += 1;
      validationIssues.push({
        severity: 'warning',
        code: 'SCHEDULE_GAP_NO_LESSON',
        message: `Manabie Lesson 未生成: ${transferTo} — 振替登録はスキップされます。`,
      });
      sourceRows.push(sourceRow);
      continue;
    }

    const { lessonId: newLessonId, ambiguous } = resolveLessonId(transferTo, studentName, lessonDayIndex);
    if (ambiguous) {
      sourceRow.skipReason = '先日Lesson曖昧';
      skipCount += 1;
      validationIssues.push({
        severity: 'warning',
        code: 'LESSON_AMBIGUOUS',
        message: `${transferTo} ${studentName}: 同日に複数 Lesson があり、振替先を自動解決できません。`,
      });
      sourceRows.push(sourceRow);
      continue;
    }
    if (!newLessonId) {
      sourceRow.skipReason = '先日Lesson未マッチ';
      skipCount += 1;
      validationIssues.push({
        severity: 'warning',
        code: 'LESSON_NOT_FOUND',
        message: `${transferTo} ${studentName}: 振替先の Manabie Lesson がありません。`,
      });
      sourceRows.push(sourceRow);
      continue;
    }

    sourceRow.originalSessionId = originalSession.sessionId;
    sourceRow.originalLessonId = originalSession.lessonId;
    sourceRow.newLessonId = newLessonId;
    sourceRows.push(sourceRow);

    records.push({
      localRef: `realloc-${records.length}-${originalSession.sessionId}-${newLessonId}`,
      fields: {
        [originalSessionField]: originalSession.sessionId,
        [originalLessonField]: originalSession.lessonId,
        [originalLessonDateField]: transferFrom,
        [newLessonField]: newLessonId,
        [newLessonDateField]: transferTo,
        [originalStudentNameField]: studentName,
        [reallocateStatusField]: REALLOC_STATUS_OPEN,
        [reasonField]: REALLOC_REASON,
      },
    });
  }

  const batch: ImportBatch = {
    batchId: 'batch-reallocation',
    artifactKind: 'reallocation',
    sobjectApiName: DEFAULT_DISCOVERY_CONFIG.reallocationObject!,
    operation: 'create',
    records,
  };

  return {
    planId: `reallocation-${Date.now()}`,
    createdAt: new Date().toISOString(),
    targetOrg: {
      orgId: catalog?.org.orgId ?? '',
      username: catalog?.org.username ?? '',
      instanceUrl: catalog?.org.instanceUrl,
      isSandbox: catalog?.org.isSandbox === true,
    },
    accountId,
    accountName,
    sourceRows,
    createCount: records.length,
    skipCount,
    batches: records.length ? [batch] : [],
    executionPolicy: {
      confirmationPhrase: SANDBOX_CONFIRMATION_PHRASE,
      productionWrites: 'blocked',
      blockIfPlaceholdersRemain: true,
    },
    validationIssues,
  };
}
