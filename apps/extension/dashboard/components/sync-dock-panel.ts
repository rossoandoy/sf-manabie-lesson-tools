import type {
  ExecutionLog,
  LessonMasterCatalog,
  LessonSlotImportPlan,
  StudentSessionUpdatePlan,
} from '../../src/contracts';
import { renderMasterSyncSummary } from './master-sync-panel';
import { bindSlotSyncActions, renderSlotSyncSummary, type SlotSyncPanelOptions } from './slot-sync-panel';

export interface SyncDockOptions extends SlotSyncPanelOptions {
  catalog: LessonMasterCatalog | null;
  isSandbox: boolean;
  executionSummary?: string;
  manabieCacheStale?: boolean;
  manabieDataLoading?: boolean;
}

function renderManabieDataStatus(stale: boolean, loading: boolean): string {
  if (loading) {
    return '<span class="sync-dock-badge warn">Manabie データ更新中...</span>';
  }
  if (stale) {
    return '<span class="sync-dock-badge warn">Manabie データ要更新</span>';
  }
  return '<span class="sync-dock-badge ok">Manabie データ最新</span>';
}

function renderPrerequisites(
  catalog: LessonMasterCatalog | null,
  isSandbox: boolean,
  stale: boolean,
  loading: boolean,
): string {
  const masterHtml = catalog
    ? `<span class="sync-dock-badge ok">マスタ同期済</span>`
    : `<span class="sync-dock-badge warn">マスタ未同期</span>`;
  const sandboxHtml = isSandbox
    ? `<span class="sync-dock-badge sandbox">Sandbox</span>`
    : `<span class="sync-dock-badge warn">Production — 書き込み制限</span>`;
  const manabieHtml = renderManabieDataStatus(stale, loading);
  const refreshBtn = `<button type="button" id="btn-refresh-manabie-data" class="btn btn-sm" ${
    loading ? 'disabled' : ''
  }>Manabie データ更新</button>`;
  return `<div class="sync-dock-prereq">${masterHtml}${sandboxHtml}${manabieHtml}${refreshBtn}</div>`;
}

function renderExecutionSummary(summary: string | undefined): string {
  if (!summary?.trim()) {
    return '<p class="sync-dock-summary muted">直近の実行結果はまだありません。</p>';
  }
  return `<div class="sync-dock-summary"><strong>直近実行</strong><p>${summary}</p></div>`;
}

export function renderSyncDock(root: HTMLElement, options: SyncDockOptions): void {
  const prereqHost = document.createElement('div');
  prereqHost.className = 'sync-dock-prereq-host';
  prereqHost.innerHTML = renderPrerequisites(
    options.catalog,
    options.isSandbox,
    Boolean(options.manabieCacheStale),
    Boolean(options.manabieDataLoading),
  );

  const masterDetail = document.createElement('div');
  masterDetail.className = 'sync-dock-master-detail';
  renderMasterSyncSummary(masterDetail, options.catalog);

  const syncHost = document.createElement('div');
  syncHost.className = 'sync-dock-sync-host';
  renderSlotSyncSummary(syncHost, options);

  const summaryHost = document.createElement('div');
  summaryHost.className = 'sync-dock-exec-host';
  summaryHost.innerHTML = renderExecutionSummary(options.executionSummary);

  root.innerHTML = '';
  root.className = 'sync-dock panel-card';
  root.id = 'sync-dock-root';
  root.innerHTML = `<h2>SF 同期（Sync Dock）</h2><p class="muted sync-dock-lead">TRG コマデータ（F19 Lesson_Slot__c）を正本とします。Manabie 3B/3C は任意です。</p>`;
  root.append(prereqHost, masterDetail, syncHost, summaryHost);
}

export function summarizeExecutionLog(log: ExecutionLog | null | undefined): string {
  if (!log) return '';
  const ok = log.batchLogs.reduce((sum, b) => sum + b.rowResults.filter((r) => r.success).length, 0);
  const err = log.batchLogs.reduce((sum, b) => sum + b.rowResults.filter((r) => !r.success).length, 0);
  const status = log.success ? '成功' : '失敗';
  return `${status}: 成功 ${ok} 件 / エラー ${err} 件`;
}

export function bindSyncDockActions(
  root: HTMLElement,
  getOptions: () => SyncDockOptions,
  onLog: (text: string) => void,
  callbacks?: Parameters<typeof bindSlotSyncActions>[3] & {
    onRefreshManabieData?: () => void | Promise<void>;
  },
): void {
  if (root.dataset.syncDockBound === '1') return;
  root.dataset.syncDockBound = '1';
  root.addEventListener('click', (event) => {
    const refreshBtn = (event.target as HTMLElement).closest('#btn-refresh-manabie-data');
    if (!refreshBtn) return;
    void callbacks?.onRefreshManabieData?.();
  });
  bindSlotSyncActions(
    root,
    () => {
      const opts = getOptions();
      return {
        slotPlan: opts.slotPlan,
        studentSessionPlan: opts.studentSessionPlan,
        studentSessionCreatePlan: opts.studentSessionCreatePlan,
        reallocationPlan: opts.reallocationPlan,
        studentSessionLoading: opts.studentSessionLoading,
        scheduleGapReport: opts.scheduleGapReport,
      };
    },
    onLog,
    callbacks,
  );
}

export function scrollToSyncDock(): void {
  document.getElementById('sync-dock-root')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function navigateToSyncDock(): void {
  document.querySelector<HTMLElement>('[data-tab="print"]')?.click();
  window.setTimeout(() => scrollToSyncDock(), 100);
}
