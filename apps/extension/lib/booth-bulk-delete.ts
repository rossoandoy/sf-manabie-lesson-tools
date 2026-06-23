import type { ClosedDateDefinition } from '../src/contracts';
import type { BoothGridSession } from './booth-session-state';
import { getSlotMeta, upsertSlotMeta } from './booth-session-state';

export type BulkDeleteTarget = 'student' | 'teacher';

export interface BulkDeleteMatch {
  date: string;
  booth: number;
  period: number;
  seat?: 1 | 2;
}

export interface BulkDeletePreview {
  target: BulkDeleteTarget;
  name: string;
  matches: BulkDeleteMatch[];
}

function closedDateSet(closedDates: ClosedDateDefinition[]): Set<string> {
  return new Set(closedDates.map((item) => item.date));
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

export function previewBulkDelete(
  session: BoothGridSession,
  target: BulkDeleteTarget,
  name: string,
  dateFrom: string,
  dateTo: string,
  closedDates: ClosedDateDefinition[],
): BulkDeletePreview {
  const trimmed = name.trim();
  const closed = closedDateSet(closedDates);
  const matches: BulkDeleteMatch[] = [];
  if (!trimmed || !dateFrom || !dateTo) {
    return { target, name: trimmed, matches };
  }

  if (target === 'student') {
    for (const cell of session.cells) {
      if (closed.has(cell.date)) continue;
      if (!inRange(cell.date, dateFrom, dateTo)) continue;
      if (cell.studentName.trim() !== trimmed) continue;
      matches.push({ date: cell.date, booth: cell.booth, period: cell.period, seat: cell.seat });
    }
    return { target, name: trimmed, matches };
  }

  for (const meta of session.slotMeta) {
    if (closed.has(meta.date)) continue;
    if (!inRange(meta.date, dateFrom, dateTo)) continue;
    if (meta.teacherName.trim() !== trimmed) continue;
    matches.push({ date: meta.date, booth: meta.booth, period: meta.period });
  }
  return { target, name: trimmed, matches };
}

export function applyBulkDelete(session: BoothGridSession, preview: BulkDeletePreview): number {
  if (!preview.matches.length) return 0;
  if (preview.target === 'student') {
    const keys = new Set(
      preview.matches.map((match) => `${match.date}|${match.booth}|${match.period}|${match.seat}`),
    );
    const before = session.cells.length;
    session.cells = session.cells.filter((cell) => {
      const key = `${cell.date}|${cell.booth}|${cell.period}|${cell.seat}`;
      return !keys.has(key);
    });
    return before - session.cells.length;
  }

  let updated = 0;
  for (const match of preview.matches) {
    const meta = getSlotMeta(session, match.date, match.booth, match.period);
    if (!meta.teacherName.trim()) continue;
    upsertSlotMeta(session, { ...meta, teacherName: '' });
    updated += 1;
  }
  return updated;
}
