import type { ClosedDateDefinition } from '../src/contracts';
import { expandRepeatDates } from './booth-print-sheet';
import type { BoothGridSession } from './booth-session-state';
import { getSlotMeta, newRepeatId, upsertSlotMeta } from './booth-session-state';

export interface TeacherRepeatRecord {
  id: string;
  teacherName: string;
  dow: number;
  period: number;
  booth: number;
  interval: 'weekly' | 'biweekly';
  startDate: string;
  endDate: string;
  status: 'active' | 'ended';
  createdAt: string;
  updatedAt: string;
}

export interface TeacherRepeatSkip {
  date: string;
  reason: string;
}

export function dryRunTeacherRepeat(
  input: Omit<TeacherRepeatRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  closedDates: ClosedDateDefinition[],
): { dates: string[]; skips: TeacherRepeatSkip[] } {
  const closed = new Set(closedDates.map((c) => c.date));
  const dates = expandRepeatDates(input.startDate, input.endDate, input.interval, input.dow);
  const skips: TeacherRepeatSkip[] = [];
  const applicable = dates.filter((date) => {
    if (closed.has(date)) {
      skips.push({ date, reason: '休校日' });
      return false;
    }
    return true;
  });
  return { dates: applicable, skips };
}

export function applyTeacherRepeat(
  session: BoothGridSession,
  input: Omit<TeacherRepeatRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'>,
  closedDates: ClosedDateDefinition[],
): { repeatId: string; applied: number; skips: TeacherRepeatSkip[] } {
  const { dates, skips } = dryRunTeacherRepeat(input, closedDates);
  const repeatId = newRepeatId();
  const now = new Date().toISOString();
  let applied = 0;

  for (const date of dates) {
    upsertSlotMeta(session, {
      date,
      booth: input.booth,
      period: input.period,
      teacherName: input.teacherName,
    });
    applied += 1;
  }

  if (!session.teacherRepeatRecords) session.teacherRepeatRecords = [];
  session.teacherRepeatRecords.push({
    ...input,
    id: repeatId,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  });

  return { repeatId, applied, skips };
}

export function rescheduleTeacherRepeat(
  session: BoothGridSession,
  repeatId: string,
  closedDates: ClosedDateDefinition[],
): { applied: number; skips: TeacherRepeatSkip[] } | null {
  const record = session.teacherRepeatRecords?.find((r) => r.id === repeatId && r.status === 'active');
  if (!record) return null;

  const allDates = expandRepeatDates(record.startDate, record.endDate, record.interval, record.dow);
  for (const date of allDates) {
    const meta = getSlotMeta(session, date, record.booth, record.period);
    if (meta.teacherName.trim() === record.teacherName.trim()) {
      upsertSlotMeta(session, { ...meta, teacherName: '' });
    }
  }

  const { dates, skips } = dryRunTeacherRepeat(record, closedDates);
  let applied = 0;
  for (const date of dates) {
    upsertSlotMeta(session, {
      date,
      booth: record.booth,
      period: record.period,
      teacherName: record.teacherName,
    });
    applied += 1;
  }
  record.updatedAt = new Date().toISOString();
  return { applied, skips };
}

export function teacherNameForSlot(
  session: BoothGridSession,
  date: string,
  booth: number,
  period: number,
): string {
  return getSlotMeta(session, date, booth, period).teacherName;
}
