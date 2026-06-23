import { describe, expect, it } from 'vitest';
import type { LessonMasterCatalog } from '../contracts';
import type { BoothGridSettings } from '../../lib/booth-session-state';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import { buildLessonSlotImportPlan } from './slotImportPlanBuilder';

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

const rows: PrintSheetRow[] = [
  {
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
  },
];

describe('slotImportPlanBuilder', () => {
  it('builds Lesson_Slot upsert batch with Excel-compatible Slot_Key', () => {
    const plan = buildLessonSlotImportPlan({ rows, settings, catalog, accountName: 'Test Center' });
    expect(plan.validationIssues.filter((i) => i.severity === 'error')).toHaveLength(0);
    expect(plan.batches).toHaveLength(1);
    const batch = plan.batches[0]!;
    expect(batch.operation).toBe('upsert');
    expect(batch.sobjectApiName).toBe('Lesson_Slot__c');
    expect(batch.externalIdField).toBe('Slot_Key__c');
    expect(batch.records[0]?.fields.Slot_Key__c).toBe('001LOC_20260610_P2_B1_山田');
    expect(batch.records[0]?.fields.Attendance__c).toBe('出席');
    expect(batch.records[0]?.fields.Grade__c).toBe('小5');
    expect(batch.records[0]?.fields.Teacher_Name__c).toBe('田中');
    expect(batch.records[0]?.fields.Capacity__c).toBe('1：2');
  });

  it('skips empty rows and reports missing account', () => {
    const plan = buildLessonSlotImportPlan({
      rows: [{ ...rows[0]!, studentName: '', subject: '' }],
      settings: { ...settings, accountId: '' },
      catalog,
    });
    expect(plan.validationIssues.some((i) => i.code === 'NO_ACCOUNT')).toBe(true);
    expect(plan.batches[0]?.records).toHaveLength(0);
  });
});
