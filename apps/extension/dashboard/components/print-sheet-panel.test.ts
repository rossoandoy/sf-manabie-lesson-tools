import { describe, expect, it } from 'vitest';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import { filterPrintSheetRows, PRINT_SHEET_VIRTUAL_THRESHOLD } from './print-sheet-panel';

function dateKeysInRange(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const keys: string[] = [];
  let current = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (current <= end) {
    const key = current.toISOString().slice(0, 10);
    keys.push(key);
    current = new Date(current.getTime() + 86400000);
  }
  return keys;
}

const sampleRow = (overrides: Partial<PrintSheetRow> = {}): PrintSheetRow => ({
  slotKey: '2026-04-10|1|1|1',
  dayOfWeek: '金',
  date: '2026-04-10',
  booth: 1,
  period: 1,
  seat: 1,
  teacherName: '佐藤先生',
  studentName: '山田太郎',
  grade: '小5',
  subject: '算数',
  lessonKind: '通常',
  countTarget: true,
  studentType: '在籍',
  attendance: '出席',
  note: '',
  irregular: false,
  ...overrides,
});

describe('print-sheet date range helper', () => {
  it('returns inclusive date keys', () => {
    expect(dateKeysInRange('2026-04-01', '2026-04-03')).toEqual([
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
    ]);
  });

  it('returns empty when range is invalid', () => {
    expect(dateKeysInRange('2026-04-10', '2026-04-01')).toEqual([]);
  });
});

describe('filterPrintSheetRows', () => {
  const rows = [
    sampleRow(),
    sampleRow({
      slotKey: '2026-04-11|1|1|1',
      date: '2026-04-11',
      attendance: '振替',
      transferFrom: '2026-04-03',
      transferTo: '',
    }),
    sampleRow({
      slotKey: '2026-04-12|1|1|1',
      date: '2026-04-12',
      studentName: '鈴木花子',
    }),
  ];

  it('filters by student name', () => {
    const filtered = filterPrintSheetRows(rows, {
      entityFilterType: 'student',
      entityName: '山田太郎',
      unsyncedOnly: false,
      transferPendingOnly: false,
    });
    expect(filtered).toHaveLength(2);
  });

  it('filters transfer pending rows only', () => {
    const filtered = filterPrintSheetRows(rows, {
      entityFilterType: '',
      entityName: '',
      unsyncedOnly: false,
      transferPendingOnly: true,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.attendance).toBe('振替');
    expect(filtered[0]?.transferTo).toBe('');
  });
});

describe('PRINT_SHEET_VIRTUAL_THRESHOLD', () => {
  it('activates virtual scroll above 200 rows', () => {
    expect(PRINT_SHEET_VIRTUAL_THRESHOLD).toBe(200);
  });
});
