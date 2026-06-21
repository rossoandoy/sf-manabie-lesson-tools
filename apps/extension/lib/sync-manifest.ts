import type { ExecutionLog, LessonSlotSourceRow, StudentSessionSourceRow } from '../src/contracts';
import type { ReallocationSourceRow } from '../src/contracts';
import type { PrintSheetRow } from './booth-print-sheet';
import type { BoothGridSession } from './booth-session-state';
import type { SlotSyncEntry } from './slot-sync-state';

export type SyncLayerKind = 'slot' | 'attendance' | 'reallocation';

export interface SyncLayer {
  status: 'synced' | 'failed';
  syncedAt: string;
  salesforceId?: string;
  contentHash: string;
}

export interface SlotSyncManifestEntry {
  slot?: SyncLayer;
  attendance?: SyncLayer;
  reallocation?: SyncLayer;
}

export type SyncManifest = Record<string, SlotSyncManifestEntry>;

export type LayerVisualState = 'none' | 'synced' | 'stale' | 'failed';

export interface SyncVisualState {
  slot: LayerVisualState;
  attendance: LayerVisualState;
  reallocation: LayerVisualState;
  overall: LayerVisualState;
}

function stableHash(parts: (string | number | boolean | undefined)[]): string {
  return parts.map((part) => String(part ?? '')).join('\u001f');
}

export function hashSlotLayer(row: Pick<
  PrintSheetRow,
  'studentName' | 'grade' | 'subject' | 'teacherName' | 'lessonKind' | 'note' | 'slotKey'
>): string {
  return stableHash([
    row.studentName,
    row.grade,
    row.subject,
    row.teacherName,
    row.lessonKind,
    row.note,
    row.slotKey,
  ]);
}

export function hashAttendanceLayer(row: {
  attendance?: string;
  note?: string;
  boothAttendance?: string;
}): string {
  const attendance = row.attendance ?? row.boothAttendance ?? '';
  return stableHash([attendance, row.note ?? '']);
}

export function hashReallocationLayer(
  row: Pick<PrintSheetRow, 'attendance' | 'transferFrom' | 'transferTo'>,
): string {
  if (row.attendance !== '振替' || !row.transferFrom?.trim()) return '';
  return stableHash([row.attendance, row.transferFrom, row.transferTo]);
}

function layerVisual(
  layer: SyncLayer | undefined,
  currentHash: string,
  required: boolean,
): LayerVisualState {
  if (!layer) return required ? 'none' : 'none';
  if (layer.status === 'failed') return 'failed';
  if (!currentHash) return 'none';
  if (layer.contentHash !== currentHash) return 'stale';
  return 'synced';
}

function maxSeverity(states: LayerVisualState[]): LayerVisualState {
  if (states.includes('failed')) return 'failed';
  if (states.includes('stale')) return 'stale';
  if (states.includes('synced')) return 'synced';
  return 'none';
}

export function resolveSyncVisual(row: PrintSheetRow, entry?: SlotSyncManifestEntry): SyncVisualState {
  const slotHash = hashSlotLayer(row);
  const attendanceHash = hashAttendanceLayer(row);
  const reallocationHash = hashReallocationLayer(row);
  const slot = layerVisual(entry?.slot, slotHash, true);
  const attendance = layerVisual(entry?.attendance, attendanceHash, Boolean(row.studentName.trim()));
  const reallocation = layerVisual(
    entry?.reallocation,
    reallocationHash,
    row.attendance === '振替' && Boolean(row.transferFrom?.trim()),
  );
  return {
    slot,
    attendance,
    reallocation,
    overall: maxSeverity([slot, attendance, reallocation]),
  };
}

export function syncVisualAriaLabel(visual: SyncVisualState): string {
  const parts: string[] = [];
  if (visual.slot === 'synced') parts.push('F19 同期済');
  else if (visual.slot === 'stale') parts.push('F19 要再同期');
  else if (visual.slot === 'failed') parts.push('F19 失敗');
  if (visual.attendance === 'synced') parts.push('3B 同期済');
  else if (visual.attendance === 'stale') parts.push('3B 要再同期');
  else if (visual.attendance === 'failed') parts.push('3B 失敗');
  if (visual.reallocation === 'synced') parts.push('3C 同期済');
  else if (visual.reallocation === 'stale') parts.push('3C 要再同期');
  else if (visual.reallocation === 'failed') parts.push('3C 失敗');
  return parts.length ? parts.join(' / ') : '未同期';
}

