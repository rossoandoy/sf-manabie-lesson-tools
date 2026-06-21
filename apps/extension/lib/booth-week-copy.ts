import type { ClosedDateDefinition } from '../src/contracts';
import { formatDateKey } from './calendar-utils';
import { captureSlot, pasteSlot, slotHasContent } from './booth-slot-clipboard';
import type { BoothGridSession } from './booth-session-state';

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return formatDateKey(d);
}

function closedDateSet(closedDates: ClosedDateDefinition[]): Set<string> {
  return new Set(closedDates.map((c) => c.date));
}

export interface WeekCopyResult {
  copied: number;
  skippedOccupied: number;
  skippedClosed: number;
  skippedEmpty: number;
}

/** Copy booth slots from source week to target week (typically prev → current). Only slots with teacher + student. */
export function copyWeekSlots(
  session: BoothGridSession,
  sourceWeekStart: string,
  targetWeekStart: string,
  dayCount: number,
  closedDates: ClosedDateDefinition[] = [],
): WeekCopyResult {
  const closed = closedDateSet(closedDates);
  const result: WeekCopyResult = {
    copied: 0,
    skippedOccupied: 0,
    skippedClosed: 0,
    skippedEmpty: 0,
  };

  for (let offset = 0; offset < dayCount; offset += 1) {
    const sourceDate = addDays(sourceWeekStart, offset);
    const targetDate = addDays(targetWeekStart, offset);
    if (closed.has(targetDate)) {
      result.skippedClosed += 1;
      continue;
    }

    for (let booth = 1; booth <= session.settings.boothCount; booth += 1) {
      for (const period of session.settings.visiblePeriods.filter((p) => p <= session.settings.periodCount)) {
        const ref = { date: sourceDate, booth, period };
        const payload = captureSlot(session, ref);
        const hasTeacher = Boolean(payload.teacherName.trim());
        const hasStudent = payload.seats.some((s) => s.studentName.trim());
        if (!hasTeacher || !hasStudent) {
          result.skippedEmpty += 1;
          continue;
        }

        const destRef = { date: targetDate, booth, period };
        if (slotHasContent(session, destRef)) {
          result.skippedOccupied += 1;
          continue;
        }

        const pasted = pasteSlot(session, destRef, payload, closedDates);
        if (pasted.ok) result.copied += 1;
      }
    }
  }

  return result;
}
