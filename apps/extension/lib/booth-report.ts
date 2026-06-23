import type { InvoiceCacheEntry } from './invoice-cache-state';
import { lookupTranBilling, priorTranBilling } from './invoice-cache-state';
import type { LessonActivityRecord, LessonActivitySource } from './lesson-activity-source';
import type { SeatCapacity } from './booth-print-sheet';
import { parseDateKey, schoolYearFromDate } from './calendar-utils';

export interface ReportMonthMetrics {
  planned: number;
  present: number;
  absent: number;
  makeup: number;
  executed: number;
}

export interface ReportBillingMetrics {
  billing: number;
  paid: number;
}

export interface ReportTableRow {
  id: string;
  label: string;
  leftItem: string;
  monthKey?: string;
  kind: 'priorYearEnd' | 'month' | 'yearEnd' | 'grandTotal';
  right: ReportMonthMetrics;
  left: ReportBillingMetrics;
}

export interface MonthlyReportResult {
  fiscalYear: number;
  studentName: string;
  contract: SeatCapacity;
  generatedAt: string;
  rows: ReportTableRow[];
}

export interface BuildMonthlyReportOptions {
  billing?: InvoiceCacheEntry[];
  closedDates?: Set<string>;
  contactId?: string;
}

const MONTH_LABELS = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月'];

function fiscalYearNumber(input: string | number | undefined, fallbackDate?: string): number {
  if (typeof input === 'number' && Number.isFinite(input)) return input;
  if (typeof input === 'string' && input.trim()) {
    const parsed = Number(input.trim());
    if (Number.isFinite(parsed)) return parsed;
  }
  if (fallbackDate) return schoolYearFromDate(fallbackDate);
  return schoolYearFromDate(new Date().toISOString().slice(0, 10));
}

function monthCalendarNumber(index: number): number {
  return ((3 + index) % 12) + 1;
}

function monthYear(fiscalYear: number, calendarMonth: number): number {
  return calendarMonth >= 4 ? fiscalYear : fiscalYear + 1;
}

