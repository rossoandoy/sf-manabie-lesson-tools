import { describe, expect, it } from 'vitest';
import type { ClosedDateDefinition, LessonMasterCatalog } from '../contracts';
import { buildClosedDateImportPlan, closedDateDefinitionsToCsv } from './closedDatePlanBuilder';

const catalog: LessonMasterCatalog = {
  org: { orgId: '00DTEST', username: 'test@example.com', isSandbox: true },
  syncedAt: new Date().toISOString(),
  catalogs: {
    locations: [{ id: '001', name: '大森北校', fields: { MANAERP__Academic_Calendar__c: 'AC1' } }],
    academicYears: [{ id: 'AY1', name: '2026' }],
    locationCourses: [],
    classes: [],
    classrooms: [],
    teachers: [],
    students: [],
    academicCalendars: [{ id: 'AC1', name: 'Default Calendar' }],
  },
};

const closed: ClosedDateDefinition = {
  id: 'c1',
  title: '運動会',
  date: '2026-10-15',
  academicYearId: 'AY1',
  academicYearName: '2026',
};

describe('closedDatePlanBuilder', () => {
  it('builds closed date and junction batches', () => {
    const plan = buildClosedDateImportPlan({
      definitions: [closed],
      catalog,
      locationId: '001',
      locationName: '大森北校',
      academicCalendarId: 'AC1',
    });
    expect(plan.batches).toHaveLength(2);
    expect(plan.batches[1]?.dependsOn).toContain('batch-closed-date');
  });

  it('exports legacy CSV format', () => {
    const csv = closedDateDefinitionsToCsv([closed]);
    expect(csv.split('\n')[0]).toBe('休校日,日付,年度');
    expect(csv).toContain('運動会');
  });
});
