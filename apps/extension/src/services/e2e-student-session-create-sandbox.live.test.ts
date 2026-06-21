import { describe, expect, it, beforeAll } from 'vitest';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import type { BoothGridSettings } from '../../lib/booth-session-state';
import { DEFAULT_DISCOVERY_CONFIG } from '../contracts';
import {
  buildLessonDayIndex,
  buildManaerpLessonQuerySoql,
  queryManaerpLessonSessions,
} from './manaerpLessonQueryService';
import { buildStudentSessionCreatePlan } from './studentSessionCreatePlanBuilder';
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

describe.skipIf(!hasCliSession)('e2e student session create sandbox live (CLI)', () => {
  beforeAll(() => {
    if (!tryGetCliSession()) {
      throw new Error(
        `SF CLI session not found for alias "${e2eOrgAlias()}". Run: sf org login --alias ${e2eOrgAlias()}`,
      );
    }
  });

  it('creates missing student session when lesson exists, then deletes', async () => {
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

    let targetDate = '';
    let targetStudent = catalog.catalogs.students[0];
    for (const [date, entries] of lessonDayIndex.entries()) {
      if (entries.length !== 1) continue;
      const entry = entries[0]!;
      const candidate = catalog.catalogs.students.find(
        (student) => student.name.trim() && !entry.studentNames.has(student.name.trim()),
      );
      if (candidate) {
        targetDate = date;
        targetStudent = candidate;
        break;
      }
    }
    if (!targetDate || !targetStudent) return;

    const row: PrintSheetRow = {
      date: targetDate,
      dayOfWeek: '月',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: targetStudent.name,
      grade: '',
      subject: '',
      teacherName: '',
      lessonKind: '通常',
      studentType: '在籍',
      note: '',
      capacity: '1:2',
      slotKey: `${targetDate}|B1|P1|S1`,
      attendance: '出席',
      countTarget: true,
    };

    const plan = buildStudentSessionCreatePlan({
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
      await api.deleteRecord(DEFAULT_DISCOVERY_CONFIG.studentSessionObject!, createdId);
    }
  }, 120_000);
});
