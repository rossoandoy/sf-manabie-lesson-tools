import type { LessonDiscoveryConfig, SalesforceApiClient } from '../contracts';
import { DEFAULT_DISCOVERY_CONFIG } from '../contracts';
import type { AttendanceStatus } from '../../lib/booth-attendance';
import { manaerpAttendanceToTrg } from '../../lib/manaerp-attendance-map';
import type { SeatCapacity } from '../../lib/booth-print-sheet';
import type { LessonKind } from '../../lib/booth-session-state';

export interface NormalizedLessonSession {
  lessonId: string;
  sessionId: string;
  date: string;
  studentName: string;
  attendance: AttendanceStatus | '';
  countTarget: boolean;
  capacity: SeatCapacity;
  lessonKind?: LessonKind;
  subject?: string;
  rawAttendance?: string;
}

export interface LessonDayEntry {
  lessonId: string;
  studentNames: Set<string>;
}

export type LessonDayIndex = Map<string, LessonDayEntry[]>;

export interface ManaerpLessonQueryOptions {
  accountId?: string;
  dateFrom: string;
  dateTo: string;
  config?: LessonDiscoveryConfig;
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function resolveConfig(config?: LessonDiscoveryConfig): Required<
  Pick<LessonDiscoveryConfig, 'lessonObject' | 'studentSessionObject' | 'fields'>
> {
  const merged = config ?? DEFAULT_DISCOVERY_CONFIG;
  return {
    lessonObject: merged.lessonObject ?? DEFAULT_DISCOVERY_CONFIG.lessonObject!,
    studentSessionObject: merged.studentSessionObject ?? DEFAULT_DISCOVERY_CONFIG.studentSessionObject!,
    fields: {
      ...DEFAULT_DISCOVERY_CONFIG.fields,
      ...merged.fields,
      lesson: { ...DEFAULT_DISCOVERY_CONFIG.fields.lesson, ...merged.fields.lesson },
      studentSession: {
        ...DEFAULT_DISCOVERY_CONFIG.fields.studentSession,
        ...merged.fields.studentSession,
      },
    },
  };
}

export function buildManaerpLessonQuerySoql(options: ManaerpLessonQueryOptions): string {
  const cfg = resolveConfig(options.config);
  const lessonFields = cfg.fields.lesson ?? DEFAULT_DISCOVERY_CONFIG.fields.lesson!;
  const sessionFields = cfg.fields.studentSession ?? DEFAULT_DISCOVERY_CONFIG.fields.studentSession!;
  const rel = sessionFields.studentSessionsRel ?? 'MANAERP__Student_Sessions__r';

  let soql =
    `SELECT Id, ${lessonFields.lessonDate}, ${lessonFields.capacity}, ${lessonFields.subjectName}, ` +
    `(SELECT Id, ${sessionFields.studentName}, ${sessionFields.attendanceStatus} FROM ${rel}) ` +
    `FROM ${cfg.lessonObject} ` +
    `WHERE ${lessonFields.lessonDate} >= ${options.dateFrom} ` +
    `AND ${lessonFields.lessonDate} <= ${options.dateTo}`;

  const accountId = options.accountId?.trim();
  if (accountId && lessonFields.scheduleAccount) {
    soql += ` AND ${lessonFields.scheduleAccount} = '${escapeSoql(accountId)}'`;
  }
  soql += ` ORDER BY ${lessonFields.lessonDate} ASC`;
  return soql;
}

function inferCapacity(capacity: unknown): SeatCapacity {
  const numeric = typeof capacity === 'number' ? capacity : Number(capacity);
  if (Number.isFinite(numeric) && numeric <= 1) return '1:1';
  return '1:2';
}

export function mapManaerpLessonRecords(
  records: Record<string, unknown>[],
  config?: LessonDiscoveryConfig,
): NormalizedLessonSession[] {
  return parseManaerpLessonQuery(records, config).sessions;
}

export function buildLessonDayIndex(records: Record<string, unknown>[], config?: LessonDiscoveryConfig): LessonDayIndex {
  return parseManaerpLessonQuery(records, config).lessonDayIndex;
}

export function parseManaerpLessonQuery(
  records: Record<string, unknown>[],
  config?: LessonDiscoveryConfig,
): { sessions: NormalizedLessonSession[]; lessonDayIndex: LessonDayIndex } {
  const cfg = resolveConfig(config);
  const lessonFields = cfg.fields.lesson ?? DEFAULT_DISCOVERY_CONFIG.fields.lesson!;
  const sessionFields = cfg.fields.studentSession ?? DEFAULT_DISCOVERY_CONFIG.fields.studentSession!;
  const rel = sessionFields.studentSessionsRel ?? 'MANAERP__Student_Sessions__r';
  const normalized: NormalizedLessonSession[] = [];
  const lessonDayIndex: LessonDayIndex = new Map();

  for (const lesson of records) {
    const lessonId = String(lesson.Id ?? '');
    const date = String(lesson[lessonFields.lessonDate!] ?? '');
    if (!lessonId || !date) continue;
    const capacity = inferCapacity(lesson[lessonFields.capacity!]);
    const subject = String(lesson[lessonFields.subjectName!] ?? '').trim() || undefined;
    const child = lesson[rel];
    const childRecords =
      child && typeof child === 'object'
        ? ((child as { records?: unknown[] }).records ?? [])
        : [];

    const studentNames = new Set<string>();
    for (const row of childRecords) {
      if (!row || typeof row !== 'object') continue;
      const session = row as Record<string, unknown>;
      const studentName = String(session[sessionFields.studentName!] ?? '').trim();
      if (!studentName) continue;
      studentNames.add(studentName);
      const rawAttendance = String(session[sessionFields.attendanceStatus!] ?? '');
      const attendance = manaerpAttendanceToTrg(rawAttendance);
      normalized.push({
        lessonId,
        sessionId: String(session.Id ?? ''),
        date,
        studentName,
        attendance,
        countTarget: attendance !== '振替',
        capacity,
        lessonKind: subject === '体験' ? '体験' : '通常',
        subject,
        rawAttendance,
      });
    }

    const dayEntries = lessonDayIndex.get(date) ?? [];
    dayEntries.push({ lessonId, studentNames });
    lessonDayIndex.set(date, dayEntries);
  }

  return { sessions: normalized, lessonDayIndex };
}

export async function queryManaerpLessonSessions(
  api: SalesforceApiClient,
  options: ManaerpLessonQueryOptions,
): Promise<NormalizedLessonSession[]> {
  const soql = buildManaerpLessonQuerySoql(options);
  const { records } = await api.query<Record<string, unknown>>(soql);
  return mapManaerpLessonRecords(records, options.config);
}
