import type { BoothGridSettings } from '../../lib/booth-session-state';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import { trgAttendanceToManaerpWrite } from '../../lib/manaerp-attendance-map';
import type {
  ImportBatch,
  ImportPlanRecord,
  LessonMasterCatalog,
  StudentSessionSourceRow,
  StudentSessionUpdatePlan,
  ValidationIssue,
} from '../contracts';
import { DEFAULT_DISCOVERY_CONFIG, SANDBOX_CONFIRMATION_PHRASE } from '../contracts';
import type { NormalizedLessonSession } from './manaerpLessonQueryService';

function rowHasContent(row: PrintSheetRow): boolean {
  return Boolean(row.studentName.trim());
}

function sessionKey(date: string, studentName: string): string {
  return `${date}|${studentName.trim()}`;
}

function buildValidationIssues(
  rows: PrintSheetRow[],
  settings: BoothGridSettings,
  catalog: LessonMasterCatalog | null,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!catalog) {
    issues.push({ severity: 'error', code: 'NO_CATALOG', message: '前提マスタが未同期です。' });
  }
  if (!settings.accountId.trim()) {
    issues.push({ severity: 'error', code: 'NO_ACCOUNT', message: 'コマ組設定の Account ID が未入力です。' });
  }
  if (!rows.length) {
    issues.push({ severity: 'error', code: 'NO_ROWS', message: '送信対象の PrintSheet 行がありません。' });
  }
  return issues;
}

export function buildStudentSessionUpdatePlan(input: {
  rows: PrintSheetRow[];
  sessions: NormalizedLessonSession[];
  settings: BoothGridSettings;
  catalog: LessonMasterCatalog | null;
  accountName?: string;
}): StudentSessionUpdatePlan {
  const { settings, catalog, sessions } = input;
  const rows = input.rows.filter(rowHasContent);
  const validationIssues = buildValidationIssues(rows, settings, catalog);
  const sessionFields = DEFAULT_DISCOVERY_CONFIG.fields.studentSession ?? {};
  const attendanceField = sessionFields.attendanceStatus ?? 'MANAERP__Attendance_Status__c';
  const attendanceNoteField = sessionFields.attendanceNote ?? 'MANAERP__Attendance_Note__c';
  const accountId = settings.accountId.trim();
  const accountName =
    input.accountName ??
    catalog?.catalogs.locations.find((loc) => loc.id === accountId)?.name ??
    settings.classroomName;

  const sessionMap = new Map<string, NormalizedLessonSession>();
  for (const session of sessions) {
    sessionMap.set(sessionKey(session.date, session.studentName), session);
  }

  const seen = new Set<string>();
  const sourceRows: StudentSessionSourceRow[] = [];
  const records: ImportPlanRecord[] = [];
  let matchedCount = 0;
  let skipCount = 0;

  for (const row of rows) {
    const studentName = row.studentName.trim();
    if (!studentName) continue;
    const key = sessionKey(row.date, studentName);
    if (seen.has(key)) continue;
    seen.add(key);

    const session = sessionMap.get(key);
    const boothAttendance = row.attendance ?? '';
    const attendanceWrite = trgAttendanceToManaerpWrite(boothAttendance);
    const sourceRow: StudentSessionSourceRow = {
      localSlotKey: row.slotKey,
      date: row.date,
      studentName,
      boothAttendance,
      sessionId: session?.sessionId,
      currentManaerpAttendance: session?.rawAttendance,
    };

    if (!session?.sessionId) {
      sourceRow.skipReason = 'Session未マッチ';
      skipCount += 1;
      validationIssues.push({
        severity: 'warning',
        code: 'SESSION_NOT_MATCHED',
        message: `${row.date} ${studentName}: Manabie Student Session が見つかりません（Lesson 未生成の可能性）。`,
      });
      sourceRows.push(sourceRow);
      continue;
    }

    matchedCount += 1;

    if (!attendanceWrite) {
      sourceRow.skipReason = '出欠未対応';
      skipCount += 1;
      if (boothAttendance && boothAttendance !== '未確定') {
        validationIssues.push({
          severity: 'warning',
          code: 'ATTENDANCE_NOT_MAPPED',
          message: `${row.date} ${studentName}: 「${boothAttendance}」は Manabie 書き込み対象外です（振替/未確定のみ）。`,
        });
      }
      sourceRows.push(sourceRow);
      continue;
    }

    sourceRow.manaerpAttendance = attendanceWrite.attendanceStatus;
    if (
      session.rawAttendance === attendanceWrite.attendanceStatus &&
      boothAttendance !== '休講'
    ) {
      sourceRow.skipReason = '変更なし';
      skipCount += 1;
      sourceRows.push(sourceRow);
      continue;
    }

    sourceRows.push(sourceRow);
    const fields: Record<string, unknown> = {
      Id: session.sessionId,
      [attendanceField]: attendanceWrite.attendanceStatus,
    };
    if (attendanceWrite.attendanceNote) {
      fields[attendanceNoteField] = attendanceWrite.attendanceNote;
    }
    records.push({
      localRef: `ss-${records.length}-${session.sessionId}`,
      salesforceId: session.sessionId,
      fields,
    });
  }

  const batch: ImportBatch = {
    batchId: 'batch-student-session',
    artifactKind: 'studentSession',
    sobjectApiName: DEFAULT_DISCOVERY_CONFIG.studentSessionObject!,
    operation: 'update',
    records,
  };

  return {
    planId: `student-session-${Date.now()}`,
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
    matchedCount,
    updateCount: records.length,
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
