import { describe, expect, it } from 'vitest';
import { manaerpAttendanceToTrg } from '../../lib/manaerp-attendance-map';
import {
  buildManaerpLessonQuerySoql,
  mapManaerpLessonRecords,
} from './manaerpLessonQueryService';

describe('manaerpLessonQueryService', () => {
  it('builds SOQL with date range and optional account filter', () => {
    const soql = buildManaerpLessonQuerySoql({
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      accountId: '001ABC',
    });
    expect(soql).toContain('FROM MANAERP__Lesson__c');
    expect(soql).toContain('MANAERP__Lesson_Date__c >= 2026-04-01');
    expect(soql).toContain('MANAERP__Lesson_Date__c <= 2026-04-30');
    expect(soql).toContain("MANAERP__Lesson_Schedule__r.MANAERP__Account__c = '001ABC'");
    expect(soql).toContain('FROM MANAERP__Student_Sessions__r');
  });

  it('maps lesson child sessions to normalized rows', () => {
    const rows = mapManaerpLessonRecords([
      {
        Id: 'a2L001',
        MANAERP__Lesson_Date__c: '2026-04-10',
        MANAERP__Lesson_Capacity__c: 2,
        MANAERP__Subject_Name__c: '英語',
        MANAERP__Student_Sessions__r: {
          records: [
            {
              Id: 'a2S001',
              MANAERP__Student_Name__c: '山田',
              MANAERP__Attendance_Status__c: 'Attend',
            },
            {
              Id: 'a2S002',
              MANAERP__Student_Name__c: '佐藤',
              MANAERP__Attendance_Status__c: 'Absent',
            },
          ],
        },
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.studentName).toBe('山田');
    expect(rows[0]?.attendance).toBe(manaerpAttendanceToTrg('Attend'));
    expect(rows[1]?.attendance).toBe('欠席');
    expect(rows[0]?.capacity).toBe('1:2');
  });

  it('returns empty array when lesson has no child sessions', () => {
    expect(mapManaerpLessonRecords([{ Id: 'a2L001', MANAERP__Lesson_Date__c: '2026-04-10' }])).toEqual([]);
  });
});
