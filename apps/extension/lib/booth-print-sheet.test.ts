import { describe, expect, it } from 'vitest';
import type { BoothCell, BoothGridSettings } from './booth-session-state';
import {
  buildRepeatPlan,
  buildSlotKey,
  boothCellsToPrintRows,
  expandRepeatDates,
  formatDayOfWeek,
  isSeatFree,
  mergePrintRowsIntoCells,
  pickSeat,
  printRowsToBoothCells,
  printRowsToPreviewHtml,
  printRowsToSlotMeta,
  type PrintSheetRow,
} from './booth-print-sheet';

function makeRow(partial: Partial<PrintSheetRow> & Pick<PrintSheetRow, 'date' | 'booth' | 'period' | 'seat' | 'studentName' | 'slotKey'>): PrintSheetRow {
  return {
    dayOfWeek: formatDayOfWeek(partial.date),
    grade: '',
    subject: '',
    teacherName: '',
    lessonKind: '通常',
    studentType: '在籍',
    note: '',
    capacity: '1:2',
    ...partial,
  };
}

const settings: BoothGridSettings = {
  classroomName: '教室A',
  accountId: '',
  boothCount: 2,
  periodCount: 3,
  hideSunday: true,
  oneToOneMode: false,
  fiscalYear: '2026',
  visiblePeriods: [1, 3],
};

const cells: BoothCell[] = [
  {
    id: '2026-06-10|1|1|1',
    date: '2026-06-10',
    booth: 1,
    period: 1,
    seat: 1,
    studentName: '山田',
    subject: '英語',
  },
  {
    id: '2026-06-10|1|2|1',
    date: '2026-06-10',
    booth: 1,
    period: 2,
    seat: 1,
    studentName: '空',
    subject: '',
  },
  {
    id: '2026-06-11|2|3|2',
    date: '2026-06-11',
    booth: 2,
    period: 3,
    seat: 2,
    studentName: '佐藤',
    subject: '数学',
  },
];

describe('booth-print-sheet', () => {
  it('builds slot keys', () => {
    expect(buildSlotKey('2026-06-10', 1, 2, 1)).toBe('2026-06-10|B1|P2|S1');
  });

  it('excludes empty rows and hidden periods', () => {
    const rows = boothCellsToPrintRows(cells, settings);
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.period)).toEqual([1, 3]);
    expect(rows[0]?.studentName).toBe('山田');
  });

  it('excludes seat 2 in one-to-one mode', () => {
    const rows = boothCellsToPrintRows(cells, { ...settings, oneToOneMode: true });
    expect(rows.every((r) => r.seat === 1)).toBe(true);
  });

  it('renders preview html with selected row class', () => {
    const rows = boothCellsToPrintRows(cells, settings);
    const html = printRowsToPreviewHtml(rows, { date: '2026-06-10', booth: 1, period: 1 });
    expect(html).toContain('preview-row-selected');
    expect(html).toContain('山田');
  });

  it('round-trips cells through print rows with extended columns', () => {
    const extendedCells: BoothCell[] = [
      { ...cells[0]!, grade: '小5', lessonKind: '通常' },
    ];
    const rows = boothCellsToPrintRows(
      extendedCells,
      settings,
      undefined,
      [{ date: '2026-06-10', booth: 1, period: 1, teacherName: '田中' }],
    );
    expect(rows[0]?.grade).toBe('小5');
    expect(rows[0]?.teacherName).toBe('田中');
    const roundTrip = printRowsToBoothCells(rows, settings);
    expect(roundTrip[0]?.grade).toBe('小5');
    expect(printRowsToSlotMeta(rows)[0]?.teacherName).toBe('田中');
  });

  it('mergePrintRowsIntoCells replaces scoped dates only', () => {
    const scopedCells: BoothCell[] = [
      {
        id: '2026-06-10|1|1|1',
        date: '2026-06-10',
        booth: 1,
        period: 1,
        seat: 1,
        studentName: '山田',
        subject: '英語',
      },
      {
        id: '2026-06-11|2|3|2',
        date: '2026-06-11',
        booth: 2,
        period: 3,
        seat: 2,
        studentName: '佐藤',
        subject: '数学',
      },
    ];
    const rows = boothCellsToPrintRows(scopedCells, settings);
    const merged = mergePrintRowsIntoCells(scopedCells, rows, settings, ['2026-06-10']);
    expect(merged.some((c) => c.date === '2026-06-11')).toBe(true);
    expect(merged.filter((c) => c.date === '2026-06-10')).toHaveLength(1);
  });

  it('pickSeat falls back to opposite seat in 1:2 mode', () => {
    const rows: PrintSheetRow[] = [
      makeRow({
        date: '2026-06-17',
        booth: 1,
        period: 1,
        seat: 1,
        studentName: '占有',
        slotKey: buildSlotKey('2026-06-17', 1, 1, 1),
      }),
    ];
    expect(isSeatFree(rows, '2026-06-17', 1, 1, 1)).toBe(false);
    expect(pickSeat(rows, '2026-06-17', 1, 1, 1, '1:2')).toEqual({ seat: 2, irregular: true });
  });

  it('pickSeat returns 0 when both seats full', () => {
    const rows: PrintSheetRow[] = [
      makeRow({
        date: '2026-06-17',
        booth: 1,
        period: 1,
        seat: 1,
        studentName: 'A',
        slotKey: buildSlotKey('2026-06-17', 1, 1, 1),
      }),
      makeRow({
        date: '2026-06-17',
        booth: 1,
        period: 1,
        seat: 2,
        studentName: 'B',
        slotKey: buildSlotKey('2026-06-17', 1, 1, 2),
      }),
    ];
    expect(pickSeat(rows, '2026-06-17', 1, 1, 1, '1:2')).toEqual({ seat: 0, irregular: false });
  });

  it('expandRepeatDates respects weekday filter', () => {
    const dates = expandRepeatDates('2026-06-09', '2026-06-30', 'weekly', 1);
    expect(dates.every((d) => new Date(`${d}T12:00:00`).getDay() === 1)).toBe(true);
    expect(dates.length).toBeGreaterThan(0);
  });

  it('expandRepeatDates daily includes every day in range', () => {
    const dates = expandRepeatDates('2026-06-09', '2026-06-12', 'daily');
    expect(dates).toEqual(['2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12']);
  });

  it('buildRepeatPlan skips closed dates', () => {
    const closed = new Set(['2026-06-17']);
    const { plan, skips } = buildRepeatPlan([], ['2026-06-17', '2026-06-18'], 1, 1, 1, '1:1', closed);
    expect(plan).toHaveLength(1);
    expect(skips).toEqual([{ date: '2026-06-17', reason: '休校日' }]);
  });
});
