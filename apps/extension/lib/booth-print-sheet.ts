import { defaultAttendance } from './booth-attendance';
import type { AttendanceStatus, BoothSlotMeta, LessonKind, StudentType } from './booth-session-state';
import type { BoothCell, BoothGridSettings, BoothGridSession, BoothSlotMeta, BoothSlotRef } from './booth-session-state';
import { cellKey, slotRefKey, visiblePeriodNumbers } from './booth-session-state';
import { syncStatusLabel, type SlotSyncEntry } from './slot-sync-state';
import {
  renderSyncDotsHtml,
  resolveSyncVisual,
  type SyncManifest,
  type SyncVisualState,
} from './sync-manifest';

export type { AttendanceStatus, LessonKind, StudentType };

export type RepeatInterval = 'weekly' | 'daily' | 'biweekly';
export type SeatCapacity = '1:1' | '1:2';

export interface PrintSheetRow {
  date: string;
  dayOfWeek: string;
  booth: number;
  period: number;
  seat: 1 | 2;
  studentName: string;
  grade: string;
  subject: string;
  teacherName: string;
  lessonKind: LessonKind;
  studentType: StudentType;
  note: string;
  capacity: SeatCapacity;
  slotKey: string;
  slotId?: string;
  repeatId?: string;
  irregular?: boolean;
  attendance?: AttendanceStatus;
  transferFrom?: string;
  transferTo?: string;
  countTarget?: boolean;
  /** @deprecated use syncVisualHtml */
  syncStatus?: string;
  syncVisual?: SyncVisualState;
  syncVisualHtml?: string;
}

export interface RepeatPlanItem {
  date: string;
  seat: 1 | 2;
  irregular: boolean;
}

export interface RepeatSkip {
  date: string;
  reason: string;
}

/** UI / セル照合用のローカルキー（日付|ブース|時限|席） */
export function buildSlotKey(date: string, booth: number, period: number, seat: 1 | 2): string {
  return `${date}|B${booth}|P${period}|S${seat}`;
}

