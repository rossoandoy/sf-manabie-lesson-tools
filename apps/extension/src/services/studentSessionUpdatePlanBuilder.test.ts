import { describe, expect, it } from 'vitest';
import type { LessonMasterCatalog } from '../contracts';
import type { BoothGridSettings } from '../../lib/booth-session-state';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import type { NormalizedLessonSession } from './manaerpLessonQueryService';
import { buildStudentSessionUpdatePlan } from './studentSessionUpdatePlanBuilder';

const catalog: LessonMasterCatalog = {
  org: { orgId: '00DTEST', username: 'test@example.com', isSandbox: true },
  syncedAt: new Date().toISOString(),
  catalogs: {
    locations: [{ id: '001LOC', name: 'Test Center' }],
    academicYears: [],
    locationCourses: [],
    classes: [],
    classrooms: [],
    teachers: [],
    students: [{ id: '003STU', name: '山田' }],
    academicCalendars: [],
  },
};

const settings: BoothGridSettings = {
  classroomName: '教室A',
  accountId: '001LOC',
  boothCount: 2,
  periodCount: 3,
  hideSunday: true,
  oneToOneMode: false,
  fiscalYear: '2026',
  visiblePeriods: [1, 2, 3],
};

const baseRow: PrintSheetRow = {
  date: '2026-06-10',
  dayOfWeek: '水',
  booth: 1,
  period: 2,
  seat: 1,
  studentName: '山田',
  grade: '小5',
  subject: '英語',
  teacherName: '田中',
  lessonKind: '通常',
  studentType: '在籍',
  note: '',
  capacity: '1:2',
  slotKey: '2026-06-10|B1|P2|S1',
  attendance: '出席',
  countTarget: true,
};

const session: NormalizedLessonSession = {
  lessonId: 'lesson-1',
  sessionId: 'session-1',
  date: '2026-06-10',
  studentName: '山田',
  attendance: '欠席',
  countTarget: true,
  capacity: '1:2',
  rawAttendance: 'Absent',
};

describe('buildStudentSessionUpdatePlan', () => {
  it('builds update batch when booth attendance differs from Manabie', () => {
    const plan = buildStudentSessionUpdatePlan({
      rows: [baseRow],
      sessions: [session],
      settings,
      catalog,
    });
    expect(plan.updateCount).toBe(1);
    expect(plan.matchedCount).toBe(1);
    expect(plan.batches[0]?.operation).toBe('update');
    expect(plan.batches[0]?.artifactKind).toBe('studentSession');
    expect(plan.batches[0]?.records[0]?.fields.MANAERP__Attendance_Status__c).toBe('Attend');
  });

  it('skips rows without session match', () => {
    const plan = buildStudentSessionUpdatePlan({
      rows: [baseRow],
      sessions: [],
      settings,
      catalog,
    });
    expect(plan.updateCount).toBe(0);
    expect(plan.batches).toEqual([]);
    expect(plan.validationIssues.some((issue) => issue.code === 'SESSION_NOT_MATCHED')).toBe(true);
  });

  it('skips unsupported attendance values', () => {
    const plan = buildStudentSessionUpdatePlan({
      rows: [{ ...baseRow, attendance: '振替' }],
      sessions: [session],
      settings,
      catalog,
    });
    expect(plan.updateCount).toBe(0);
    expect(plan.validationIssues.some((issue) => issue.code === 'ATTENDANCE_NOT_MAPPED')).toBe(true);
  });

  it('returns empty plan when no rows', () => {
    const plan = buildStudentSessionUpdatePlan({
      rows: [],
      sessions: [session],
      settings,
      catalog,
    });
    expect(plan.updateCount).toBe(0);
    expect(plan.validationIssues.some((issue) => issue.code === 'NO_ROWS')).toBe(true);
  });

  it('skips unchanged attendance', () => {
    const plan = buildStudentSessionUpdatePlan({
      rows: [{ ...baseRow, attendance: '欠席' }],
      sessions: [session],
      settings,
      catalog,
    });
    expect(plan.updateCount).toBe(0);
    expect(plan.skipCount).toBeGreaterThan(0);
  });

  it('writes 休講 as Absent with attendance note', () => {
    const plan = buildStudentSessionUpdatePlan({
      rows: [{ ...baseRow, attendance: '休講' }],
      sessions: [session],
      settings,
      catalog,
    });
    expect(plan.updateCount).toBe(1);
    expect(plan.batches[0]?.records[0]?.fields.MANAERP__Attendance_Status__c).toBe('Absent');
    expect(plan.batches[0]?.records[0]?.fields.MANAERP__Attendance_Note__c).toBe('休講');
  });
});
