import { describe, expect, it } from 'vitest';
import type { PrintSheetRow } from './booth-print-sheet';
import {
  applySlotSyncToManifest,
  hashAttendanceLayer,
  hashReallocationLayer,
  hashSlotLayer,
  migrateSlotSyncStateToManifest,
  renderSyncDotsHtml,
  resolveSyncVisual,
  rowNeedsSync,
} from './sync-manifest';
import type { ExecutionLog } from '../src/contracts';

const baseRow: PrintSheetRow = {
  date: '2026-06-10',
  dayOfWeek: '水',
  booth: 1,
  period: 1,
  seat: 1,
  studentName: '山田',
  grade: '中2',
  subject: '英語',
  teacherName: 'Smith',
  lessonKind: '通常',
  studentType: '在籍',
  note: '',
  capacity: '1:2',
  slotKey: '2026-06-10|B1|P1|S1',
  attendance: '出席',
};

describe('sync-manifest', () => {
  it('hashSlotLayer changes when student changes', () => {
    const a = hashSlotLayer(baseRow);
    const b = hashSlotLayer({ ...baseRow, studentName: '佐藤' });
    expect(a).not.toBe(b);
  });

  it('resolveSyncVisual marks stale when hash mismatches', () => {
    const visual = resolveSyncVisual(baseRow, {
      slot: {
        status: 'synced',
        syncedAt: '2026-06-20',
        contentHash: hashSlotLayer({ ...baseRow, studentName: 'old' }),
      },
    });
    expect(visual.slot).toBe('stale');
    expect(visual.overall).toBe('stale');
  });

  it('resolveSyncVisual marks synced when hash matches', () => {
    const visual = resolveSyncVisual(baseRow, {
      slot: { status: 'synced', syncedAt: '2026-06-20', contentHash: hashSlotLayer(baseRow) },
      attendance: {
        status: 'synced',
        syncedAt: '2026-06-20',
        contentHash: hashAttendanceLayer(baseRow),
      },
    });
    expect(visual.overall).toBe('synced');
    expect(rowNeedsSync(visual)).toBe(false);
  });

  it('renderSyncDotsHtml uses segments without text', () => {
    const html = renderSyncDotsHtml({
      slot: 'synced',
      attendance: 'none',
      reallocation: 'none',
      overall: 'synced',
    });
    expect(html).toContain('sync-dot-stack');
    expect(html).toContain('aria-label');
    expect(html).not.toContain('sync-badge');
  });

  it('migrateSlotSyncStateToManifest preserves slot layer', () => {
    const manifest = migrateSlotSyncStateToManifest({
      '2026-06-10|B1|P1|S1': { status: 'synced', syncedAt: '2026-06-20' },
    });
    expect(manifest['2026-06-10|B1|P1|S1']?.slot?.status).toBe('synced');
  });

  it('applySlotSyncToManifest writes content hash', () => {
    const log: ExecutionLog = {
      planId: 'p1',
      startedAt: '2026-06-20T00:00:00.000Z',
      finishedAt: '2026-06-20T00:00:01.000Z',
      success: true,
      batchLogs: [
        {
          batchId: 'b1',
          artifactKind: 'lessonSlot',
          sobjectApiName: 'Lesson_Slot__c',
          operation: 'upsert',
          rowResults: [{ localRef: 'slot-0-key', success: true, salesforceId: 'a01' }],
        },
      ],
    };
    const updated = applySlotSyncToManifest(
      { settings: {} as never, cells: [], slotMeta: [], repeatRecords: [] },
      log,
      [
        {
          localSlotKey: '2026-06-10|B1|P1|S1',
          date: '2026-06-10',
          booth: 1,
          period: 1,
          seat: 1,
          studentName: '山田',
          subject: '英語',
          grade: '中2',
          teacherName: 'Smith',
          lessonKind: '通常',
          note: '',
          slotKey: '2026-06-10|B1|P1|S1',
        },
      ],
    );
    expect(updated.syncManifest?.['2026-06-10|B1|P1|S1']?.slot?.contentHash).toBeTruthy();
  });

  it('hashReallocationLayer empty for non-transfer rows', () => {
    expect(hashReallocationLayer(baseRow)).toBe('');
    expect(
      hashReallocationLayer({ ...baseRow, attendance: '振替', transferFrom: '2026-06-01', transferTo: '2026-06-10' }),
    ).toBeTruthy();
  });
});
