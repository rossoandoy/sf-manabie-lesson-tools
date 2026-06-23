import { describe, expect, it, vi } from 'vitest';
import {
  buildCenterEnrollmentStatusSoql,
  buildCenterStudentBaseSoql,
  buildCenterStudentSoql,
  buildCenterTeacherSoql,
  loadCenterScopedCatalog,
  studentsForPicker,
  enrolledStudentNamesForReport,
} from './center-scoped-catalog';

vi.mock('../../lib/sf-api', () => ({
  soqlQuery: vi.fn(async (soql: string) => {
    if (soql.includes("RecordType.Name = 'Student'")) {
      return [
        {
          Id: '003STU1',
          Name: '田中',
          MANAERP__Lesson_Capacity__c: 1,
          MANAERP__Enrollment_Status__c: 'a0E1',
          MANAERP__Grade__r: { Name: '中2' },
        },
        {
          Id: '003STU2',
          Name: '体験生',
          MANAERP__Enrollment_Status__c: 'a0E2',
          MANAERP__Grade__r: { Name: '小6' },
        },
        {
          Id: '003STU3',
          Name: '退会済',
          MANAERP__Enrollment_Status__c: 'a0E3',
          MANAERP__Grade__r: { Name: '中1' },
        },
      ];
    }
    if (soql.includes('MANAERP__Enrollment_Status__c')) {
      return [
        { Id: 'a0E1', MANAERP__Current_Status__c: 'Enrolled' },
        { Id: 'a0E2', MANAERP__Current_Status__c: 'Temporary' },
        { Id: 'a0E3', MANAERP__Current_Status__c: 'Withdrawn' },
      ];
    }
    if (soql.includes('FROM MANAERP__Affiliation__c')) {
      return [
        { MANAERP__Contact__c: '003T1', MANAERP__Contact__r: { Id: '003T1', Name: '山田先生' } },
      ];
    }
    return [];
  }),
}));

describe('center-scoped-catalog', () => {
  it('builds student base SOQL without enrollment relationship in WHERE', () => {
    const soql = buildCenterStudentBaseSoql('001ACC');
    expect(soql).toContain('MANAERP__Main_Location__c');
    expect(soql).toContain('MANAERP__Grade__r.Name');
    expect(soql).not.toContain('MANAERP__Lesson_Capacity__c');
    expect(soql).not.toContain('Enrollment_Status__r');
    expect(soql).not.toMatch(/\bGrade__c\b/);
    expect(buildCenterStudentSoql('001ACC')).toBe(soql);
  });

  it('builds enrollment status SOQL for second step', () => {
    const soql = buildCenterEnrollmentStatusSoql(['a0E1', 'a0E2']);
    expect(soql).toContain('MANAERP__Enrollment_Status__c');
    expect(soql).toContain("'a0E1'");
  });

  it('builds teacher SOQL via Affiliation', () => {
    const soql = buildCenterTeacherSoql('001ACC');
    expect(soql).toContain('MANAERP__Affiliation__c');
    expect(soql).toContain("RecordType.Name = 'Staff'");
  });

  it('loads center scoped students filtered to Enrolled+Temporary', async () => {
    const catalog = await loadCenterScopedCatalog('001ACC', '教室A');
    expect(catalog.students).toHaveLength(2);
    expect(catalog.teachers).toHaveLength(1);
    expect(catalog.students.map((s) => s.name)).toEqual(['体験生', '田中']);
    expect(catalog.students[0]?.fields?.enrollmentStatus).toBe('Temporary');
  });

  it('studentsForPicker uses center when loaded ok', () => {
    const center = {
      accountId: '001',
      classroomName: 'A',
      students: [{ id: '1', name: 'Scoped' }],
      teachers: [],
      loadedAt: '',
    };
    expect(studentsForPicker(center, [{ id: '2', name: 'Global' }])).toEqual(center.students);
  });

  it('studentsForPicker does not fallback when studentLoadError', () => {
    const center = {
      accountId: '001',
      classroomName: 'A',
      students: [],
      teachers: [],
      loadedAt: '',
      studentLoadError: 'API failed',
    };
    expect(studentsForPicker(center, [{ id: '2', name: 'Global' }])).toEqual([]);
  });

  it('studentsForPicker returns empty center list when legitimately zero', () => {
    const center = {
      accountId: '001',
      classroomName: 'A',
      students: [],
      teachers: [],
      loadedAt: '',
    };
    expect(studentsForPicker(center, [{ id: '2', name: 'Global' }])).toEqual([]);
  });

  it('enrolledStudentNamesForReport uses center scoped students only', () => {
    const center = {
      accountId: '001',
      classroomName: 'A',
      students: [{ id: '1', name: '在籍生' }],
      teachers: [],
      loadedAt: '',
    };
    const global = [
      { id: '2', name: '退会生' },
      { id: '3', name: '在籍生' },
    ];
    expect(enrolledStudentNamesForReport(center, global, ['退会生', '体験生'])).toEqual(['在籍生']);
  });

  it('enrolledStudentNamesForReport falls back to booth names without center', () => {
    expect(enrolledStudentNamesForReport(null, [{ id: '1', name: 'Global' }], ['コマ組のみ'])).toEqual([
      'コマ組のみ',
    ]);
  });
});
