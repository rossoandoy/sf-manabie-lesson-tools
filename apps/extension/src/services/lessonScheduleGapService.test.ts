import { describe, expect, it } from 'vitest';
import type { BoothCell } from '../../lib/booth-session-state';
import type { StudentSessionUpdatePlan } from '../contracts';
import {
  buildLessonDatesQuerySoql,
  buildLessonScheduleOverlapQuerySoql,
  collectBoothActiveDays,
  computeScheduleGapReport,
  renderScheduleGapBannerHtml,
} from './lessonScheduleGapService';

const cells: BoothCell[] = [
  {
    date: '2026-06-10',
    booth: 1,
    period: 1,
    seat: 1,
    studentName: '山田',
    subject: '英語',
    grade: '',
    attendance: '出席',
    lessonKind: '通常',
    studentType: '在籍',
    note: '',
    countTarget: true,
  },
  {
    date: '2026-06-11',
    booth: 1,
    period: 1,
    seat: 1,
    studentName: '佐藤',
    subject: '数学',
    grade: '',
    attendance: '出席',
    lessonKind: '通常',
    studentType: '在籍',
    note: '',
    countTarget: true,
  },
];

describe('lessonScheduleGapService', () => {
  it('collects booth active days within scope', () => {
    expect(collectBoothActiveDays(cells)).toEqual(['2026-06-10', '2026-06-11']);
    expect(collectBoothActiveDays(cells, ['2026-06-10'])).toEqual(['2026-06-10']);
  });

  it('flags days with booth students but no lessons', () => {
    const report = computeScheduleGapReport({
      dateFrom: '2026-06-10',
      dateTo: '2026-06-11',
      daysWithBoothStudents: ['2026-06-10', '2026-06-11'],
      lessonDates: ['2026-06-10'],
      scheduleCountInRange: 1,
      lessonCountInRange: 1,
    });
    expect(report.daysMissingLessons).toEqual(['2026-06-11']);
    expect(report.warnings.some((issue) => issue.code === 'SCHEDULE_GAP_NO_LESSON')).toBe(true);
  });

  it('warns when schedules exist but lessons do not', () => {
    const report = computeScheduleGapReport({
      dateFrom: '2026-06-10',
      dateTo: '2026-06-11',
      daysWithBoothStudents: [],
      lessonDates: [],
      scheduleCountInRange: 2,
      lessonCountInRange: 0,
    });
    expect(report.warnings.some((issue) => issue.code === 'SCHEDULE_WITHOUT_LESSON')).toBe(true);
  });

  it('warns on low session match rate', () => {
    const plan = {
      matchedCount: 1,
      skipCount: 1,
      updateCount: 0,
      sourceRows: [
        { date: '2026-06-10', studentName: '山田', localSlotKey: 'a', boothAttendance: '出席' },
        { date: '2026-06-11', studentName: '佐藤', localSlotKey: 'b', boothAttendance: '出席' },
      ],
    } as StudentSessionUpdatePlan;
    const report = computeScheduleGapReport({
      dateFrom: '2026-06-10',
      dateTo: '2026-06-11',
      daysWithBoothStudents: ['2026-06-10', '2026-06-11'],
      lessonDates: ['2026-06-10', '2026-06-11'],
      scheduleCountInRange: 1,
      lessonCountInRange: 2,
      studentSessionPlan: plan,
    });
    expect(report.sessionMatchRate).toBe(0.5);
    expect(report.warnings.some((issue) => issue.code === 'SESSION_MATCH_RATE_LOW')).toBe(false);
    plan.matchedCount = 0;
    const low = computeScheduleGapReport({
      dateFrom: '2026-06-10',
      dateTo: '2026-06-11',
      daysWithBoothStudents: ['2026-06-10', '2026-06-11'],
      lessonDates: ['2026-06-10', '2026-06-11'],
      scheduleCountInRange: 1,
      lessonCountInRange: 2,
      studentSessionPlan: plan,
    });
    expect(low.warnings.some((issue) => issue.code === 'SESSION_MATCH_RATE_LOW')).toBe(true);
  });

  it('returns empty banner when no warnings', () => {
    const report = computeScheduleGapReport({
      dateFrom: '2026-06-10',
      dateTo: '2026-06-11',
      daysWithBoothStudents: ['2026-06-10'],
      lessonDates: ['2026-06-10'],
      scheduleCountInRange: 0,
      lessonCountInRange: 1,
    });
    expect(renderScheduleGapBannerHtml(report)).toBe('');
  });

  it('builds lesson and schedule SOQL', () => {
    const lessonSoql = buildLessonDatesQuerySoql({
      accountId: '001ABC',
      dateFrom: '2026-06-10',
      dateTo: '2026-06-16',
    });
    expect(lessonSoql).toContain('MANAERP__Lesson_Date__c >= 2026-06-10');
    expect(lessonSoql).toContain("MANAERP__Account__c = '001ABC'");

    const scheduleSoql = buildLessonScheduleOverlapQuerySoql({
      accountId: '001ABC',
      dateFrom: '2026-06-10',
      dateTo: '2026-06-16',
    });
    expect(scheduleSoql).toContain('MANAERP__Lesson_Schedule__c');
    expect(scheduleSoql).toContain('2026-06-16T23:59:59.000Z');
  });
});
