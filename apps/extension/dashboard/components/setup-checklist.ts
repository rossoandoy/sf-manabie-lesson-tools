import type { LessonMasterCatalog } from '../../src/contracts';
import { isInvoiceBillingConfigured } from '../../src/services/invoiceSyncService';

export interface SetupChecklistState {
  catalog: LessonMasterCatalog | null;
  accountId: string;
  hostname: string;
  invoiceSynced: boolean;
}

export function isSetupComplete(state: SetupChecklistState): boolean {
  return Boolean(state.catalog) && Boolean(state.accountId.trim());
}

export function renderSetupChecklist(root: HTMLElement, state: SetupChecklistState): void {
  if (isSetupComplete(state)) {
    root.classList.add('hidden');
    root.innerHTML = '';
    return;
  }

  const masterDone = Boolean(state.catalog);
  const accountDone = Boolean(state.accountId.trim());
  const invoiceOptional = isInvoiceBillingConfigured(state.hostname);
  const invoiceDone = !invoiceOptional || state.invoiceSynced;

  const item = (done: boolean, label: string, action?: { tab: string; label: string }) => {
    const actionHtml = action && !done
      ? ` <button type="button" class="btn btn-sm setup-checklist-link" data-goto-tab="${action.tab}">${action.label}</button>`
      : '';
    return `<li class="${done ? 'done' : 'pending'}">${done ? '✓' : '○'} ${label}${actionHtml}</li>`;
  };

  root.classList.remove('hidden');
  root.innerHTML = `
    <div class="setup-checklist panel-card">
      <h2>はじめに（セットアップ）</h2>
      <ol class="setup-checklist-list">
        ${item(masterDone, '前提マスタ同期', { tab: 'booth', label: 'ヘッダーから同期' })}
        ${item(accountDone, 'コマ組で拠点（Account）を選択', { tab: 'booth', label: 'コマ組を開く' })}
        ${invoiceOptional ? item(invoiceDone, '（任意）請求データ F13 初回同期', { tab: 'report', label: '回数報告を開く' }) : ''}
      </ol>
    </div>
  `;
}

export function bindSetupChecklist(root: HTMLElement): void {
  if (root.dataset.setupBound === '1') return;
  root.dataset.setupBound = '1';
  root.addEventListener('click', (event) => {
    const btn = (event.target as HTMLElement).closest('[data-goto-tab]') as HTMLElement | null;
    if (!btn) return;
    const tab = btn.dataset.gotoTab;
    document.querySelector<HTMLElement>(`[data-tab="${tab}"]`)?.click();
  });
}
