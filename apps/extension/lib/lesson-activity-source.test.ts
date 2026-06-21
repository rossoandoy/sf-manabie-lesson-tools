import { describe, expect, it } from 'vitest';
import { BoothActivitySource, ManaerpStudentSessionSource } from './lesson-activity-source';
import type { BoothCell, BoothGridSettings } from './booth-session-state';

const settings: BoothGridSettings = {
  classroomName: 'A',
  accountId: '001',
  boothCount: 1,
  periodCount: 1,
  hideSunday: true,
  oneToOneMode: false,
  fiscalYear: '2026',
  visiblePeriods: [1],
};

const cells: BoothCell[] = [
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
];

describe('lesson-activity-source', () => {
  it('BoothActivitySource filters by student and date', () => {
    const source = new BoothActivitySource(cells, settings);
    expect(source.listActivities({ studentName: '山田' })).toHaveLength(1);
    expect(source.listActivities({ studentName: '山田', dateFrom: '2026-05-01' })).toHaveLength(0);
  });

  it('ManaerpStudentSessionSource maps normalized sessions', () => {
    const source = new ManaerpStudentSessionSource([
      {
        lessonId: 'L1',
        sessionId: 'S1',
        date: '2026-04-10',
        studentName: '山田',
        attendance: '出席',
        countTarget: true,
        capacity: '1:2',
        lessonKind: '通常',
        subject: '英語',
      },
    ]);
    const activities = source.listActivities({ studentName: '山田' });
    expect(activities).toHaveLength(1);
    expect(activities[0]?.attendance).toBe('出席');
  });
});
