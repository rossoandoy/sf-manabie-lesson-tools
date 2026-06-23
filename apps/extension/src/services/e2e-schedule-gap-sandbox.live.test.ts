import { describe, expect, it, beforeAll } from 'vitest';
import {
  buildLessonDatesQuerySoql,
  buildLessonScheduleOverlapQuerySoql,
  queryScheduleGapReport,
} from './lessonScheduleGapService';
import { e2eOrgAlias, loadLiveCatalog, tryGetCliSession } from './e2e-live-helpers';

const live = process.env.E2E_LIVE === '1';
const hasCliSession = live && tryGetCliSession() !== null;

describe.skipIf(!hasCliSession)('e2e schedule gap sandbox live (CLI)', () => {
  beforeAll(() => {
    if (!tryGetCliSession()) {
      throw new Error(
        `SF CLI session not found for alias "${e2eOrgAlias()}". Run: sf org login --alias ${e2eOrgAlias()}`,
      );
    }
  });

  it('builds lesson date and schedule overlap SOQL', () => {
    expect(buildLessonDatesQuerySoql({
      accountId: '001TEST',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
    })).toContain('MANAERP__Lesson__c');
    expect(buildLessonScheduleOverlapQuerySoql({
      accountId: '001TEST',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
    })).toContain('MANAERP__Lesson_Schedule__c');
  });

  it('queries schedule gap report without error', async () => {
    const { api, catalog } = await loadLiveCatalog();
    const location = catalog.catalogs.locations[0];
    if (!location) return;

    const report = await queryScheduleGapReport(api, {
      accountId: location.id,
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      daysWithBoothStudents: ['2026-04-10'],
    });
    expect(report.dateFrom).toBe('2026-04-01');
    expect(Array.isArray(report.warnings)).toBe(true);
  }, 120_000);
});
