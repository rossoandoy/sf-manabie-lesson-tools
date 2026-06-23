import { describe, expect, it, beforeAll } from 'vitest';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import type { BoothGridSettings } from '../../lib/booth-session-state';
import { DEFAULT_DISCOVERY_CONFIG } from '../contracts';
import {
  buildLessonDayIndex,
  buildManaerpLessonQuerySoql,
  queryManaerpLessonSessions,
} from './manaerpLessonQueryService';
import { buildReallocationPlan } from './reallocationPlanBuilder';
import { executeImportPlan } from './registrationExecutor';
import { e2eOrgAlias, executeOptions, loadLiveCatalog, tryGetCliSession } from './e2e-live-helpers';

const live = process.env.E2E_LIVE === '1';
const hasCliSession = live && tryGetCliSession() !== null;

const settings: BoothGridSettings = {
  classroomName: 'E2E',
  accountId: '',
  boothCount: 2,
  periodCount: 3,
  hideSunday: true,
  oneToOneMode: false,
  fiscalYear: '2026',
  visiblePeriods: [1, 2, 3],
};

describe.skipIf(!hasCliSession)('e2e reallocation sandbox live (CLI)', () => {
  beforeAll(() => {
    if (!tryGetCliSession()) {
      throw new Error(
        `SF CLI session not found for alias "${e2eOrgAlias()}". Run: sf org login --alias ${e2eOrgAlias()}`,
      );
    }
  });

  it('creates reallocation when original session and destination lesson exist, then deletes', async () => {
    const { api, catalog } = await loadLiveCatalog();
    const fixtureLocation = catalog.catalogs.locations[0];
    if (!fixtureLocation) return;

    settings.accountId = fixtureLocation.id;
    const dateFrom = '2026-04-01';
    const dateTo = '2026-06-30';
    const soql = buildManaerpLessonQuerySoql({
      accountId: fixtureLocation.id,
      dateFrom,
      dateTo,
    });
    const { records } = await api.query<Record<string, unknown>>(soql);
    const lessonDayIndex = buildLessonDayIndex(records);
    const sessions = await queryManaerpLessonSessions(api, {
      accountId: fixtureLocation.id,
      dateFrom,
      dateTo,
    });

    const original = sessions.find((session) => session.sessionId && session.lessonId);
    if (!original) return;

    let transferTo = '';
    let newLessonId = '';
    for (const [date, entries] of lessonDayIndex.entries()) {
      if (date <= original.date) continue;
      if (entries.length !== 1) continue;
      transferTo = date;
      newLessonId = entries[0]!.lessonId;
      break;
    }
    if (!transferTo || !newLessonId) return;

    const row: PrintSheetRow = {
      date: transferTo,
      dayOfWeek: '金',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: original.studentName,
      grade: '',
      subject: original.subject ?? '',
      teacherName: '',
      lessonKind: original.lessonKind ?? '通常',
      studentType: '在籍',
      note: '',
      capacity: original.capacity,
      slotKey: `${transferTo}|B1|P1|S1`,
      attendance: '振替',
      transferFrom: original.date,
      transferTo,
      countTarget: false,
    };

    const plan = buildReallocationPlan({
      rows: [row],
      sessions,
      lessonDayIndex,
      settings,
      catalog,
      accountName: fixtureLocation.name,
    });
    if (plan.createCount === 0) return;

    const log = await executeImportPlan(plan, api, executeOptions());
    expect(log.success).toBe(true);

    const createdId = log.batchLogs[0]?.rowResults.find((rowResult) => rowResult.success)?.salesforceId;
    expect(createdId).toBeTruthy();

    if (createdId) {
      await api.deleteRecord(DEFAULT_DISCOVERY_CONFIG.reallocationObject!, createdId);
    }
  }, 120_000);
});
