import { describe, expect, it } from 'vitest';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import type { BoothGridSettings } from '../../lib/booth-session-state';
import type { LessonMasterCatalog } from '../contracts';
import type { LessonDayIndex, NormalizedLessonSession } from './manaerpLessonQueryService';
import { buildReallocationPlan } from './reallocationPlanBuilder';

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

const transferRow: PrintSheetRow = {
  date: '2026-04-15',
  dayOfWeek: '水',
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
  capacity: '1:2',
  slotKey: '2026-04-15|B1|P1|S1',
  attendance: '振替',
  transferFrom: '2026-04-10',
  transferTo: '2026-04-15',
  countTarget: false,
};

describe('buildReallocationPlan', () => {
  it('creates reallocation when original session and new lesson resolve', () => {
    const sessions: NormalizedLessonSession[] = [
      {
        lessonId: 'L-orig',
        sessionId: 'S-orig',
        date: '2026-04-10',
        studentName: '山田太郎',
        attendance: '出席',
        countTarget: true,
        capacity: '1:2',
      },
    ];
    const lessonDayIndex: LessonDayIndex = new Map([
      ['2026-04-15', [{ lessonId: 'L-new', studentNames: new Set() }]],
    ]);
    const plan = buildReallocationPlan({
      rows: [transferRow],
      sessions,
      lessonDayIndex,
      settings,
      catalog,
    });
    expect(plan.createCount).toBe(1);
    expect(plan.batches[0]?.artifactKind).toBe('reallocation');
    expect(plan.batches[0]?.records[0]?.fields.MANAERP__Original_Student_Sessions__c).toBe('S-orig');
    expect(plan.batches[0]?.records[0]?.fields.MANAERP__New_Lesson__c).toBe('L-new');
    expect(plan.batches[0]?.records[0]?.fields.MANAERP__Reallocate_Status__c).toBe('Open');
  });

  it('skips when transferFrom is missing', () => {
    const plan = buildReallocationPlan({
      rows: [{ ...transferRow, transferFrom: undefined, attendance: '出席' }],
      sessions: [],
      lessonDayIndex: new Map(),
      settings,
      catalog,
    });
    expect(plan.createCount).toBe(0);
  });

  it('skips when original session is missing', () => {
    const plan = buildReallocationPlan({
      rows: [transferRow],
      sessions: [],
      lessonDayIndex: new Map([['2026-04-15', [{ lessonId: 'L-new', studentNames: new Set() }]]]),
      settings,
      catalog,
    });
    expect(plan.createCount).toBe(0);
    expect(plan.validationIssues.some((issue) => issue.code === 'REALLOCATION_NO_ORIGINAL_SESSION')).toBe(true);
  });

  it('warns when destination lesson is ambiguous', () => {
    const sessions: NormalizedLessonSession[] = [
      {
        lessonId: 'L-orig',
        sessionId: 'S-orig',
        date: '2026-04-10',
        studentName: '山田太郎',
        attendance: '振替',
        countTarget: false,
        capacity: '1:2',
      },
    ];
    const lessonDayIndex: LessonDayIndex = new Map([
      [
        '2026-04-15',
        [
          { lessonId: 'L1', studentNames: new Set() },
          { lessonId: 'L2', studentNames: new Set() },
        ],
      ],
    ]);
    const plan = buildReallocationPlan({
      rows: [transferRow],
      sessions,
      lessonDayIndex,
      settings,
      catalog,
    });
    expect(plan.createCount).toBe(0);
    expect(plan.validationIssues.some((issue) => issue.code === 'LESSON_AMBIGUOUS')).toBe(true);
  });

  it('skips destination day in schedule gap report', () => {
    const sessions: NormalizedLessonSession[] = [
      {
        lessonId: 'L-orig',
        sessionId: 'S-orig',
        date: '2026-04-10',
        studentName: '山田太郎',
        attendance: '振替',
        countTarget: false,
        capacity: '1:2',
      },
    ];
    const plan = buildReallocationPlan({
      rows: [transferRow],
      sessions,
      lessonDayIndex: new Map([['2026-04-15', [{ lessonId: 'L-new', studentNames: new Set() }]]]),
      settings,
      catalog,
      daysMissingLessons: ['2026-04-15'],
    });
    expect(plan.createCount).toBe(0);
  });
});
