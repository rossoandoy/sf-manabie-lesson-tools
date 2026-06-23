import { describe, expect, it } from 'vitest';
import type { LessonMasterCatalog, LessonScheduleDefinition } from '../contracts';
import { buildScheduleImportPlan, scheduleDefinitionsToCsv, schoolYearFromDate } from './scheduleImportPlanBuilder';

const catalog: LessonMasterCatalog = {
  org: { orgId: '00DTEST', username: 'test@example.com', isSandbox: true },
  syncedAt: new Date().toISOString(),
  catalogs: {
    locations: [{ id: '001', name: '大森北校' }],
    academicYears: [{ id: 'AY1', name: '2026' }],
    locationCourses: [{ id: 'LC1', name: '英語中1', fields: { MANAERP__Account__c: '001' } }],
    classes: [{ id: 'CL1', name: '基礎', fields: { MANAERP__Location_Course__c: 'LC1' } }],
    classrooms: [{ id: 'RM1', name: 'A教室', fields: { MANAERP__Account__c: '001' } }],
    teachers: [{ id: 'T1', name: '木村先生' }],
    students: [],
    academicCalendars: [{ id: 'AC1', name: 'Default Calendar' }],
  },
};

const sampleLesson: LessonScheduleDefinition = {
  id: 'lesson-1',
  lessonName: '英語基礎中1',
  lessonDate: '2026-06-20',
  startTime: '10:00',
  endTime: '11:00',
  teachingMethod: 'Group',
  teachingMedium: 'Offline',
  locationId: '001',
  locationName: '大森北校',
  academicYearId: 'AY1',
  academicYearName: '2026',
  locationCourseId: 'LC1',
  locationCourseName: '英語中1',
  classId: 'CL1',
  className: '基礎',
  classroomId: 'RM1',
  classroomName: 'A教室',
  teacherId: 'T1',
  teacherName: '木村先生',
  capacity: '20',
  repeatEndDate: '2026-06-30',
};

describe('scheduleImportPlanBuilder', () => {
  it('builds dependent batches for schedule, teacher, classroom, class', () => {
    const plan = buildScheduleImportPlan({ definitions: [sampleLesson], catalog });
    expect(plan.batches.length).toBeGreaterThanOrEqual(3);
    expect(plan.batches[0]?.artifactKind).toBe('lessonSchedule');
    expect(plan.batches[1]?.dependsOn).toContain('batch-lesson-schedule');
    expect(plan.validationIssues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
  });

  it('exports CSV compatible with legacy web app', () => {
    const csv = scheduleDefinitionsToCsv([sampleLesson]);
    expect(csv.split('\n')[0]).toBe('拠点,年度,開始日,終了日,指導法種別,授業形態,拠点コース,クラス,教室,授業名,講師名,定員');
    expect(csv).toContain('大森北校');
    expect(csv).toContain('英語基礎中1');
  });

  it('calculates school year from date', () => {
    expect(schoolYearFromDate('2026-03-31')).toBe(2025);
    expect(schoolYearFromDate('2026-04-01')).toBe(2026);
  });
});
