import { describe, expect, it } from 'vitest';
import {
  applyRepeatPlan,
  dryRunRepeat,
  endRepeatRecord,
  rescheduleRepeat,
  type BoothGridSession,
  DEFAULT_BOOTH_SETTINGS,
} from './booth-session-state';

const baseSession = (): BoothGridSession => ({
  settings: { ...DEFAULT_BOOTH_SETTINGS },
  cells: [],
  repeatRecords: [],
});

describe('booth repeat session', () => {
  it('dryRunRepeat skips closed dates and full seats', () => {
    const session = baseSession();
    session.cells.push({
      id: '2026-06-17|1|1|1',
      date: '2026-06-17',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '既存',
      subject: '英語',
    });

    const { plan, skips } = dryRunRepeat(
      session,
      {
        type: 'student',
        name: '新規',
        subject: '数学',
        dow: 2,
        period: 1,
        booth: 1,
        homeSeat: 1,
        capacity: '1:1',
        interval: 'weekly',
        startDate: '2026-06-16',
        endDate: '2026-06-23',
      },
      [{ date: '2026-06-16', title: '休校' }],
    );

    expect(skips.some((s) => s.reason === '休校日')).toBe(true);
    expect(plan.every((p) => p.date !== '2026-06-16')).toBe(true);
  });

  it('applyRepeatPlan writes cells and repeat record with grade', () => {
    const session = baseSession();
    const record = {
      type: 'student' as const,
      name: '田中',
      subject: '国語',
      grade: '中2',
      dow: 3,
      period: 2,
      booth: 1,
      homeSeat: 1 as const,
      capacity: '1:1' as const,
      interval: 'weekly' as const,
      startDate: '2026-06-18',
      endDate: '2026-06-25',
    };
    const { plan } = dryRunRepeat(session, record, []);
    const result = applyRepeatPlan(session, record, plan, []);

    expect(session.repeatRecords).toHaveLength(1);
    expect(session.cells.every((c) => c.studentName === '田中' && c.grade === '中2')).toBe(true);
    expect(session.cells.some((c) => c.repeatId === result.repeatId)).toBe(true);
  });

  it('rescheduleRepeat rebuilds cells for repeat id', () => {
    const session = baseSession();
    const record = {
      type: 'student' as const,
      name: '鈴木',
      subject: '理科',
      dow: 4,
      period: 1,
      booth: 2,
      homeSeat: 1 as const,
      capacity: '1:1' as const,
      interval: 'weekly' as const,
      startDate: '2026-06-19',
      endDate: '2026-06-26',
    };
    const { plan } = dryRunRepeat(session, record, []);
    const applied = applyRepeatPlan(session, record, plan, []);
    session.cells = [];

    const rescheduled = rescheduleRepeat(session, applied.repeatId, []);
    expect(rescheduled).not.toBeNull();
    expect(session.cells.length).toBeGreaterThan(0);
  });

  it('endRepeatRecord marks active repeat as ended without removing cells', () => {
    const session = baseSession();
    const record = {
      type: 'student' as const,
      name: '佐藤',
      subject: '社会',
      dow: 5,
      period: 1,
      booth: 1,
      homeSeat: 1 as const,
      capacity: '1:1' as const,
      interval: 'weekly' as const,
      startDate: '2026-06-20',
      endDate: '2026-06-27',
    };
    const { plan } = dryRunRepeat(session, record, []);
    const applied = applyRepeatPlan(session, record, plan, []);
    const cellCount = session.cells.length;

    expect(endRepeatRecord(session, applied.repeatId)).toBe(true);
    expect(session.repeatRecords[0]?.status).toBe('ended');
    expect(session.cells.length).toBe(cellCount);
    expect(endRepeatRecord(session, applied.repeatId)).toBe(false);
  });
});
