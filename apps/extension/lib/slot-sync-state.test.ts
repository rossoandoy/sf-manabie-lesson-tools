import { describe, expect, it } from 'vitest';
import type { ExecutionLog } from '../src/contracts';
import type { BoothGridSession } from './booth-session-state';
import { applySlotSyncFromExecutionLog, syncStatusLabel } from './slot-sync-state';

const baseSession: BoothGridSession = {
  settings: {
    classroomName: 'A',
    accountId: '001',
    boothCount: 1,
    periodCount: 1,
    hideSunday: true,
    oneToOneMode: false,
    fiscalYear: '2026',
    visiblePeriods: [1],
  },
  cells: [],
  slotMeta: [],
  repeatRecords: [],
};

describe('slot-sync-state', () => {
  it('syncStatusLabel returns labels', () => {
    expect(syncStatusLabel(undefined)).toBe('');
    expect(syncStatusLabel({ status: 'synced', syncedAt: '2026-01-01' })).toBe('同期済');
    expect(
      syncStatusLabel({ status: 'failed', syncedAt: '2026-01-01', errorMessage: 'dup' }),
    ).toBe('失敗: dup');
  });

  it('applySlotSyncFromExecutionLog maps row results by local slot key', () => {
    const log: ExecutionLog = {
      planId: 'p1',
      startedAt: '2026-06-20T00:00:00.000Z',
      finishedAt: '2026-06-20T00:00:01.000Z',
      success: true,
      batchLogs: [
        {
          batchId: 'batch-lesson-slot',
          artifactKind: 'lessonSlot',
          sobjectApiName: 'Lesson_Slot__c',
          operation: 'upsert',
          rowResults: [
            { localRef: 'slot-0-001_key', success: true, salesforceId: 'a01XX' },
            { localRef: 'slot-1-002_key', success: false, errorMessage: 'FIELD_INTEGRITY' },
          ],
        },
      ],
    };
    const updated = applySlotSyncFromExecutionLog(baseSession, log, [
      {
        localSlotKey: '2026-06-10|B1|P1|S1',
        date: '2026-06-10',
        booth: 1,
        period: 1,
        seat: 1,
        studentName: '山田',
        subject: '英語',
      },
      {
        localSlotKey: '2026-06-11|B1|P1|S1',
        date: '2026-06-11',
        booth: 1,
        period: 1,
        seat: 1,
        studentName: '佐藤',
        subject: '数学',
      },
    ]);
    expect(updated.syncManifest?.['2026-06-10|B1|P1|S1']?.slot?.status).toBe('synced');
    expect(updated.syncManifest?.['2026-06-11|B1|P1|S1']?.slot?.status).toBe('failed');
  });
});
