import { describe, expect, it } from 'vitest';
import { copyWeekSlots } from './booth-week-copy';
import { DEFAULT_BOOTH_SETTINGS, upsertCell, upsertSlotMeta, type BoothGridSession } from './booth-session-state';

const baseSession = (): BoothGridSession => ({
  settings: { ...DEFAULT_BOOTH_SETTINGS, visiblePeriods: [1, 2] },
  cells: [],
  slotMeta: [],
  repeatRecords: [],
});

describe('copyWeekSlots', () => {
  it('copies teacher+student slots to next week when target is empty', () => {
    const session = baseSession();
    upsertSlotMeta(session, { date: '2026-06-09', booth: 1, period: 1, teacherName: '山田' });
    upsertCell(session, {
      id: '2026-06-09|1|1|1',
      date: '2026-06-09',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '田中',
      subject: '数学',
    });

    const result = copyWeekSlots(session, '2026-06-09', '2026-06-16', 7, []);
    expect(result.copied).toBeGreaterThan(0);
    expect(
      session.cells.some((c) => c.date === '2026-06-16' && c.studentName === '田中'),
    ).toBe(true);
  });
});