function monthRange(fiscalYear: number, calendarMonth: number): { from: string; to: string; key: string } {
  const year = monthYear(fiscalYear, calendarMonth);
  const from = `${year}-${String(calendarMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(year, calendarMonth, 0).getDate();
  const to = `${year}-${String(calendarMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  const key = `${year}/${String(calendarMonth).padStart(2, '0')}`;
  return { from, to, key };
}

function fiscalYearStartDate(fiscalYear: number): string {
  return `${fiscalYear}-04-01`;
}

function isPlannedAttendance(attendance: LessonActivityRecord['attendance']): boolean {
  return !attendance || attendance === '未確定';
}

function isTrialLesson(record: LessonActivityRecord): boolean {
  return record.lessonKind === '体験';
}

function countMetrics(records: LessonActivityRecord[], closedDates?: Set<string>): ReportMonthMetrics {
  let planned = 0;
  let present = 0;
  let absent = 0;
  let makeup = 0;

  for (const record of records) {
    if (record.attendance === '休講') continue;
    if (closedDates?.has(record.date)) continue;
    if (isTrialLesson(record)) continue;

    if (record.attendance === '振替') {
      makeup += 1;
      continue;
    }

    if (!record.countTarget) continue;

    if (isPlannedAttendance(record.attendance)) planned += 1;
    else if (record.attendance === '出席') present += 1;
    else if (record.attendance === '欠席') absent += 1;
  }

  return {
    planned,
    present,
    absent,
    makeup,
    executed: present + makeup,
  };
}

function sumMetrics(rows: ReportMonthMetrics[]): ReportMonthMetrics {
  return rows.reduce(
    (acc, row) => ({
      planned: acc.planned + row.planned,
      present: acc.present + row.present,
      absent: acc.absent + row.absent,
      makeup: acc.makeup + row.makeup,
      executed: acc.executed + row.executed,
    }),
    { planned: 0, present: 0, absent: 0, makeup: 0, executed: 0 },
  );
}

function sumBilling(rows: ReportBillingMetrics[]): ReportBillingMetrics {
  return rows.reduce(
    (acc, row) => ({
      billing: acc.billing + row.billing,
      paid: acc.paid + row.paid,
    }),
    { billing: 0, paid: 0 },
  );
}

export function determineContract(source: LessonActivitySource, studentName: string): SeatCapacity {
  let c11 = 0;
  let c12 = 0;
  for (const activity of source.listActivities({ studentName })) {
    if (activity.lessonKind === '体験') continue;
    if (activity.capacity === '1:1') c11 += 1;
    else c12 += 1;
  }
  return c11 > c12 ? '1:1' : '1:2';
}

export function buildMonthlyReport(
  source: LessonActivitySource,
  studentName: string,
  fiscalYearInput?: string | number,
  options: BuildMonthlyReportOptions = {},
): MonthlyReportResult {
  const trimmed = studentName.trim();
  const billing = options.billing ?? [];
  const closedDates = options.closedDates;
  const contactId = options.contactId?.trim();
  const sampleDate = source.listActivities({ studentName: trimmed })[0]?.date;
  const fiscalYear = fiscalYearNumber(fiscalYearInput, sampleDate);
  const fyStartKey = `${fiscalYear}/04`;
  const fyStart = fiscalYearStartDate(fiscalYear);
  const priorEndDate = parseDateKey(fyStart);
  priorEndDate.setDate(priorEndDate.getDate() - 1);
  const priorEnd = priorEndDate.toISOString().slice(0, 10);

  const priorRecords = source.listActivities({
    studentName: trimmed,
    dateTo: priorEnd,
  });
  const priorMetrics = countMetrics(priorRecords, closedDates);
  const priorLeft = priorTranBilling(billing, trimmed, fyStartKey, contactId);

  const monthRows: ReportTableRow[] = [];
  const monthMetrics: ReportMonthMetrics[] = [];
  const monthBillingRows: ReportBillingMetrics[] = [];

  for (let i = 0; i < 12; i += 1) {
    const calendarMonth = monthCalendarNumber(i);
    const { from, to, key } = monthRange(fiscalYear, calendarMonth);
    const metrics = countMetrics(
      source.listActivities({ studentName: trimmed, dateFrom: from, dateTo: to }),
      closedDates,
    );
    const left = lookupTranBilling(billing, trimmed, key, contactId);
    monthMetrics.push(metrics);
    monthBillingRows.push(left);
    monthRows.push({
      id: `month-${i}`,
      label: key,
      leftItem: '通常月講',
      monthKey: key,
      kind: 'month',
      right: metrics,
      left,
    });
  }

  const yearEnd = sumMetrics(monthMetrics);
  const yearEndBilling = sumBilling(monthBillingRows);
  const grandRight = sumMetrics([priorMetrics, yearEnd]);
  const grandLeft = sumBilling([priorLeft, yearEndBilling]);

  const rows: ReportTableRow[] = [
    {
      id: 'prior-year-end',
      label: '前年度末 合計',
      leftItem: '授業合計',
      kind: 'priorYearEnd',
      right: priorMetrics,
      left: priorLeft,
    },
    ...monthRows,
    {
      id: 'year-end',
      label: '今年度末 合計',
      leftItem: '授業合計',
      kind: 'yearEnd',
      right: yearEnd,
      left: yearEndBilling,
    },
    {
      id: 'grand-total',
      label: '予実 総合計',
      leftItem: '授業合計',
      kind: 'grandTotal',
      right: grandRight,
      left: grandLeft,
    },
  ];

  return {
    fiscalYear,
    studentName: trimmed,
    contract: determineContract(source, trimmed),
    generatedAt: new Date().toISOString(),
    rows,
  };
}

export function monthlyReportToCsv(report: MonthlyReportResult): string {
  const header = [
    '行',
    '左_項目',
    '請求中',
    '支払済',
    '月',
    '予定',
    '出席',
    '欠席',
    '振替',
    '実施',
  ].join(',');
  const lines = report.rows.map((row) =>
    [
      row.label,
      row.leftItem,
      row.left.billing || '',
      row.left.paid || '',
      row.monthKey ?? row.label,
      row.right.planned,
      row.right.present,
      row.right.absent,
      row.right.makeup,
      row.right.executed,
    ].join(','),
  );
  return [header, ...lines].join('\n');
}

export function fiscalMonthDisplayNames(): string[] {
  return [...MONTH_LABELS];
}