export function renderSyncDotsHtml(visual: SyncVisualState): string {
  const segment = (state: LayerVisualState, label: string): string => {
    const cls =
      state === 'synced'
        ? 'sync-dot-seg ok'
        : state === 'stale'
          ? 'sync-dot-seg stale'
          : state === 'failed'
            ? 'sync-dot-seg fail'
            : 'sync-dot-seg empty';
    return `<span class="${cls}" title="${label}"></span>`;
  };
  if (visual.overall === 'none') return '<span class="muted">—</span>';
  return `<span class="sync-dot-stack" aria-label="${syncVisualAriaLabel(visual)}">${segment(visual.slot, 'F19')}${segment(visual.attendance, '3B')}${segment(visual.reallocation, '3C')}</span>`;
}

export function rowNeedsSync(visual: SyncVisualState): boolean {
  return visual.overall === 'none' || visual.overall === 'stale' || visual.overall === 'failed';
}

export function migrateSlotSyncStateToManifest(
  slotSyncState?: Record<string, SlotSyncEntry>,
): SyncManifest {
  if (!slotSyncState) return {};
  const manifest: SyncManifest = {};
  for (const [slotKey, entry] of Object.entries(slotSyncState)) {
    manifest[slotKey] = {
      slot: {
        status: entry.status,
        syncedAt: entry.syncedAt,
        salesforceId: entry.salesforceId,
        contentHash: entry.contentHash ?? '',
      },
    };
  }
  return manifest;
}

export function normalizeSessionManifest(session: BoothGridSession): BoothGridSession {
  if (session.syncManifest) {
    return session.slotSyncState ? { ...session, slotSyncState: undefined } : session;
  }
  if (!session.slotSyncState) return session;
  return {
    ...session,
    syncManifest: migrateSlotSyncStateToManifest(session.slotSyncState),
    slotSyncState: undefined,
  };
}

function upsertLayer(
  manifest: SyncManifest,
  slotKey: string,
  kind: SyncLayerKind,
  layer: SyncLayer,
): SyncManifest {
  return {
    ...manifest,
    [slotKey]: {
      ...(manifest[slotKey] ?? {}),
      [kind]: layer,
    },
  };
}

export function applySlotSyncToManifest(
  session: BoothGridSession,
  log: ExecutionLog,
  sourceRows: LessonSlotSourceRow[],
): BoothGridSession {
  const slotBatch = log.batchLogs.find((batch) => batch.artifactKind === 'lessonSlot');
  if (!slotBatch) return session;

  const syncedAt = log.finishedAt ?? log.startedAt;
  let manifest: SyncManifest = { ...(session.syncManifest ?? {}) };

  for (const rowResult of slotBatch.rowResults) {
    const indexMatch = rowResult.localRef.match(/^slot-(\d+)-/);
    const index = indexMatch ? Number(indexMatch[1]) : -1;
    const sourceRow = index >= 0 ? sourceRows[index] : undefined;
    if (!sourceRow) continue;

    const layer: SyncLayer = rowResult.success
      ? {
          status: 'synced',
          syncedAt,
          salesforceId: rowResult.salesforceId,
          contentHash: hashSlotLayer(sourceRow),
        }
      : {
          status: 'failed',
          syncedAt,
          contentHash: hashSlotLayer(sourceRow),
        };
    manifest = upsertLayer(manifest, sourceRow.localSlotKey, 'slot', layer);
  }

  return { ...session, syncManifest: manifest };
}

