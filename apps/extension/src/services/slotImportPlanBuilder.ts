import type { BoothGridSettings } from '../../lib/booth-session-state';
import {
  attendanceForSf,
  buildSfSlotKey,
  capacityLabelForSf,
  type PrintSheetRow,
} from '../../lib/booth-print-sheet';
import type {
  ImportBatch,
  ImportPlanRecord,
  LessonMasterCatalog,
  LessonSlotImportPlan,
  LessonSlotSourceRow,
  ValidationIssue,
} from '../contracts';
import { DEFAULT_DISCOVERY_CONFIG, SANDBOX_CONFIRMATION_PHRASE } from '../contracts';

function rowHasContent(row: PrintSheetRow): boolean {
  return Boolean(row.studentName.trim() || row.subject.trim());
}

function toSourceRow(row: PrintSheetRow): LessonSlotSourceRow {
  return {
    localSlotKey: row.slotKey,
    date: row.date,
    booth: row.booth,
    period: row.period,
    seat: row.seat,
    studentName: row.studentName,
    subject: row.subject,
    grade: row.grade,
    teacherName: row.teacherName,
    lessonKind: row.lessonKind,
    studentType: row.studentType,
    attendance: row.attendance,
    countTarget: row.countTarget,
  };
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
  for (const row of rows) {
    if (!row.studentName.trim()) {
      issues.push({
        severity: 'warning',
        code: 'EMPTY_STUDENT',
        message: `${row.date} B${row.booth} P${row.period} S${row.seat}: 生徒名が空です。`,
      });
    }
  }
  return issues;
}

export function buildLessonSlotImportPlan(input: {
  rows: PrintSheetRow[];
  settings: BoothGridSettings;
  catalog: LessonMasterCatalog | null;
  accountName?: string;
}): LessonSlotImportPlan {
  const { settings, catalog } = input;
  const rows = input.rows.filter(rowHasContent);
  const validationIssues = buildValidationIssues(rows, settings, catalog);
  const fields = DEFAULT_DISCOVERY_CONFIG.fields.lessonSlot;
  const accountId = settings.accountId.trim();
  const accountName =
    input.accountName ??
    catalog?.catalogs.locations.find((loc) => loc.id === accountId)?.name ??
    settings.classroomName;

  const records: ImportPlanRecord[] = rows.map((row, index) => {
    const slotKey = buildSfSlotKey(accountId, row.date, row.period, row.booth, row.studentName.trim());
    const attendance = attendanceForSf(row.attendance);
    const recordFields: Record<string, unknown> = {
      [fields.slotKey]: slotKey,
      [fields.account]: accountId,
      [fields.date]: row.date,
      [fields.period]: row.period,
      [fields.booth]: row.booth,
      [fields.studentName]: row.studentName.trim(),
      [fields.subject]: row.subject.trim(),
      [fields.capacity]: capacityLabelForSf(settings.oneToOneMode),
      [fields.countTarget]: row.countTarget ?? true,
    };
    if (row.grade.trim()) recordFields[fields.grade] = row.grade.trim();
    if (row.teacherName.trim()) recordFields[fields.teacherName] = row.teacherName.trim();
    if (row.lessonKind) recordFields[fields.lessonKind] = row.lessonKind;
    if (row.studentType) recordFields[fields.studentType] = row.studentType;
    if (attendance) recordFields[fields.attendance] = attendance;
    return {
      localRef: `slot-${index}-${slotKey}`,
      fields: recordFields,
    };
  });

  const batch: ImportBatch = {
    batchId: 'batch-lesson-slot',
    artifactKind: 'lessonSlot',
    sobjectApiName: DEFAULT_DISCOVERY_CONFIG.lessonSlotObject,
    operation: 'upsert',
    externalIdField: fields.slotKey,
    records,
  };

  return {
    planId: `lesson-slot-${Date.now()}`,
    createdAt: new Date().toISOString(),
    targetOrg: {
      orgId: catalog?.org.orgId ?? '',
      username: catalog?.org.username ?? '',
      instanceUrl: catalog?.org.instanceUrl,
      isSandbox: catalog?.org.isSandbox === true,
    },
    accountId,
    accountName,
    sourceRows: rows.map(toSourceRow),
    batches: [batch],
    executionPolicy: {
      confirmationPhrase: SANDBOX_CONFIRMATION_PHRASE,
      productionWrites: 'blocked',
      blockIfPlaceholdersRemain: true,
    },
    validationIssues,
  };
}
