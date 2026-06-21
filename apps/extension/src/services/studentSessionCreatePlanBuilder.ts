import type { BoothGridSettings } from '../../lib/booth-session-state';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import { trgAttendanceToManaerpWrite } from '../../lib/manaerp-attendance-map';
import type {
  ImportBatch,
  ImportPlanRecord,
  LessonMasterCatalog,
  StudentSessionCreatePlan,
  StudentSessionSourceRow,
  ValidationIssue,
} from '../contracts';
import { DEFAULT_DISCOVERY_CONFIG, SANDBOX_CONFIRMATION_PHRASE } from '../contracts';
import type { LessonDayIndex, NormalizedLessonSession } from './manaerpLessonQueryService';

function rowHasContent(row: PrintSheetRow): boolean {
  return Boolean(row.studentName.trim());
}

function sessionKey(date: string, studentName: string): string {
  return `${date}|${studentName.trim()}`;
}

function resolveStudentId(catalog: LessonMasterCatalog | null, studentName: string): string | undefined {
  return catalog?.catalogs.students.find((student) => student.name.trim() === studentName.trim())?.id;
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

export function buildStudentSessionCreatePlan(input: {
  rows: PrintSheetRow[];
  sessions: NormalizedLessonSession[];
  lessonDayIndex: LessonDayIndex;
  settings: BoothGridSettings;
  catalog: LessonMasterCatalog | null;
  accountName?: string;
  daysMissingLessons?: string[];
}): StudentSessionCreatePlan {
  const { settings, catalog, sessions, lessonDayIndex } = input;
  const rows = input.rows.filter(rowHasContent);
  const missingLessonDays = new Set(input.daysMissingLessons ?? []);
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

  const sessionFields = DEFAULT_DISCOVERY_CONFIG.fields.studentSession ?? {};
  const lessonField = sessionFields.lesson ?? 'MANAERP__Lesson__c';
  const studentField = sessionFields.student ?? 'MANAERP__Student__c';
  const studentNameField = sessionFields.studentName ?? 'MANAERP__Student_Name__c';
  const attendanceField = sessionFields.attendanceStatus ?? 'MANAERP__Attendance_Status__c';
  const attendanceNoteField = sessionFields.attendanceNote ?? 'MANAERP__Attendance_Note__c';

  const sessionMap = new Map<string, NormalizedLessonSession>();
  for (const session of sessions) {
    sessionMap.set(sessionKey(session.date, session.studentName), session);
  }

  const seen = new Set<string>();
  const sourceRows: StudentSessionSourceRow[] = [];
  const records: ImportPlanRecord[] = [];
  let skipCount = 0;

  for (const row of rows) {
    const studentName = row.studentName.trim();
    if (!studentName) continue;
    const key = sessionKey(row.date, studentName);
    if (seen.has(key)) continue;
    seen.add(key);

    const boothAttendance = row.attendance ?? '';
    const attendanceWrite = trgAttendanceToManaerpWrite(boothAttendance);
    const sourceRow: StudentSessionSourceRow = {
      localSlotKey: row.slotKey,
      date: row.date,
      studentName,
      boothAttendance,
    };

    if (sessionMap.get(key)?.sessionId) {
      sourceRow.skipReason = 'Session既存';
      skipCount += 1;
      sourceRows.push(sourceRow);
      continue;
    }

    if (missingLessonDays.has(row.date)) {
      sourceRow.skipReason = 'Lesson未生成';
      skipCount += 1;
      sourceRows.push(sourceRow);
      continue;
    }

    if (!attendanceWrite) {
      sourceRow.skipReason = '出欠未対応';
      skipCount += 1;
      sourceRows.push(sourceRow);
      continue;
    }

    const { lessonId, ambiguous } = resolveLessonId(row.date, studentName, lessonDayIndex);
    if (ambiguous) {
      sourceRow.skipReason = 'Lesson曖昧';
      skipCount += 1;
      validationIssues.push({
        severity: 'warning',
        code: 'LESSON_AMBIGUOUS',
        message: `${row.date} ${studentName}: 同日に複数 Lesson があり、自動作成できません。`,
      });
      sourceRows.push(sourceRow);
      continue;
    }
    if (!lessonId) {
      sourceRow.skipReason = 'Lesson未マッチ';
      skipCount += 1;
      validationIssues.push({
        severity: 'warning',
        code: 'LESSON_NOT_FOUND',
        message: `${row.date} ${studentName}: 紐づけ可能な Manabie Lesson がありません。`,
      });
      sourceRows.push(sourceRow);
      continue;
    }

    const studentId = resolveStudentId(catalog, studentName);
    if (!studentId) {
      sourceRow.skipReason = '生徒未解決';
      skipCount += 1;
      validationIssues.push({
        severity: 'warning',
        code: 'STUDENT_NOT_RESOLVED',
        message: `${row.date} ${studentName}: マスタに生徒 ID がありません。`,
      });
      sourceRows.push(sourceRow);
      continue;
    }

    sourceRow.manaerpAttendance = attendanceWrite.attendanceStatus;
    sourceRows.push(sourceRow);
    const fields: Record<string, unknown> = {
      [lessonField]: lessonId,
      [studentField]: studentId,
      [studentNameField]: studentName,
      [attendanceField]: attendanceWrite.attendanceStatus,
    };
    if (attendanceWrite.attendanceNote) {
      fields[attendanceNoteField] = attendanceWrite.attendanceNote;
    }
    records.push({
      localRef: `ss-create-${records.length}-${lessonId}-${studentId}`,
      fields,
    });
  }

  const batch: ImportBatch = {
    batchId: 'batch-student-session-create',
    artifactKind: 'studentSessionCreate',
    sobjectApiName: DEFAULT_DISCOVERY_CONFIG.studentSessionObject!,
    operation: 'create',
    records,
  };

  return {
    planId: `student-session-create-${Date.now()}`,
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
