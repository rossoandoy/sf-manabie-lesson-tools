import { describe, expect, it, beforeAll } from 'vitest';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import type { BoothGridSettings } from '../../lib/booth-session-state';
import { buildLessonSlotImportPlan } from './slotImportPlanBuilder';
import {
  cleanupExecutionLog,
  e2eOrgAlias,
  executeOptions,
  loadLiveCatalog,
  tryGetCliSession,
  verifyRecordExists,
} from './e2e-live-helpers';
import { executeImportPlan } from './registrationExecutor';
import { DEFAULT_DISCOVERY_CONFIG } from '../contracts';

const live = process.env.E2E_LIVE === '1';
const hasCliSession = live && tryGetCliSession() !== null;

function makePrintRow(partial: Partial<PrintSheetRow> & Pick<PrintSheetRow, 'date' | 'studentName'>): PrintSheetRow {
  return {
    dayOfWeek: '月',
    booth: 1,
    period: 1,
    seat: 1,
    grade: '小5',
    subject: 'E2E',
    teacherName: 'E2E講師',
    lessonKind: '通常',
    studentType: '在籍',
    note: '',
    capacity: '1:2',
    slotKey: `${partial.date}|B1|P1|S1`,
    attendance: '出席',
    countTarget: true,
    ...partial,
  };
}

describe.skipIf(!hasCliSession)('e2e lesson slot sandbox live (CLI)', () => {
  beforeAll(() => {
    if (!tryGetCliSession()) {
      throw new Error(
        `SF CLI session not found for alias "${e2eOrgAlias()}". Run: sf org login --alias ${e2eOrgAlias()}`,
      );
    }
  });

  it('upserts Lesson_Slot__c with Phase 2G columns and verifies fields', async () => {
    const { catalog, api } = await loadLiveCatalog();
    const location = catalog.catalogs.locations[0];
    if (!location) throw new Error('E2E slot: no locations in catalog');

    const runId = `e2e-slot-${Date.now()}`;
    const settings: BoothGridSettings = {
      classroomName: 'E2E',
      accountId: location.id,
      boothCount: 1,
      periodCount: 1,
      hideSunday: true,
      oneToOneMode: false,
      fiscalYear: '2026',
      visiblePeriods: [1],
    };
    const rows: PrintSheetRow[] = [
      makePrintRow({
        date: '2030-01-15',
        studentName: runId,
        slotKey: '2030-01-15|B1|P1|S1',
      }),
    ];

    const plan = buildLessonSlotImportPlan({
      rows,
      settings,
      catalog,
      accountName: location.name,
    });
    expect(plan.validationIssues.filter((issue) => issue.severity === 'error')).toHaveLength(0);
    const record = plan.batches[0]?.records[0]?.fields ?? {};
    const slotFields = DEFAULT_DISCOVERY_CONFIG.fields.lessonSlot;
    expect(record[slotFields.grade]).toBe('小5');
    expect(record[slotFields.teacherName]).toBe('E2E講師');

    const log = await executeImportPlan(plan, api, executeOptions());
    expect(log.success, JSON.stringify(log.batchLogs, null, 2)).toBe(true);

    const slotBatch = log.batchLogs.find((b) => b.artifactKind === 'lessonSlot');
    const slotId = slotBatch?.rowResults.find((r) => r.success)?.salesforceId;
    expect(slotId).toBeTruthy();
    if (slotId) {
      await verifyRecordExists(api, 'Lesson_Slot__c', slotId);
    }

    await cleanupExecutionLog(api, log);
  }, 120_000);
});
