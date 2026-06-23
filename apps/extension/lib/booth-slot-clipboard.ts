import type { ClosedDateDefinition } from '../src/contracts';
import type { AttendanceStatus, BoothCell, BoothGridSession, BoothSlotRef } from './booth-session-state';
import { cellKey, clearSlot, getCell, getSlotMeta, upsertCell, upsertSlotMeta } from './booth-session-state';

export interface SlotSeatPayload {
  seat: 1 | 2;
  studentName: string;
  subject: string;
  grade?: string;
  lessonKind?: BoothCell['lessonKind'];
  studentType?: BoothCell['studentType'];
  note?: string;
  attendance?: AttendanceStatus;
  countTarget?: boolean;
}

export interface SlotClipboardPayload {
  teacherName: string;
  seats: SlotSeatPayload[];
}

function closedDateSet(closedDates: ClosedDateDefinition[]): Set<string> {
  return new Set(closedDates.map((c) => c.date));
}

export function captureSlot(session: BoothGridSession, ref: BoothSlotRef): SlotClipboardPayload {
  const slotMeta = getSlotMeta(session, ref.date, ref.booth, ref.period);
  const seats: SlotSeatPayload[] = [];
  for (const seat of [1, 2] as const) {
    const cell = getCell(session, ref.date, ref.booth, ref.period, seat);
    if (!cell.studentName.trim() && !cell.subject.trim()) continue;
    seats.push({
      seat,
      studentName: cell.studentName,
      subject: cell.subject,
      grade: cell.grade,
      lessonKind: cell.lessonKind,
      studentType: cell.studentType,
      note: cell.note,
      attendance: cell.attendance,
      countTarget: cell.countTarget,
    });
  }
  return { teacherName: slotMeta.teacherName, seats };
}

export function slotHasContent(session: BoothGridSession, ref: BoothSlotRef): boolean {
  const payload = captureSlot(session, ref);
  return Boolean(payload.teacherName.trim() || payload.seats.length);
}

export function pasteSlot(
  session: BoothGridSession,
  ref: BoothSlotRef,
  payload: SlotClipboardPayload,
  closedDates: ClosedDateDefinition[] = [],
  options: { overwrite?: boolean } = {},
): { ok: boolean; error?: string } {
  if (closedDateSet(closedDates).has(ref.date)) {
    return { ok: false, error: '休校日には貼り付けできません' };
  }
  if (!payload.teacherName.trim() && !payload.seats.length) {
    return { ok: false, error: 'クリップボードが空です' };
  }

  const destHasContent = slotHasContent(session, ref);
  if (destHasContent && !options.overwrite) {
    return { ok: false, error: '貼り付け先に既にデータがあります' };
  }

  if (options.overwrite || destHasContent) {
    clearSlot(session, ref);
  }

  upsertSlotMeta(session, {
    date: ref.date,
    booth: ref.booth,
    period: ref.period,
    teacherName: payload.teacherName,
  });

  for (const seatPayload of payload.seats) {
    if (session.settings.oneToOneMode && seatPayload.seat === 2) continue;
    upsertCell(session, {
      id: cellKey(ref.date, ref.booth, ref.period, seatPayload.seat),
      date: ref.date,
      booth: ref.booth,
      period: ref.period,
      seat: seatPayload.seat,
      studentName: seatPayload.studentName,
      subject: seatPayload.subject,
      grade: seatPayload.grade,
      lessonKind: seatPayload.lessonKind,
      studentType: seatPayload.studentType,
      note: seatPayload.note,
      attendance: seatPayload.attendance ?? '未確定',
      countTarget: seatPayload.countTarget ?? true,
    });
  }

  return { ok: true };
}

export function moveSlot(
  session: BoothGridSession,
  from: BoothSlotRef,
  to: BoothSlotRef,
  closedDates: ClosedDateDefinition[] = [],
): { ok: boolean; error?: string } {
  if (from.date === to.date && from.booth === to.booth && from.period === to.period) {
    return { ok: false, error: '同じコマへは移動できません' };
  }
  const payload = captureSlot(session, from);
  if (!payload.teacherName.trim() && !payload.seats.length) {
    return { ok: false, error: '移動元が空です' };
  }
  const pasted = pasteSlot(session, to, payload, closedDates);
  if (!pasted.ok) return pasted;
  clearSlot(session, from);
  upsertSlotMeta(session, { date: from.date, booth: from.booth, period: from.period, teacherName: '' });
  return { ok: true };
}

export function clearAllSlotsForDate(session: BoothGridSession, date: string): number {
  const before = session.cells.length;
  session.cells = session.cells.filter((c) => c.date !== date);
  session.slotMeta = session.slotMeta.filter((m) => m.date !== date);
  return before - session.cells.length;
}
