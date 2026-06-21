import { describe, expect, it } from 'vitest';
import { renderSyncDock, summarizeExecutionLog } from './sync-dock-panel';
import type { ExecutionLog } from '../../src/contracts';

describe('renderSyncDock', () => {
  it('renders sync dock shell with title and sections', () => {
    const root = document.createElement('div');
    renderSyncDock(root, {
      catalog: null,
      isSandbox: true,
      slotPlan: null,
      studentSessionPlan: null,
      studentSessionLoading: false,
      scheduleGapReport: null,
    });
    expect(root.classList.contains('sync-dock')).toBe(true);
    expect(root.id).toBe('sync-dock-root');
    expect(root.textContent).toContain('Manabie 同期');
    expect(root.querySelector('.sync-dock-sync-host')).toBeTruthy();
  });

  it('shows prerequisite badges for master and sandbox', () => {
    const root = document.createElement('div');
    renderSyncDock(root, {
      catalog: {
        org: { orgId: '00D', username: 'u', isSandbox: true },
        syncedAt: new Date().toISOString(),
        catalogs: {
          locations: [],
          academicYears: [],
          locationCourses: [],
          classes: [],
          classrooms: [],
          teachers: [],
          students: [],
          academicCalendars: [],
        },
      },
      isSandbox: true,
      slotPlan: null,
      studentSessionPlan: null,
      studentSessionLoading: false,
      scheduleGapReport: null,
    });
    expect(root.textContent).toContain('マスタ同期済');
    expect(root.textContent).toContain('Sandbox');
  });

  it('renders execution summary when provided', () => {
    const root = document.createElement('div');
    renderSyncDock(root, {
      catalog: null,
      isSandbox: true,
      slotPlan: null,
      studentSessionPlan: null,
      studentSessionLoading: false,
      scheduleGapReport: null,
      executionSummary: '成功: 成功 3 件 / エラー 0 件',
    });
    expect(root.textContent).toContain('直近実行');
    expect(root.textContent).toContain('成功 3 件');
  });
});

describe('summarizeExecutionLog', () => {
  it('formats batch row counts', () => {
    const log: ExecutionLog = {
      planId: 'p1',
      startedAt: new Date().toISOString(),
      success: true,
      batchLogs: [
        {
          batchId: 'b1',
          artifactKind: 'studentSession',
          operation: 'update',
          sobjectApiName: 'MANAERP__Student_Sessions__c',
          rowResults: [
            { localRef: 'r1', success: true, salesforceId: 'a' },
            { localRef: 'r2', success: false, errorMessage: 'x' },
          ],
        },
      ],
    };
    expect(summarizeExecutionLog(log)).toBe('成功: 成功 1 件 / エラー 1 件');
  });
});
