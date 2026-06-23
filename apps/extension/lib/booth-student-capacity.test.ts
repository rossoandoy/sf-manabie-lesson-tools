import { describe, expect, it } from 'vitest';
import { shouldBlockSeat2, studentCapacityFromCatalog } from './booth-student-capacity';
import { DEFAULT_BOOTH_SETTINGS, upsertCell, type BoothGridSession } from './booth-session-state';

const baseSession = (): BoothGridSession => ({
  settings: { ...DEFAULT_BOOTH_SETTINGS },
  cells: [],
  slotMeta: [],
  repeatRecords: [],
});

const catalog = {
  catalogs: {
    students: [
      { id: '1', name: '田中', fields: { Name: '田中', MANAERP__Lesson_Capacity__c: 1 } },
      { id: '2', name: '鈴木', fields: { Name: '鈴木', MANAERP__Lesson_Capacity__c: 2 } },
    ],
  },
} as never;

describe('booth-student-capacity', () => {
  it('detects 1:1 contract from catalog', () => {
    expect(studentCapacityFromCatalog(catalog, null, '田中')).toBe('1:1');
    expect(studentCapacityFromCatalog(catalog, null, '鈴木')).toBe('1:2');
  });

  it('blocks seat2 when seat1 student has 1:1 contract', () => {
    const session = baseSession();
    upsertCell(session, {
      id: '2026-06-16|1|1|1',
      date: '2026-06-16',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '田中',
      subject: '数学',
    });
    expect(shouldBlockSeat2(session, '2026-06-16', 1, 1, catalog, null)).toBe(true);
  });

  it('does not block seat2 when seat2 has a student', () => {
    const session = baseSession();
    upsertCell(session, {
      id: '2026-06-16|1|1|1',
      date: '2026-06-16',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '田中',
      subject: '数学',
    });
    upsertCell(session, {
      id: '2026-06-16|1|1|2',
      date: '2026-06-16',
      booth: 1,
      period: 1,
      seat: 2,
      studentName: '佐藤',
      subject: '数学',
    });
    expect(shouldBlockSeat2(session, '2026-06-16', 1, 1, catalog, null)).toBe(false);
  });
});
