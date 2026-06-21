import { describe, expect, it } from 'vitest';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import type { BoothGridSettings } from '../../lib/booth-session-state';
import type { LessonMasterCatalog } from '../contracts';
import type { LessonDayIndex, NormalizedLessonSession } from './manaerpLessonQueryService';
import { buildStudentSessionCreatePlan } from './studentSessionCreatePlanBuilder';

const settings: BoothGridSettings = {
  classroomName: 'Test',
  accountId: '001',
  boothCount: 2,
  periodCount: 3,
  hideSunday: true,
  oneToOneMode: false,
  fiscalYear: '2026',
  visiblePeriods: [1, 2, 3],
};

const catalog: LessonMasterCatalog = {
  org: { orgId: '00D', username: 'u@x', isSandbox: true },
  syncedAt: new Date().toISOString(),
  catalogs: {
    locations: [{ id: '001', name: 'Loc' }],
    academicYears: [],
    locationCourses: [],
    classes: [],
    classrooms: [],
    teachers: [],
    students: [{ id: '003', name: '山田太郎' }],
    academicCalendars: [],
  },
};

const row: PrintSheetRow = {
  date: '2026-04-10',
  dayOfWeek: '金',
  booth: 1,
  period: 1,
  seat: 1,
  studentName: '山田太郎',
  grade: '',
  subject: '',
  teacherName: '',
  lessonKind: '通常',
  studentType: '在籍',
  note: '',
  capacity: '1:1',
  slotKey: '2026-04-10|B1|P1|S1',
  attendance: '出席',
  countTarget: true,
};

describe('buildStudentSessionCreatePlan', () => {
  it('creates session when lesson exists and session is missing', () => {
    const lessonDayIndex: LessonDayIndex = new Map([
      ['2026-04-10', [{ lessonId: 'L1', studentNames: new Set(['他生徒']) }]],
    ]);
    const plan = buildStudentSessionCreatePlan({
      rows: [row],
      sessions: [],
      lessonDayIndex,
      settings,
      catalog,
    });
    expect(plan.createCount).toBe(1);
    expect(plan.batches[0]?.operation).toBe('create');
    expect(plan.batches[0]?.records[0]?.fields.MANAERP__Lesson__c).toBe('L1');
  });

  it('skips days missing lessons from gap report', () => {
    const lessonDayIndex: LessonDayIndex = new Map([
      ['2026-04-10', [{ lessonId: 'L1', studentNames: new Set() }]],
    ]);
    const plan = buildStudentSessionCreatePlan({
      rows: [row],
      sessions: [],
      lessonDayIndex,
      settings,
      catalog,
      daysMissingLessons: ['2026-04-10'],
    });
    expect(plan.createCount).toBe(0);
  });

  it('skips when session already exists', () => {
    const sessions: NormalizedLessonSession[] = [
      {
        lessonId: 'L1',
        sessionId: 'S1',
        date: '2026-04-10',
        studentName: '山田太郎',
        attendance: '出席',
        countTarget: true,
        capacity: '1:1',
      },
    ];
    const plan = buildStudentSessionCreatePlan({
      rows: [row],
      sessions,
      lessonDayIndex: new Map(),
      settings,
      catalog,
    });
    expect(plan.createCount).toBe(0);
  });

  it('warns when multiple candidate lessons exist', () => {
    const lessonDayIndex: LessonDayIndex = new Map([
      [
        '2026-04-10',
        [
          { lessonId: 'L1', studentNames: new Set() },
          { lessonId: 'L2', studentNames: new Set() },
        ],
      ],
    ]);
    const plan = buildStudentSessionCreatePlan({
      rows: [row],
      sessions: [],
      lessonDayIndex,
      settings,
      catalog,
    });
    expect(plan.createCount).toBe(0);
    expect(plan.validationIssues.some((issue) => issue.code === 'LESSON_AMBIGUOUS')).toBe(true);
  });

  it('creates session for 休講 with Absent and note', () => {
    const lessonDayIndex: LessonDayIndex = new Map([
      ['2026-04-10', [{ lessonId: 'L1', studentNames: new Set(['他生徒']) }]],
    ]);
    const plan = buildStudentSessionCreatePlan({
      rows: [{ ...row, attendance: '休講' }],
      sessions: [],
      lessonDayIndex,
      settings,
      catalog,
    });
    expect(plan.createCount).toBe(1);
    expect(plan.batches[0]?.records[0]?.fields.MANAERP__Attendance_Status__c).toBe('Absent');
    expect(plan.batches[0]?.records[0]?.fields.MANAERP__Attendance_Note__c).toBe('休講');
  });
});
