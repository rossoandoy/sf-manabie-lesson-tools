import type { ClosedDateDefinition } from '../src/contracts';
import type { BoothCell, BoothGridSession, BoothSlotRef } from './booth-session-state';
import { cellKey, getCell, upsertCell } from './booth-session-state';

export type AttendanceStatus = '' | '未確定' | '出席' | '欠席' | '振替' | '休講';

export const ATTENDANCE_OPTIONS: AttendanceStatus[] = ['未確定', '出席', '欠席', '振替', '休講'];

export interface CellSeatRef {
  date: string;
  booth: number;
  period: number;
  seat: 1 | 2;
}

export interface TransferResult {
  ok: boolean;
  error?: string;
}

export function isValidAttendance(value: string): value is AttendanceStatus {
  return ATTENDANCE_OPTIONS.includes(value as AttendanceStatus) || value === '';
}

export function defaultAttendance(): AttendanceStatus {
  return '未確定';
}

export function attendanceCssClass(status: AttendanceStatus | undefined): string {
  switch (status) {
    case '出席':
      return 'attend-present';
    case '欠席':
      return 'attend-absent';
    case '振替':
      return 'attend-makeup';
    case '休講':
      return 'attend-canceled';
    default:
      return '';
  }
}

export function rowAttendanceCssClass(status: AttendanceStatus | undefined): string {
  const cls = attendanceCssClass(status);
  return cls ? `row-${cls}` : '';
}

function closedDateSet(closedDates: ClosedDateDefinition[]): Set<string> {
  return new Set(closedDates.map((c) => c.date));
}

function cellHasStudent(cell: BoothCell): boolean {
  return Boolean(cell.studentName.trim());
}

export function findCellByStudent(
  session: BoothGridSession,
  date: string,
  period: number,
  booth: number,
  studentName: string,
): BoothCell | null {
  const needle = studentName.trim();
  if (!needle) return null;
  return (
    session.cells.find(
      (c) =>
        c.date === date &&
        c.period === period &&
        c.booth === booth &&
        c.studentName.trim() === needle,
    ) ?? null
  );
}

export function applyAttendanceToCell(cell: BoothCell, status: AttendanceStatus): BoothCell {
  const next: BoothCell = { ...cell, attendance: status || defaultAttendance() };
  if (status === '振替') {
    next.countTarget = false;
  } else if (status === '出席' || status === '欠席' || status === '未確定') {
    next.countTarget = true;
  }
  return next;
}

export function setCellAttendance(
  session: BoothGridSession,
  ref: CellSeatRef,
  status: AttendanceStatus,
  closedDates: ClosedDateDefinition[] = [],
): boolean {
  if (closedDateSet(closedDates).has(ref.date)) return false;
  const cell = getCell(session, ref.date, ref.booth, ref.period, ref.seat);
  if (!cellHasStudent(cell)) return false;
  upsertCell(session, applyAttendanceToCell(cell, status));
  return true;
}

export function bulkSetAttendance(
  session: BoothGridSession,
  date: string,
  status: AttendanceStatus,
  closedDates: ClosedDateDefinition[] = [],
): { updated: number } {
  if (closedDateSet(closedDates).has(date)) return { updated: 0 };
  let updated = 0;
  for (const cell of session.cells) {
    if (cell.date !== date || !cellHasStudent(cell)) continue;
    upsertCell(session, applyAttendanceToCell(cell, status));
    updated += 1;
  }
  return { updated };
}

export function registerTransfer(
  session: BoothGridSession,
  from: CellSeatRef,
  to: CellSeatRef,
  closedDates: ClosedDateDefinition[] = [],
): TransferResult {
  const closed = closedDateSet(closedDates);
  if (closed.has(from.date) || closed.has(to.date)) {
    return { ok: false, error: '休校日には振替できません' };
  }

  const source = getCell(session, from.date, from.booth, from.period, from.seat);
  if (!cellHasStudent(source)) {
    return { ok: false, error: '振替元に生徒がいません' };
  }

  const destExisting = getCell(session, to.date, to.booth, to.period, to.seat);
  if (cellHasStudent(destExisting)) {
    return { ok: false, error: '振替先が既に埋まっています' };
  }

  session.cells = session.cells.filter((c) => c.id !== source.id);

  const dest: BoothCell = {
    id: cellKey(to.date, to.booth, to.period, to.seat),
    date: to.date,
    booth: to.booth,
    period: to.period,
    seat: to.seat,
    studentName: source.studentName,
    subject: source.subject,
    repeatId: source.repeatId,
    irregular: source.irregular,
    attendance: '振替',
    transferFrom: from.date,
    transferTo: to.date,
    countTarget: false,
  };
  upsertCell(session, dest);

  return { ok: true };
}

export interface TransferPairResult extends TransferResult {
  transferred?: number;
}

/** Transfer both occupied seats from one slot to the same destination slot (1:2 pair). */
export function registerTransferPair(
  session: BoothGridSession,
  from: BoothSlotRef,
  to: BoothSlotRef,
  closedDates: ClosedDateDefinition[] = [],
): TransferPairResult {
  const seatsToMove: (1 | 2)[] = [];
  for (const seat of [1, 2] as const) {
    const cell = getCell(session, from.date, from.booth, from.period, seat);
    if (!cellHasStudent(cell)) continue;
    const destExisting = getCell(session, to.date, to.booth, to.period, seat);
    if (cellHasStudent(destExisting)) {
      return { ok: false, error: `振替先席${seat}が既に埋まっています`, transferred: 0 };
    }
    seatsToMove.push(seat);
  }
  if (!seatsToMove.length) {
    return { ok: false, error: '振替元に生徒がいません', transferred: 0 };
  }

  let transferred = 0;
  for (const seat of seatsToMove) {
    const result = registerTransfer(
      session,
      { date: from.date, booth: from.booth, period: from.period, seat },
      { date: to.date, booth: to.booth, period: to.period, seat },
      closedDates,
    );
    if (!result.ok) return { ...result, transferred };
    transferred += 1;
  }
  return { ok: true, transferred };
}
