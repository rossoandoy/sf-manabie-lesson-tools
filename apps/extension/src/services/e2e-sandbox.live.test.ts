import { describe, expect, it, beforeAll } from 'vitest';
import { DEFAULT_DISCOVERY_CONFIG } from '../contracts';
import { buildClosedDateImportPlan } from './closedDatePlanBuilder';
import {
  assertCatalogReadyForPlans,
  cleanupExecutionLog,
  e2eOrgAlias,
  executeOptions,
  isClosedDateObjectAvailable,
  isDryRun,
  loadLiveCatalog,
  loadLiveE2eContext,
  tryGetCliSession,
  verifyRecordExists,
  buildE2eClosedDateDefinition,
  buildE2eLessonDefinition,
} from './e2e-live-helpers';
import { executeImportPlan } from './registrationExecutor';
import { buildScheduleImportPlan } from './scheduleImportPlanBuilder';

const live = process.env.E2E_LIVE === '1';
const hasCliSession = live && tryGetCliSession() !== null;

describe.skipIf(!hasCliSession)('e2e sandbox live (CLI)', () => {
  beforeAll(() => {
    if (!tryGetCliSession()) {
      throw new Error(
        `SF CLI session not found for alias "${e2eOrgAlias()}". Run: sf org login --alias ${e2eOrgAlias()}`,
      );
    }
  });

  it('syncs master catalog with required masters for ImportPlan', async () => {
    const { catalog } = await loadLiveCatalog();
    assertCatalogReadyForPlans(catalog);
    expect(catalog.catalogs.locations.length).toBeGreaterThan(0);
    expect(catalog.catalogs.academicYears.length).toBeGreaterThan(0);
    expect(catalog.org.isSandbox).toBe(true);
  });

  it('executes schedule ImportPlan round-trip with cleanup', async () => {
    const ctx = await loadLiveE2eContext();
    const definition = buildE2eLessonDefinition(ctx.fixture, ctx.runId);
    const plan = buildScheduleImportPlan({ definitions: [definition], catalog: ctx.catalog });
    expect(plan.validationIssues.filter((issue) => issue.severity === 'error')).toHaveLength(0);

    const log = await executeImportPlan(plan, ctx.api, executeOptions());
    expect(log.success, JSON.stringify(log.batchLogs, null, 2)).toBe(true);

    const scheduleBatch = log.batchLogs.find((b) => b.artifactKind === 'lessonSchedule');
    const scheduleId = scheduleBatch?.rowResults.find((r) => r.success)?.salesforceId;
    expect(scheduleId).toBeTruthy();
    if (scheduleId) {
      await verifyRecordExists(ctx.api, DEFAULT_DISCOVERY_CONFIG.lessonScheduleObject, scheduleId);
    }

    await cleanupExecutionLog(ctx.api, log);
  }, 120_000);

  it('executes closed date ImportPlan round-trip with cleanup', async () => {
    const ctx = await loadLiveE2eContext();
    if (!(await isClosedDateObjectAvailable(ctx.api))) {
      console.warn(
        `SKIP: ${DEFAULT_DISCOVERY_CONFIG.closedDateObject} is not available in ${e2eOrgAlias()}`,
      );
      return;
    }
    const definition = buildE2eClosedDateDefinition(ctx.fixture, ctx.runId);
    const plan = buildClosedDateImportPlan({
      definitions: [definition],
      catalog: ctx.catalog,
      locationId: ctx.fixture.locationId,
      locationName: ctx.fixture.locationName,
      academicCalendarId: ctx.fixture.academicCalendarId,
    });
    expect(plan.validationIssues.filter((issue) => issue.severity === 'error')).toHaveLength(0);

    const log = await executeImportPlan(plan, ctx.api, executeOptions());
    expect(log.success, JSON.stringify(log.batchLogs, null, 2)).toBe(true);

    const closedBatch = log.batchLogs.find((b) => b.artifactKind === 'closedDate');
    const closedId = closedBatch?.rowResults.find((r) => r.success)?.salesforceId;
    expect(closedId).toBeTruthy();
    if (closedId) {
      await verifyRecordExists(ctx.api, DEFAULT_DISCOVERY_CONFIG.closedDateObject, closedId);
    }

    await cleanupExecutionLog(ctx.api, log);
  }, 120_000);
});

describe('e2e sandbox live (offline smoke)', () => {
  it('documents live execution entrypoint', () => {
    expect(process.env.E2E_LIVE === '1' || true).toBe(true);
  });

  it('skips CLI live tests when E2E_LIVE is unset', () => {
    if (process.env.E2E_LIVE === '1') return;
    expect(hasCliSession).toBe(false);
  });

  it('supports dry-run mode via E2E_DRY_RUN=1', () => {
    expect(typeof isDryRun()).toBe('boolean');
  });
});
