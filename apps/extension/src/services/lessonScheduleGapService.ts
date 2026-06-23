import type { BoothCell } from '../../lib/booth-session-state';
import type {
  LessonDiscoveryConfig,
  SalesforceApiClient,
  StudentSessionUpdatePlan,
  ValidationIssue,
} from '../contracts';
import { DEFAULT_DISCOVERY_CONFIG } from '../contracts';

export interface ScheduleGapReport {
  dateFrom: string;
  dateTo: string;
  daysWithBoothStudents: string[];
  daysMissingLessons: string[];
  scheduleCountInRange: number;
  lessonCountInRange: number;
  sessionMatchRate?: number;
  warnings: ValidationIssue[];
}

export interface ScheduleGapQueryOptions {
  accountId: string;
  dateFrom: string;
  dateTo: string;
  daysWithBoothStudents: string[];
  config?: LessonDiscoveryConfig;
  studentSessionPlan?: StudentSessionUpdatePlan | null;
}

const MATCH_RATE_THRESHOLD = 0.5;

function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function resolveLessonFields(config?: LessonDiscoveryConfig) {
  const merged = config ?? DEFAULT_DISCOVERY_CONFIG;
  return {
    lessonObject: merged.lessonObject ?? DEFAULT_DISCOVERY_CONFIG.lessonObject!,
    lessonScheduleObject: merged.lessonScheduleObject ?? DEFAULT_DISCOVERY_CONFIG.lessonScheduleObject,
    lesson: { ...DEFAULT_DISCOVERY_CONFIG.fields.lesson, ...merged.fields.lesson },
    lessonSchedule: { ...DEFAULT_DISCOVERY_CONFIG.fields.lessonSchedule, ...merged.fields.lessonSchedule },
  };
}

export function collectBoothActiveDays(cells: BoothCell[], scopeDates?: string[]): string[] {
  const scope = scopeDates?.length ? new Set(scopeDates) : null;
  const days = new Set<string>();
  for (const cell of cells) {
    if (!cell.studentName.trim()) continue;
    if (scope && !scope.has(cell.date)) continue;
    days.add(cell.date);
  }
  return [...days].sort();
}

export function buildLessonDatesQuerySoql(options: {
  accountId: string;
  dateFrom: string;
  dateTo: string;
  config?: LessonDiscoveryConfig;
}): string {
  const cfg = resolveLessonFields(options.config);
  const lessonFields = cfg.lesson;
  let soql =
    `SELECT Id, ${lessonFields.lessonDate} FROM ${cfg.lessonObject} ` +
    `WHERE ${lessonFields.lessonDate} >= ${options.dateFrom} ` +
    `AND ${lessonFields.lessonDate} <= ${options.dateTo}`;
  const accountId = options.accountId.trim();
  if (accountId && lessonFields.scheduleAccount) {
    soql += ` AND ${lessonFields.scheduleAccount} = '${escapeSoql(accountId)}'`;
  }
  return soql;
}

export function buildLessonScheduleOverlapQuerySoql(options: {
  accountId: string;
  dateFrom: string;
  dateTo: string;
  config?: LessonDiscoveryConfig;
}): string {
  const cfg = resolveLessonFields(options.config);
  const scheduleFields = cfg.lessonSchedule;
  const accountId = escapeSoql(options.accountId.trim());
  return (
    `SELECT Id FROM ${cfg.lessonScheduleObject} ` +
    `WHERE ${scheduleFields.location} = '${accountId}' ` +
    `AND ${scheduleFields.startDateTime} <= ${options.dateTo}T23:59:59.000Z ` +
    `AND ${scheduleFields.endDateTime} >= ${options.dateFrom}T00:00:00.000Z`
  );
}

function uniqueStudentDayCount(plan: StudentSessionUpdatePlan | null | undefined): number {
  if (!plan) return 0;
  const keys = new Set<string>();
  for (const row of plan.sourceRows) {
    if (!row.studentName.trim()) continue;
    keys.add(`${row.date}|${row.studentName.trim()}`);
  }
  return keys.size;
}

