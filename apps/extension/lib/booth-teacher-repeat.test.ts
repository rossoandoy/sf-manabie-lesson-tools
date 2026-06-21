import { describe, expect, it } from 'vitest';
import { applyTeacherRepeat, dryRunTeacherRepeat } from './booth-teacher-repeat';
import { DEFAULT_BOOTH_SETTINGS, getSlotMeta, type BoothGridSession } from './booth-session-state';

const baseSession = (): BoothGridSession => ({
  settings: { ...DEFAULT_BOOTH_SETTINGS },
  cells: [],
  slotMeta: [],
  repeatRecords: [],
});

describe('booth teacher repeat', () => {
  it('applies teacher to matching weekdays', () => {
    const session = baseSession();
    const input = {
      teacherName: '山田',
      dow: 1,
      period: 2,
      booth: 1,
      interval: 'weekly' as const,
      startDate: '2026-06-16',
      endDate: '2026-06-30',
    };
    const closed = [{ date: '2026-06-16', title: '休校' }];
    const { dates } = dryRunTeacherRepeat(input, closed);
    expect(dates.length).toBeGreaterThan(0);

    const result = applyTeacherRepeat(session, input, closed);
    expect(result.applied).toBe(dates.length);
    expect(getSlotMeta(session, dates[0]!, 1, 2).teacherName).toBe('山田');
    expect(session.teacherRepeatRecords).toHaveLength(1);
  });
});
