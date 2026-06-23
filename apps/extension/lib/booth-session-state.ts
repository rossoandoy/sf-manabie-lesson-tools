import type { ClosedDateDefinition } from '../src/contracts';
import {
  boothCellsToPrintRows,
  buildRepeatPlan,
  expandRepeatDates,
  printRowsToBoothCells,
  printRowsToSlotMeta,
  type PrintSheetRow,
  type RepeatPlanItem,
  type RepeatSkip,
  type SeatCapacity,
} from './booth-print-sheet';
import type { AttendanceStatus } from './booth-attendance';
import type { TeacherRepeatRecord } from './booth-teacher-repeat';
import { STORAGE_KEYS, loadScoped, saveScoped } from './lesson-storage';
import type { SyncManifest } from './sync-manifest';
import { normalizeSessionManifest } from './sync-manifest';
import type { SlotSyncEntry } from './slot-sync-state';

export type { AttendanceStatus };

export type BoothViewMode = 'calendar' | 'grid';

export interface BoothGridSettings {
  classroomName: string;
  accountId: string;
  boothCount: number;
  periodCount: number;
  hideSunday: boolean;
  oneToOneMode: boolean;
  fiscalYear: string;
  visiblePeriods: number[];
  /** Period number → start time label (e.g. "16:00") */
  periodStartTimes?: Record<string, string>;
  /** Period number → end time label (e.g. "17:00") */
  periodEndTimes?: Record<string, string>;
  /** Account / booth count resolved from user Affiliation vs manual override */
  accountSource?: 'affiliation' | 'manual';
  /** コマ組タブ表示: 授業スケジュールカレンダー or ブース表 */
  boothViewMode?: BoothViewMode;
  /** 左設定パネル折りたたみ */
  settingsCollapsed?: boolean;
  /** 右プレビューパネル折りたたみ */
  previewCollapsed?: boolean;
  /** 週ナビバー折りたたみ */
  contextCollapsed?: boolean;
  /** 大規模グリッド時の日 window オフセット（Phase 15） */
  dayScrollOffset?: number;
}

export type LessonKind = '通常' | '体験';
export type StudentType = '在籍' | '未入会';

export interface BoothCell {
  id: string;
  date: string;
  booth: number;
  period: number;
  seat: 1 | 2;
  studentName: string;
  subject: string;
  grade?: string;
  lessonKind?: LessonKind;
  studentType?: StudentType;
  note?: string;
  repeatId?: string;
  irregular?: boolean;
  attendance?: AttendanceStatus;
  transferFrom?: string;
  transferTo?: string;
  countTarget?: boolean;
  priorAttendance?: AttendanceStatus;
  priorCountTarget?: boolean;
}

export interface BoothSlotMeta {
  date: string;
  booth: number;
  period: number;
  teacherName: string;
  highlighted?: boolean;
}

export interface RepeatRecord {
  id: string;
  type: 'student';
  name: string;
  subject: string;
  grade?: string;
  dow: number;
  period: number;
  booth: number;
  homeSeat: 1 | 2;
  capacity: SeatCapacity;
  interval: 'weekly' | 'daily' | 'biweekly';
  startDate: string;
  endDate: string;
  status: 'active' | 'ended';
  createdAt: string;
  updatedAt: string;
}

export interface BoothGridSession {
  settings: BoothGridSettings;
  cells: BoothCell[];
  slotMeta: BoothSlotMeta[];
  /** @deprecated use syncManifest */
  slotSyncState?: Record<string, SlotSyncEntry>;
  syncManifest?: SyncManifest;
  repeatRecords: RepeatRecord[];
  teacherRepeatRecords?: TeacherRepeatRecord[];
}

export interface BoothSlotRef {
  date: string;
  booth: number;
  period: number;
}

export interface RepeatApplyResult {
  plan: RepeatPlanItem[];
  skips: RepeatSkip[];
  repeatId: string;
}

