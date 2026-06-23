import { describe, expect, it } from 'vitest';
import type { BoothCell, BoothGridSession } from './booth-session-state';
import { applyClosedDatesToSession, reconcileClosedDates } from './closed-date-guard';

const baseSession: BoothGridSession = {
  settings: {
    classroomName: 'A',
    accountId: '001',
    boothCount: 1,
    periodCount: 1,
    hideSunday: true,
    oneToOneMode: false,
    fiscalYear: '2026',
    visiblePeriods: [1],
  },
  cells: [
    {
      id: '1',
      date: '2026-04-10',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '山田',
      subject: '英語',
      attendance: '出席',
      countTarget: true,
    },
    {
      id: '2',
      date: '2026-04-11',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '山田',
      subject: '英語',
      attendance: '未確定',
      countTarget: true,
    },
  ],
  repeatRecords: [],
  slotMeta: [],
};

describe('closed-date-guard', () => {
  it('marks cells on closed dates as 休講 with countTarget false', () => {
    const { session, changed } = applyClosedDatesToSession(baseSession, [
      { id: 'c1', title: '休校', date: '2026-04-10', academicYearId: 'ay', academicYearName: '2026' },
    ]);
    expect(changed).toBe(true);
    const closedCell = session.cells.find((cell) => cell.date === '2026-04-10');
    expect(closedCell?.attendance).toBe('休講');
    expect(closedCell?.countTarget).toBe(false);
    expect(closedCell?.studentName).toBe('山田');
  });

  it('is idempotent when cells already marked', () => {
    const first = reconcileClosedDates(baseSession, [
      { id: 'c1', title: '休校', date: '2026-04-10', academicYearId: 'ay', academicYearName: '2026' },
    ]);
    const second = reconcileClosedDates(first.session, [
      { id: 'c1', title: '休校', date: '2026-04-10', academicYearId: 'ay', academicYearName: '2026' },
    ]);
    expect(second.changed).toBe(false);
  });

  it('restores prior attendance when closed date is removed', () => {
    const marked = reconcileClosedDates(baseSession, [
      { id: 'c1', title: '休校', date: '2026-04-10', academicYearId: 'ay', academicYearName: '2026' },
    ]);
    const { session, changed } = reconcileClosedDates(marked.session, []);
    expect(changed).toBe(true);
    const restored = session.cells.find((cell) => cell.date === '2026-04-10');
    expect(restored?.attendance).toBe('出席');
    expect(restored?.countTarget).toBe(true);
    expect(restored?.priorAttendance).toBeUndefined();
  });
});
