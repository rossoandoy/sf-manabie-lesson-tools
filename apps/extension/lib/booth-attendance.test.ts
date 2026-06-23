import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_OPTIONS,
  applyAttendanceToCell,
  attendanceCssClass,
  bulkSetAttendance,
  findCellByStudent,
  registerTransfer,
  registerTransferPair,
  setCellAttendance,
} from './booth-attendance';
import { boothCellsToPrintRows, printRowsToBoothCells } from './booth-print-sheet';
import type { BoothGridSession } from './booth-session-state';
import { DEFAULT_BOOTH_SETTINGS } from './booth-session-state';

const session = (): BoothGridSession => ({
  settings: { ...DEFAULT_BOOTH_SETTINGS },
  cells: [
    {
      id: '2026-06-10|1|1|1',
      date: '2026-06-10',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '山田',
      subject: '英語',
      attendance: '未確定',
    },
    {
      id: '2026-06-10|1|1|2',
      date: '2026-06-10',
      booth: 1,
      period: 1,
      seat: 2,
      studentName: '鈴木',
      subject: '国語',
    },
    {
      id: '2026-06-11|2|2|1',
      date: '2026-06-11',
      booth: 2,
      period: 2,
      seat: 1,
      studentName: '佐藤',
      subject: '数学',
    },
  ],
  repeatRecords: [],
});

describe('booth-attendance', () => {
  it('maps attendance to css classes', () => {
    expect(attendanceCssClass('出席')).toBe('attend-present');
    expect(attendanceCssClass('欠席')).toBe('attend-absent');
    expect(attendanceCssClass('振替')).toBe('attend-makeup');
    expect(attendanceCssClass('休講')).toBe('attend-canceled');
    expect(attendanceCssClass('未確定')).toBe('');
  });

  it('setCellAttendance updates a occupied seat', () => {
    const s = session();
    expect(setCellAttendance(s, { date: '2026-06-10', booth: 1, period: 1, seat: 1 }, '出席')).toBe(true);
    expect(findCellByStudent(s, '2026-06-10', 1, 1, '山田')?.attendance).toBe('出席');
  });

  it('setCellAttendance rejects empty seat and closed day', () => {
    const s = session();
    expect(setCellAttendance(s, { date: '2026-06-11', booth: 2, period: 2, seat: 2 }, '出席')).toBe(false);
    expect(
      setCellAttendance(s, { date: '2026-06-10', booth: 1, period: 1, seat: 1 }, '出席', [
        { date: '2026-06-10', title: '休校' },
      ]),
    ).toBe(false);
  });

  it('bulkSetAttendance skips closed day and empty cells', () => {
    const s = session();
    expect(bulkSetAttendance(s, '2026-06-10', '出席').updated).toBe(2);
    expect(bulkSetAttendance(s, '2026-06-10', '出席', [{ date: '2026-06-10', title: '休校' }]).updated).toBe(0);
  });

  it('registerTransfer moves student to destination', () => {
    const s = session();
    const result = registerTransfer(
      s,
      { date: '2026-06-10', booth: 1, period: 1, seat: 1 },
      { date: '2026-06-12', booth: 1, period: 1, seat: 1 },
    );
    expect(result.ok).toBe(true);
    expect(findCellByStudent(s, '2026-06-10', 1, 1, '山田')).toBeNull();
    const moved = findCellByStudent(s, '2026-06-12', 1, 1, '山田');
    expect(moved?.attendance).toBe('振替');
    expect(moved?.transferFrom).toBe('2026-06-10');
    expect(moved?.countTarget).toBe(false);
  });

  it('registerTransferPair moves both seats from same slot', () => {
    const s = session();
    const result = registerTransferPair(
      s,
      { date: '2026-06-10', booth: 1, period: 1 },
      { date: '2026-06-12', booth: 1, period: 1 },
    );
    expect(result.ok).toBe(true);
    expect(result.transferred).toBe(2);
    expect(findCellByStudent(s, '2026-06-12', 1, 1, '山田')?.attendance).toBe('振替');
    expect(findCellByStudent(s, '2026-06-12', 1, 1, '鈴木')?.attendance).toBe('振替');
  });

  it('applyAttendanceToCell sets countTarget false for makeup', () => {
    const cell = applyAttendanceToCell(
      {
        id: 'x',
        date: '2026-06-10',
        booth: 1,
        period: 1,
        seat: 1,
        studentName: 'A',
        subject: 'B',
      },
      '振替',
    );
    expect(cell.countTarget).toBe(false);
  });

  it('round-trips attendance through print rows', () => {
    const s = session();
    setCellAttendance(s, { date: '2026-06-10', booth: 1, period: 1, seat: 1 }, '欠席');
    const rows = boothCellsToPrintRows(s.cells, s.settings);
    const cells = printRowsToBoothCells(rows, s.settings);
    expect(cells[0]?.attendance).toBe('欠席');
  });

  it('exports attendance options', () => {
    expect(ATTENDANCE_OPTIONS).toContain('出席');
  });
});