export const DEFAULT_BOOTH_SETTINGS: BoothGridSettings = {
  classroomName: '教室A',
  accountId: '',
  boothCount: 4,
  periodCount: 6,
  hideSunday: true,
  oneToOneMode: false,
  fiscalYear: '',
  visiblePeriods: [1, 2, 3, 4, 5, 6],
};

function defaultVisiblePeriods(count: number): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

export function slotMetaKey(date: string, booth: number, period: number): string {
  return `${date}|${booth}|${period}`;
}

export function getSlotMeta(
  session: BoothGridSession,
  date: string,
  booth: number,
  period: number,
): BoothSlotMeta {
  const key = slotMetaKey(date, booth, period);
  return (
    session.slotMeta.find((meta) => slotMetaKey(meta.date, meta.booth, meta.period) === key) ?? {
      date,
      booth,
      period,
      teacherName: '',
    }
  );
}

export function upsertSlotMeta(session: BoothGridSession, meta: BoothSlotMeta): void {
  const key = slotMetaKey(meta.date, meta.booth, meta.period);
  const idx = session.slotMeta.findIndex((item) => slotMetaKey(item.date, item.booth, item.period) === key);
  if (idx >= 0) session.slotMeta[idx] = meta;
  else session.slotMeta.push(meta);
}

export function cellKey(date: string, booth: number, period: number, seat: 1 | 2): string {
  return `${date}|${booth}|${period}|${seat}`;
}

export function slotRefKey(ref: BoothSlotRef): string {
  return `${ref.date}|${ref.booth}|${ref.period}`;
}