/** Excel F19 / Lesson_Slot__c.Slot_Key__c 用 External ID */
export function buildSfSlotKey(
  accountId: string,
  date: string,
  period: number,
  booth: number,
  studentName: string,
): string {
  const ymd = date.replace(/-/g, '').replace(/\//g, '');
  return `${accountId}_${ymd}_P${period}_B${booth}_${studentName}`;
}

export function capacityLabelForSf(oneToOneMode: boolean): string {
  return oneToOneMode ? '1：1' : '1：2';
}

export function attendanceForSf(status: AttendanceStatus | undefined): string | undefined {
  if (status === '出席' || status === '欠席' || status === '振替') return status;
  return undefined;
}

export function newSlotId(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rowHasContent(row: PrintSheetRow): boolean {
  return Boolean(row.studentName.trim() || row.subject.trim());
}

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export function formatDayOfWeek(date: string): string {
  const day = new Date(`${date}T12:00:00`).getDay();
  return WEEKDAY_LABELS[day] ?? '';
}

export function effectiveCapacity(settings: BoothGridSettings): SeatCapacity {
  return settings.oneToOneMode ? '1:1' : '1:2';
}

export function defaultLessonKind(subject: string): LessonKind {
  return subject.trim() === '体験' ? '体験' : '通常';
}

function resolveCountTarget(cell: BoothCell): boolean {
  if (cell.lessonKind === '体験') return false;
  if (cell.attendance === '振替') return false;
  return cell.countTarget !== false;
}

function cellToPrintRow(
  cell: BoothCell,
  settings: BoothGridSettings,
  slotMeta: BoothSlotMeta,
  syncManifest?: SyncManifest,
): PrintSheetRow {
  const lessonKind = cell.lessonKind ?? defaultLessonKind(cell.subject);
  const slotKey = buildSlotKey(cell.date, cell.booth, cell.period, cell.seat);
  const row: PrintSheetRow = {
    date: cell.date,
    dayOfWeek: formatDayOfWeek(cell.date),
    booth: cell.booth,
    period: cell.period,
    seat: cell.seat,
    studentName: cell.studentName,
    grade: cell.grade ?? '',
    subject: cell.subject,
    teacherName: slotMeta.teacherName,
    lessonKind,
    studentType: cell.studentType ?? '在籍',
    note: cell.note ?? '',
    capacity: effectiveCapacity(settings),
    slotKey,
    repeatId: cell.repeatId,
    irregular: cell.irregular,
    attendance: cell.attendance ?? defaultAttendance(),
    transferFrom: cell.transferFrom,
    transferTo: cell.transferTo,
    countTarget: resolveCountTarget(cell),
  };
  const visual = resolveSyncVisual(row, syncManifest?.[slotKey]);
  row.syncVisual = visual;
  row.syncVisualHtml = renderSyncDotsHtml(visual);
  return row;
}

export function boothCellsToPrintRows(
  cells: BoothCell[],
  settings: BoothGridSettings,
  dates?: string[],
  slotMeta: BoothSlotMeta[] = [],
  syncManifest?: SyncManifest,
  /** @deprecated pass syncManifest */
  slotSyncState?: Record<string, SlotSyncEntry>,
): PrintSheetRow[] {
  const manifest =
    syncManifest ??
    (slotSyncState
      ? Object.fromEntries(
          Object.entries(slotSyncState).map(([key, entry]) => [
            key,
            { slot: { ...entry, contentHash: entry.contentHash ?? '' } },
          ]),
        )
      : undefined);
  const dateSet = dates ? new Set(dates) : null;
  const visiblePeriods = new Set(visiblePeriodNumbers(settings));
  const metaByKey = new Map(slotMeta.map((meta) => [slotMetaKey(meta.date, meta.booth, meta.period), meta]));
  const rows: PrintSheetRow[] = [];

  for (const cell of cells) {
    if (dateSet && !dateSet.has(cell.date)) continue;
    if (!visiblePeriods.has(cell.period)) continue;
    if (settings.oneToOneMode && cell.seat === 2) continue;
    if (!cell.studentName.trim() && !cell.subject.trim()) continue;
    const meta =
      metaByKey.get(slotMetaKey(cell.date, cell.booth, cell.period)) ??
      ({ date: cell.date, booth: cell.booth, period: cell.period, teacherName: '' } satisfies BoothSlotMeta);
    rows.push(cellToPrintRow(cell, settings, meta, manifest));
  }

  return sortPrintRows(rows);
}

function slotMetaKey(date: string, booth: number, period: number): string {
  return `${date}|${booth}|${period}`;
}

export function boothSessionToPrintRows(session: BoothGridSession, dates?: string[]): PrintSheetRow[] {
  return boothCellsToPrintRows(
    session.cells,
    session.settings,
    dates,
    session.slotMeta,
    session.syncManifest,
  );
}

export function printRowsToBoothCells(rows: PrintSheetRow[], settings: BoothGridSettings): BoothCell[] {
  const cells: BoothCell[] = [];
  for (const row of rows) {
    if (settings.oneToOneMode && row.seat === 2) continue;
    if (!rowHasContent(row)) continue;
    cells.push({
      id: cellKey(row.date, row.booth, row.period, row.seat),
      date: row.date,
      booth: row.booth,
      period: row.period,
      seat: row.seat,
      studentName: row.studentName,
      subject: row.subject,
      grade: row.grade,
      lessonKind: row.lessonKind,
      studentType: row.studentType,
      note: row.note,
      repeatId: row.repeatId,
      irregular: row.irregular,
      attendance: row.attendance,
      transferFrom: row.transferFrom,
      transferTo: row.transferTo,
      countTarget: row.countTarget,
    });
  }
  return cells;
}

export function printRowsToSlotMeta(rows: PrintSheetRow[]): BoothSlotMeta[] {
  const map = new Map<string, BoothSlotMeta>();
  for (const row of rows) {
    if (!rowHasContent(row)) continue;
    const key = slotMetaKey(row.date, row.booth, row.period);
    const existing = map.get(key);
    if (existing) {
      if (!existing.teacherName && row.teacherName.trim()) {
        existing.teacherName = row.teacherName.trim();
      }
      continue;
    }
    map.set(key, {
      date: row.date,
      booth: row.booth,
      period: row.period,
      teacherName: row.teacherName.trim(),
    });
  }
  return [...map.values()];
}

export function mergePrintRowsIntoCells(
  existingCells: BoothCell[],
  rows: PrintSheetRow[],
  settings: BoothGridSettings,
  dates: string[],
): BoothCell[] {
  const dateSet = new Set(dates);
  const merged = existingCells.filter((cell) => !dateSet.has(cell.date));
  for (const cell of printRowsToBoothCells(rows, settings)) {
    if (dateSet.has(cell.date)) merged.push(cell);
  }
  return merged;
}

export function syncSlotFromCells(
  cells: BoothCell[],
  ref: BoothSlotRef,
  settings: BoothGridSettings,
): PrintSheetRow[] {
  return boothCellsToPrintRows(
    cells.filter((c) => c.date === ref.date && c.booth === ref.booth && c.period === ref.period),
    settings,
  );
}

export function isSeatFree(
  rows: PrintSheetRow[],
  date: string,
  period: number,
  booth: number,
  seat: 1 | 2,
  ignoreRepeatId?: string,
): boolean {
  return !rows.some(
    (row) =>
      row.date === date &&
      row.period === period &&
      row.booth === booth &&
      row.seat === seat &&
      rowHasContent(row) &&
      (!ignoreRepeatId || row.repeatId !== ignoreRepeatId),
  );
}

export function pickSeat(
  rows: PrintSheetRow[],
  date: string,
  period: number,
  booth: number,
  homeSeat: 1 | 2,
  capacity: SeatCapacity,
  ignoreRepeatId?: string,
): { seat: 0 | 1 | 2; irregular: boolean } {
  if (isSeatFree(rows, date, period, booth, homeSeat, ignoreRepeatId)) {
    return { seat: homeSeat, irregular: false };
  }
  if (capacity === '1:2') {
    const otherSeat: 1 | 2 = homeSeat === 1 ? 2 : 1;
    if (isSeatFree(rows, date, period, booth, otherSeat, ignoreRepeatId)) {
      return { seat: otherSeat, irregular: true };
    }
  }
  return { seat: 0, irregular: false };
}

export function expandRepeatDates(
  startDate: string,
  endDate: string,
  interval: RepeatInterval,
  dow?: number,
): string[] {
  const dates: string[] = [];
  const start = parseDateKey(startDate);
  const end = parseDateKey(endDate);
  if (start > end) return dates;

  if (interval === 'daily') {
    let current = new Date(start);
    while (current <= end) {
      dates.push(formatDateKeyLocal(current));
      current.setDate(current.getDate() + 1);
    }
    return dates;
  }

  const stepDays = interval === 'biweekly' ? 14 : 7;
  let current = new Date(start);
  if (dow !== undefined) {
    while (current.getDay() !== dow && current <= end) {
      current.setDate(current.getDate() + 1);
    }
  }

  while (current <= end) {
    dates.push(formatDateKeyLocal(current));
    current.setDate(current.getDate() + stepDays);
  }
  return dates;
}

function parseDateKey(key: string): Date {
  return new Date(`${key}T12:00:00`);
}

function formatDateKeyLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildRepeatPlan(
  rows: PrintSheetRow[],
  dates: string[],
  period: number,
  booth: number,
  homeSeat: 1 | 2,
  capacity: SeatCapacity,
  closedDates: Set<string>,
  ignoreRepeatId?: string,
): { plan: RepeatPlanItem[]; skips: RepeatSkip[] } {
  const plan: RepeatPlanItem[] = [];
  const skips: RepeatSkip[] = [];

  for (const date of dates) {
    if (closedDates.has(date)) {
      skips.push({ date, reason: '休校日' });
      continue;
    }
    const picked = pickSeat(rows, date, period, booth, homeSeat, capacity, ignoreRepeatId);
    if (picked.seat === 0) {
      skips.push({ date, reason: '満席' });
      continue;
    }
    plan.push({ date, seat: picked.seat, irregular: picked.irregular });
  }

  return { plan, skips };
}

function sortPrintRows(rows: PrintSheetRow[]): PrintSheetRow[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.booth !== b.booth) return a.booth - b.booth;
    if (a.period !== b.period) return a.period - b.period;
    return a.seat - b.seat;
  });
}

export function printRowsToPreviewHtml(rows: PrintSheetRow[], selected?: BoothSlotRef | null): string {
  if (!rows.length) return '<p class="muted">PrintSheet: 0 行</p>';
  const selectedKey = selected ? slotRefKey(selected) : '';
  const body = rows
    .map((row) => {
      const rowSlotKey = `${row.date}|${row.booth}|${row.period}`;
      const cls = rowSlotKey === selectedKey ? ' class="preview-row-selected"' : '';
      return `<tr${cls}>
        <td>${escapeHtml(row.date)}</td>
        <td>${row.booth}</td>
        <td>${row.period}</td>
        <td>${row.seat}</td>
        <td>${escapeHtml(row.studentName || '—')}</td>
        <td>${escapeHtml(row.subject || '—')}</td>
      </tr>`;
    })
    .join('');
  return `<table class="print-preview-table">
    <thead><tr><th>日付</th><th>ブース</th><th>時限</th><th>席</th><th>生徒</th><th>教科</th></tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}