export function computeScheduleGapReport(input: {
  dateFrom: string;
  dateTo: string;
  daysWithBoothStudents: string[];
  lessonDates: string[];
  scheduleCountInRange: number;
  lessonCountInRange: number;
  studentSessionPlan?: StudentSessionUpdatePlan | null;
}): ScheduleGapReport {
  const lessonDateSet = new Set(input.lessonDates);
  const daysMissingLessons = input.daysWithBoothStudents.filter((day) => !lessonDateSet.has(day));
  const warnings: ValidationIssue[] = [];

  if (daysMissingLessons.length) {
    const listed = daysMissingLessons.slice(0, 5).join(', ');
    const suffix = daysMissingLessons.length > 5 ? ` …他 ${daysMissingLessons.length - 5} 日` : '';
    warnings.push({
      severity: 'warning',
      code: 'SCHEDULE_GAP_NO_LESSON',
      message: `Manabie Lesson 未生成: ${listed}${suffix} — 出欠同期（3B）はスキップされます。`,
    });
  }

  if (input.scheduleCountInRange > 0 && input.lessonCountInRange === 0) {
    warnings.push({
      severity: 'warning',
      code: 'SCHEDULE_WITHOUT_LESSON',
      message: `Lesson Schedule は ${input.scheduleCountInRange} 件ありますが、週内の Lesson が 0 件です。`,
    });
  }

  let sessionMatchRate: number | undefined;
  const targetDays = uniqueStudentDayCount(input.studentSessionPlan);
  if (input.studentSessionPlan && targetDays > 0) {
    sessionMatchRate = input.studentSessionPlan.matchedCount / targetDays;
    if (sessionMatchRate < MATCH_RATE_THRESHOLD) {
      warnings.push({
        severity: 'warning',
        code: 'SESSION_MATCH_RATE_LOW',
        message: `Student Session マッチ率 ${Math.round(sessionMatchRate * 100)}%（${input.studentSessionPlan.matchedCount}/${targetDays}）— 手動確認してください。`,
      });
    }
  }

  return {
    dateFrom: input.dateFrom,
    dateTo: input.dateTo,
    daysWithBoothStudents: input.daysWithBoothStudents,
    daysMissingLessons,
    scheduleCountInRange: input.scheduleCountInRange,
    lessonCountInRange: input.lessonCountInRange,
    sessionMatchRate,
    warnings,
  };
}

export async function queryScheduleGapReport(
  api: SalesforceApiClient,
  options: ScheduleGapQueryOptions,
): Promise<ScheduleGapReport> {
  const accountId = options.accountId.trim();
  if (!accountId) {
    return computeScheduleGapReport({
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      daysWithBoothStudents: options.daysWithBoothStudents,
      lessonDates: [],
      scheduleCountInRange: 0,
      lessonCountInRange: 0,
      studentSessionPlan: options.studentSessionPlan,
    });
  }

  const lessonSoql = buildLessonDatesQuerySoql({
    accountId,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    config: options.config,
  });
  const scheduleSoql = buildLessonScheduleOverlapQuerySoql({
    accountId,
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    config: options.config,
  });
  const cfg = resolveLessonFields(options.config);
  const lessonDateField = cfg.lesson.lessonDate ?? 'MANAERP__Lesson_Date__c';

  const [{ records: lessonRecords }, { records: scheduleRecords }] = await Promise.all([
    api.query<Record<string, unknown>>(lessonSoql),
    api.query<Record<string, unknown>>(scheduleSoql),
  ]);

  const lessonDates = [
    ...new Set(
      lessonRecords
        .map((record) => String(record[lessonDateField] ?? '').trim())
        .filter(Boolean),
    ),
  ];

  return computeScheduleGapReport({
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    daysWithBoothStudents: options.daysWithBoothStudents,
    lessonDates,
    scheduleCountInRange: scheduleRecords.length,
    lessonCountInRange: lessonRecords.length,
    studentSessionPlan: options.studentSessionPlan,
  });
}

export function formatScheduleGapBannerText(report: ScheduleGapReport | null | undefined): string {
  if (!report?.warnings.length) return '';
  return report.warnings.map((warning) => warning.message).join(' ');
}

export function renderScheduleGapBannerHtml(report: ScheduleGapReport | null | undefined): string {
  if (!report?.warnings.length) return '';
  const items = report.warnings.map((warning) => `<li>${warning.message}</li>`).join('');
  return `<div class="schedule-gap-banner warning"><strong>Manabie Schedule 警告</strong><ul>${items}</ul></div>`;
}
