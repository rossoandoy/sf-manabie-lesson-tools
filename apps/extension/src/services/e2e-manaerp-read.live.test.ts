import { describe, expect, it, beforeAll } from 'vitest';
import { buildManaerpLessonQuerySoql, queryManaerpLessonSessions } from './manaerpLessonQueryService';
import { e2eOrgAlias, loadLiveCatalog, tryGetCliSession } from './e2e-live-helpers';

const live = process.env.E2E_LIVE === '1';
const hasCliSession = live && tryGetCliSession() !== null;

describe.skipIf(!hasCliSession)('e2e manaerp read sandbox live (CLI)', () => {
  beforeAll(() => {
    if (!tryGetCliSession()) {
      throw new Error(
        `SF CLI session not found for alias "${e2eOrgAlias()}". Run: sf org login --alias ${e2eOrgAlias()}`,
      );
    }
  });

  it('builds lesson + student session SOQL', () => {
    const soql = buildManaerpLessonQuerySoql({
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
    });
    expect(soql).toContain('MANAERP__Student_Sessions__r');
    expect(soql).toContain('MANAERP__Lesson__c');
  });

  it('queries MANAERP lessons without error', async () => {
    const { api } = await loadLiveCatalog();
    const rows = await queryManaerpLessonSessions(api, {
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
    });
    expect(Array.isArray(rows)).toBe(true);
  }, 120_000);
});
