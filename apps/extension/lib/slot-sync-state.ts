import type { ExecutionLog, LessonSlotSourceRow } from '../src/contracts';
import type { BoothGridSession } from './booth-session-state';
import { applySlotSyncToManifest } from './sync-manifest';

export interface SlotSyncEntry {
  status: 'synced' | 'failed';
  syncedAt: string;
  salesforceId?: string;
  errorMessage?: string;
  contentHash?: string;
}

export function syncStatusLabel(entry: SlotSyncEntry | undefined): string {
  if (!entry) return '';
  if (entry.status === 'synced') return '同期済';
  return entry.errorMessage ? `失敗: ${entry.errorMessage}` : '失敗';
}

export function applySlotSyncFromExecutionLog(
  session: BoothGridSession,
  log: ExecutionLog,
  sourceRows: LessonSlotSourceRow[],
): BoothGridSession {
  return applySlotSyncToManifest(session, log, sourceRows);
}