export function applyStudentSessionSyncToManifest(
  session: BoothGridSession,
  log: ExecutionLog,
  sourceRows: StudentSessionSourceRow[],
): BoothGridSession {
  const batch = log.batchLogs.find((item) => item.artifactKind === 'studentSession');
  if (!batch) return session;

  const syncedAt = log.finishedAt ?? log.startedAt;
  let manifest: SyncManifest = { ...(session.syncManifest ?? {}) };

  for (const rowResult of batch.rowResults) {
    const indexMatch = rowResult.localRef.match(/^ss-(\d+)-/);
    const index = indexMatch ? Number(indexMatch[1]) : -1;
    const sourceRow = index >= 0 ? sourceRows[index] : undefined;
    if (!sourceRow?.localSlotKey) continue;

    const layer: SyncLayer = rowResult.success
      ? {
          status: 'synced',
          syncedAt,
          salesforceId: rowResult.salesforceId,
          contentHash: hashAttendanceLayer(sourceRow),
        }
      : {
          status: 'failed',
          syncedAt,
          contentHash: hashAttendanceLayer(sourceRow),
        };
    manifest = upsertLayer(manifest, sourceRow.localSlotKey, 'attendance', layer);
  }

  return { ...session, syncManifest: manifest };
}

export function applyStudentSessionCreateToManifest(
  session: BoothGridSession,
  log: ExecutionLog,
  sourceRows: StudentSessionSourceRow[],
): BoothGridSession {
  const batch = log.batchLogs.find((item) => item.artifactKind === 'studentSessionCreate');
  if (!batch) return session;

  const syncedAt = log.finishedAt ?? log.startedAt;
  let manifest: SyncManifest = { ...(session.syncManifest ?? {}) };

  for (const rowResult of batch.rowResults) {
    const indexMatch = rowResult.localRef.match(/^ss-create-(\d+)-/);
    const index = indexMatch ? Number(indexMatch[1]) : -1;
    const sourceRow = index >= 0 ? sourceRows[index] : undefined;
    if (!sourceRow?.localSlotKey) continue;

    const layer: SyncLayer = rowResult.success
      ? {
          status: 'synced',
          syncedAt,
          salesforceId: rowResult.salesforceId,
          contentHash: hashAttendanceLayer(sourceRow),
        }
      : {
          status: 'failed',
          syncedAt,
          contentHash: hashAttendanceLayer(sourceRow),
        };
    manifest = upsertLayer(manifest, sourceRow.localSlotKey, 'attendance', layer);
  }

  return { ...session, syncManifest: manifest };
}

export function applyReallocationSyncToManifest(
  session: BoothGridSession,
  log: ExecutionLog,
  sourceRows: ReallocationSourceRow[],
): BoothGridSession {
  const batch = log.batchLogs.find((item) => item.artifactKind === 'reallocation');
  if (!batch) return session;

  const syncedAt = log.finishedAt ?? log.startedAt;
  let manifest: SyncManifest = { ...(session.syncManifest ?? {}) };

  for (const rowResult of batch.rowResults) {
    const indexMatch = rowResult.localRef.match(/^realloc-(\d+)-/);
    const index = indexMatch ? Number(indexMatch[1]) : -1;
    const sourceRow = index >= 0 ? sourceRows[index] : undefined;
    if (!sourceRow?.localSlotKey) continue;

    const layer: SyncLayer = rowResult.success
      ? {
          status: 'synced',
          syncedAt,
          salesforceId: rowResult.salesforceId,
          contentHash: hashReallocationLayer(sourceRow),
        }
      : {
          status: 'failed',
          syncedAt,
          contentHash: hashReallocationLayer(sourceRow),
        };
    manifest = upsertLayer(manifest, sourceRow.localSlotKey, 'reallocation', layer);
  }

  return { ...session, syncManifest: manifest };
}

export function periodCellSyncClass(
  manifest: SyncManifest | undefined,
  slotKey: string,
  row: PrintSheetRow | undefined,
): string {
  if (!row) return '';
  const visual = resolveSyncVisual(row, manifest?.[slotKey]);
  if (visual.overall === 'failed') return 'cell-state-warning';
  if (visual.overall === 'stale') return 'cell-state-stale';
  if (visual.overall === 'synced') return 'cell-state-synced';
  return '';
}
