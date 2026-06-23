import type { ClosedDateDefinition } from '../src/contracts';
import type { AttendanceStatus, BoothGridSession } from './booth-session-state';

function closedDateSet(closedDates: ClosedDateDefinition[]): Set<string> {
  return new Set(closedDates.map((item) => item.date));
}

function markCellClosed<T extends BoothGridSession['cells'][number]>(cell: T): T {
  if (cell.attendance === '休講' && cell.countTarget === false) return cell;
  return {
    ...cell,
    priorAttendance: cell.attendance !== '休講' ? cell.attendance : cell.priorAttendance,
    priorCountTarget: cell.attendance !== '休講' ? cell.countTarget : cell.priorCountTarget,
    attendance: '休講',
    countTarget: false,
  };
}

function restoreCellFromClosed<T extends BoothGridSession['cells'][number]>(cell: T): T {
  if (cell.attendance !== '休講' || cell.priorAttendance === undefined) return cell;
  const restored: T = {
    ...cell,
    attendance: cell.priorAttendance as AttendanceStatus,
    countTarget: cell.priorCountTarget ?? true,
    priorAttendance: undefined,
    priorCountTarget: undefined,
  };
  return restored;
}

export function reconcileClosedDates(
  session: BoothGridSession,
  closedDates: ClosedDateDefinition[],
): { session: BoothGridSession; changed: boolean } {
  const closedSet = closedDateSet(closedDates);
  let changed = false;

  const cells = session.cells.map((cell) => {
    if (closedSet.has(cell.date)) {
      const next = markCellClosed(cell);
      if (next !== cell) changed = true;
      return next;
    }
    const next = restoreCellFromClosed(cell);
    if (next !== cell) changed = true;
    return next;
  });

  if (!changed) return { session, changed: false };
  return { session: { ...session, cells }, changed: true };
}

/** @deprecated Use reconcileClosedDates — kept for call-site compatibility */
export function applyClosedDatesToSession(
  session: BoothGridSession,
  closedDates: ClosedDateDefinition[],
): { session: BoothGridSession; changed: boolean } {
  return reconcileClosedDates(session, closedDates);
}
