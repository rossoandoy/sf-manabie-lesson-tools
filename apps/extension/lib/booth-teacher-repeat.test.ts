import { describe, expect, it } from 'vitest';
import { applyTeacherRepeat, dryRunTeacherRepeat, endTeacherRepeatRecord } from './booth-teacher-repeat';
import { DEFAULT_BOOTH_SETTINGS, getSlotMeta, upsertSlotMeta, type BoothGridSession } from './booth-session-state';

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

  it('dryRunTeacherRepeat skips dates with conflicting teacher', () => {
    const session = baseSession();
    upsertSlotMeta(session, {
      date: '2026-06-23',
      booth: 1,
      period: 2,
      teacherName: '既存講師',
    });
    const input = {
      teacherName: '山田',
      dow: 2,
      period: 2,
      booth: 1,
      interval: 'weekly' as const,
      startDate: '2026-06-16',
      endDate: '2026-06-30',
    };
    const { dates, skips } = dryRunTeacherRepeat(input, [], session);
    expect(dates.includes('2026-06-23')).toBe(false);
    expect(skips.some((s) => s.date === '2026-06-23' && s.reason.includes('講師衝突'))).toBe(true);
  });

  it('endTeacherRepeatRecord marks active repeat as ended without clearing slotMeta', () => {
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
    const result = applyTeacherRepeat(session, input, []);
    const metaCount = session.slotMeta.length;

    expect(endTeacherRepeatRecord(session, result.repeatId)).toBe(true);
    expect(session.teacherRepeatRecords?.[0]?.status).toBe('ended');
    expect(session.slotMeta.length).toBe(metaCount);
    expect(endTeacherRepeatRecord(session, result.repeatId)).toBe(false);
  });
});