export function newRepeatId(): string {
  return `repeat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function getCell(
  session: BoothGridSession,
  date: string,
  booth: number,
  period: number,
  seat: 1 | 2,
): BoothCell {
  const id = cellKey(date, booth, period, seat);
  return (
    session.cells.find((c) => c.id === id) ?? {
      id,
      date,
      booth,
      period,
      seat,
      studentName: '',
      subject: '',
    }
  );
}

export function upsertCell(session: BoothGridSession, cell: BoothCell): void {
  const idx = session.cells.findIndex((c) => c.id === cell.id);
  if (idx >= 0) session.cells[idx] = cell;
  else session.cells.push(cell);
}

export function clearSlot(session: BoothGridSession, ref: BoothSlotRef): void {
  session.cells = session.cells.filter(
    (c) => !(c.date === ref.date && c.booth === ref.booth && c.period === ref.period),
  );
}

export function removeCellsByRepeatId(session: BoothGridSession, repeatId: string): void {
  session.cells = session.cells.filter((c) => c.repeatId !== repeatId);
}

export function visiblePeriodNumbers(settings: BoothGridSettings): number[] {
  const all = defaultVisiblePeriods(settings.periodCount);
  const filtered = settings.visiblePeriods.filter((p) => p >= 1 && p <= settings.periodCount);
  return filtered.length ? filtered.sort((a, b) => a - b) : all;
}

export async function loadBoothSession(hostname: string): Promise<BoothGridSession> {
  const stored = await loadScoped<BoothGridSession>(hostname, STORAGE_KEYS.BOOTH_SESSION);
  if (!stored) {
    return { settings: { ...DEFAULT_BOOTH_SETTINGS }, cells: [], slotMeta: [], repeatRecords: [] };
  }
  const settings: BoothGridSettings = {
    ...DEFAULT_BOOTH_SETTINGS,
    ...stored.settings,
    visiblePeriods: stored.settings.visiblePeriods?.length
      ? stored.settings.visiblePeriods
      : defaultVisiblePeriods(stored.settings.periodCount ?? DEFAULT_BOOTH_SETTINGS.periodCount),
  };
  return normalizeSessionManifest({
    settings,
    cells: stored.cells ?? [],
    slotMeta: stored.slotMeta ?? [],
    slotSyncState: stored.slotSyncState,
    syncManifest: stored.syncManifest,
    repeatRecords: stored.repeatRecords ?? [],
    teacherRepeatRecords: stored.teacherRepeatRecords ?? [],
  });
}

export async function saveBoothSession(hostname: string, session: BoothGridSession): Promise<void> {
  await saveScoped(hostname, STORAGE_KEYS.BOOTH_SESSION, session);
}

export function normalizeSettingsAfterPeriodCountChange(settings: BoothGridSettings): BoothGridSettings {
  const visible = settings.visiblePeriods.filter((p) => p <= settings.periodCount);
  return {
    ...settings,
    visiblePeriods: visible.length ? visible : defaultVisiblePeriods(settings.periodCount),
  };
}

export function mergePrintRowsIntoSession(
  session: BoothGridSession,
  rows: PrintSheetRow[],
  dates: string[],
): void {
  const dateSet = new Set(dates);
  session.cells = session.cells.filter((cell) => !dateSet.has(cell.date));
  for (const cell of printRowsToBoothCells(rows, session.settings)) {
    if (dateSet.has(cell.date)) upsertCell(session, cell);
  }
  session.slotMeta = session.slotMeta.filter((meta) => !dateSet.has(meta.date));
  for (const meta of printRowsToSlotMeta(rows)) {
    if (dateSet.has(meta.date)) upsertSlotMeta(session, meta);
  }
}

function closedDateSet(closedDates: ClosedDateDefinition[]): Set<string> {
  return new Set(closedDates.map((c) => c.date));
}

export function dryRunRepeat(
  session: BoothGridSession,
  input: Omit<RepeatRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  closedDates: ClosedDateDefinition[],
  ignoreRepeatId?: string,
): { plan: RepeatPlanItem[]; skips: RepeatSkip[] } {
  const dates = expandRepeatDates(input.startDate, input.endDate, input.interval, input.dow);
  const rows = boothCellsToPrintRows(session.cells, session.settings);
  return buildRepeatPlan(
    rows,
    dates,
    input.period,
    input.booth,
    input.homeSeat,
    input.capacity,
    closedDateSet(closedDates),
    ignoreRepeatId,
  );
}

export function applyRepeatPlan(
  session: BoothGridSession,
  record: Omit<RepeatRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  plan: RepeatPlanItem[],
  closedDates: ClosedDateDefinition[],
): RepeatApplyResult {
  const repeatId = newRepeatId();
  const now = new Date().toISOString();
  removeCellsByRepeatId(session, repeatId);

  for (const item of plan) {
    upsertCell(session, {
      id: cellKey(item.date, record.booth, record.period, item.seat),
      date: item.date,
      booth: record.booth,
      period: record.period,
      seat: item.seat,
      studentName: record.name,
      subject: record.subject,
      grade: record.grade,
      repeatId,
      irregular: item.irregular,
      attendance: '未確定',
      countTarget: true,
    });
  }

  session.repeatRecords.push({
    ...record,
    id: repeatId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  return { plan, skips: [], repeatId };
}

export function rescheduleRepeat(
  session: BoothGridSession,
  repeatId: string,
  closedDates: ClosedDateDefinition[],
): RepeatApplyResult | null {
  const record = session.repeatRecords.find((r) => r.id === repeatId && r.status === 'active');
  if (!record) return null;

  removeCellsByRepeatId(session, repeatId);
  const { plan, skips } = dryRunRepeat(session, record, closedDates, repeatId);

  for (const item of plan) {
    upsertCell(session, {
      id: cellKey(item.date, record.booth, record.period, item.seat),
      date: item.date,
      booth: record.booth,
      period: record.period,
      seat: item.seat,
      studentName: record.name,
      subject: record.subject,
      grade: record.grade,
      repeatId,
      irregular: item.irregular,
      attendance: '未確定',
      countTarget: true,
    });
  }

  record.updatedAt = new Date().toISOString();
  return { plan, skips, repeatId };
}

/** Mark repeat as ended without removing existing cells (Phase 16 policy). */
export function endRepeatRecord(session: BoothGridSession, repeatId: string): boolean {
  const record = session.repeatRecords.find((r) => r.id === repeatId && r.status === 'active');
  if (!record) return false;
  record.status = 'ended';
  record.updatedAt = new Date().toISOString();
  return true;
}
