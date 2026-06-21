import type { ClosedDateDefinition, LessonMasterCatalog } from '../../src/contracts';
import { DEFAULT_DISCOVERY_CONFIG, SANDBOX_CONFIRMATION_PHRASE } from '../../src/contracts';
import { buildMonthlyReport, monthlyReportToCsv, type MonthlyReportResult } from '../../lib/booth-report';
import { getBundledLessonDiscoveryForHost } from '../../lib/bundled-discovery';
import { downloadText, formatDateKey, schoolYearFromDate } from '../../lib/calendar-utils';
import {
  loadInvoiceCache,
  mergeInvoiceCacheEntries,
  saveInvoiceCache,
} from '../../lib/invoice-cache-state';
import { BoothActivitySource, ManaerpStudentSessionSource, uniqueStudentNames } from '../../lib/lesson-activity-source';
import type { LessonActivitySource } from '../../lib/lesson-activity-source';
import { loadBoothSession } from '../../lib/booth-session-state';
import { createDashboardApiClient } from '../../lib/salesforce-api-client';
import { syncInvoicesFromSalesforce, isInvoiceBillingConfigured } from '../../src/services/invoiceSyncService';
import { confirmSandboxExecute } from './confirm-modal';
import { showToast } from './toast';
import { navigateToSyncDock } from './sync-dock-panel';
import {
  queryManaerpLessonSessions,
  type NormalizedLessonSession,
} from '../../src/services/manaerpLessonQueryService';

export interface ReportPanelOptions {
  hostname: string;
  catalog: LessonMasterCatalog | null;
  closedDates: ClosedDateDefinition[];
  onInvoiceSynced?: () => void;
  getManaerpSessions?: (dateFrom: string, dateTo: string) => NormalizedLessonSession[];
  onRequestManaerpRefresh?: () => void | Promise<void>;
}

export interface ReportPanelRefreshOptions {
  catalog?: LessonMasterCatalog | null;
  reloadSession?: boolean;
  closedDates?: ClosedDateDefinition[];
}

function mergeStudentOptions(catalog: LessonMasterCatalog | null, boothNames: string[]): string[] {
  const names = new Set<string>(boothNames);
  for (const student of catalog?.catalogs.students ?? []) {
    if (student.name.trim()) names.add(student.name.trim());
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ja'));
}

function closedDateSet(closedDates: ClosedDateDefinition[]): Set<string> {
  return new Set(closedDates.map((item) => item.date));
}

function formatMetric(value: number): string {
  return value > 0 ? String(value) : '';
}

function renderReportTable(report: MonthlyReportResult, diffMonthKeys?: Set<string>): string {
  const body = report.rows
    .map((row) => {
      const rowCls = [
        row.kind === 'yearEnd' || row.kind === 'grandTotal' || row.kind === 'priorYearEnd'
          ? 'report-row-summary'
          : '',
        row.kind === 'month' && row.monthKey && diffMonthKeys?.has(row.monthKey) ? 'report-row-diff' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<tr class="${rowCls}">
        <td>${row.label}</td>
        <td>${row.leftItem}</td>
        <td>${formatMetric(row.left.billing)}</td>
        <td>${formatMetric(row.left.paid)}</td>
        <td>${row.monthKey ?? row.label}</td>
        <td>${formatMetric(row.right.planned)}</td>
        <td>${formatMetric(row.right.present)}</td>
        <td>${formatMetric(row.right.absent)}</td>
        <td class="report-makeup">${formatMetric(row.right.makeup)}</td>
        <td>${formatMetric(row.right.executed)}</td>
      </tr>`;
    })
    .join('');

  return `<table class="report-table">
    <thead>
      <tr>
        <th colspan="4" class="report-head-left">授業申込・支払 状況</th>
        <th colspan="6" class="report-head-right">授業予定・実施 状況</th>
      </tr>
      <tr>
        <th>項目</th><th>内訳</th><th>請求中</th><th>支払済</th>
        <th>月</th><th>予定</th><th>出席</th><th>欠席</th><th>振替</th><th>実施</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>`;
}

function discoveryConfig(hostname: string) {
  return getBundledLessonDiscoveryForHost(hostname)?.config ?? DEFAULT_DISCOVERY_CONFIG;
}

function fiscalYearDateRange(fiscalYearInput: string, session: Awaited<ReturnType<typeof loadBoothSession>>): {
  from: string;
  to: string;
} {
  const year = Number(fiscalYearInput) || Number(session.settings.fiscalYear) || schoolYearFromDate(formatDateKey(new Date()));
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}

function invoiceBillingConfig(hostname: string) {
  return discoveryConfig(hostname).invoiceBilling ?? DEFAULT_DISCOVERY_CONFIG.invoiceBilling ?? null;
}

function invoiceBillingConfigured(hostname: string): boolean {
  return isInvoiceBillingConfigured(invoiceBillingConfig(hostname));
}

function findContactId(catalog: LessonMasterCatalog | null, studentName: string): string | undefined {
  const trimmed = studentName.trim();
  if (!trimmed) return undefined;
  return catalog?.catalogs.students.find((student) => student.name.trim() === trimmed)?.id;
}

export async function mountReportPanel(
  root: HTMLElement,
  options: ReportPanelOptions,
): Promise<(partial?: ReportPanelRefreshOptions) => Promise<void>> {
  let catalog = options.catalog;
  let closedDates = options.closedDates;
  let session = await loadBoothSession(options.hostname);
  let invoiceCache = await loadInvoiceCache(options.hostname);
  let selectedStudent = '';
  let currentReport: MonthlyReportResult | null = null;
  let syncMessage = '';
  let activityDataSource: 'booth' | 'manaerp' = 'booth';
  let manaerpSessions: NormalizedLessonSession[] = [];
  let reportNotice = '';
  let diffMonthKeys = new Set<string>();

  const shell = document.createElement('div');
  shell.className = 'report-layout';
  shell.innerHTML = `
    <section class="panel-card report-controls">
      <h2>回数報告（F06）</h2>
      <p class="muted">PrintSheet / コマ組データから月次の予定・実施を集計します。左表（請求/入金）は SF 請求データ（F13）で充填します。</p>
      <div class="report-meta-grid">
        <label>生徒<select id="report-student"></select></label>
        <label>年度<input id="report-fiscal-year" placeholder="例: 2026" /></label>
        <label>契約<span id="report-contract" class="report-contract">—</span></label>
        <label>作成<span id="report-generated" class="muted">—</span></label>
      </div>
      <div class="report-meta-grid">
        <label>データソース
          <select id="report-data-source">
            <option value="booth">コマ組 / PrintSheet</option>
            <option value="manaerp">Manabie SF（Lesson + Session）</option>
          </select>
        </label>
        <label>請求対象月（任意）<input id="report-invoice-month" placeholder="YYYY/MM（空=全件）" /></label>
        <label>請求同期<span id="report-invoice-sync" class="muted">未同期</span></label>
      </div>
      <div class="footer-actions">
        <button type="button" class="btn primary" data-action="report-refresh">回数報告を更新</button>
        <button type="button" class="btn" data-action="report-sync-invoice">請求データ同期（F13）</button>
        <button type="button" class="btn" data-action="report-csv" disabled>CSV 出力（F11）</button>
        <button type="button" class="btn" data-action="report-print" disabled>印刷（A4）</button>
        <button type="button" class="btn" data-action="booth-print-a3">コマ組 A3 印刷（F12）</button>
      </div>
      <p id="report-sync-message" class="muted"></p>
      <p id="report-sync-dock-hint" class="report-sync-dock-hint hidden"></p>
      <p id="report-notice" class="muted"></p>
    </section>
    <section class="panel-card report-output-host">
      <h2>授業回数報告</h2>
      <p id="report-title" class="report-title">授業回数報告</p>
      <div id="report-table-host"><p class="muted">生徒を選び「回数報告を更新」を押してください。</p></div>
      <div class="report-sign-block">
        <div><strong>保護者署名</strong><span class="report-sign-line"></span></div>
        <div><strong>日付</strong><span class="report-sign-line short"></span></div>
      </div>
    </section>
  `;
  root.replaceChildren(shell);

  const studentSelect = shell.querySelector('#report-student') as HTMLSelectElement;
  const fiscalInput = shell.querySelector('#report-fiscal-year') as HTMLInputElement;
  const invoiceMonthInput = shell.querySelector('#report-invoice-month') as HTMLInputElement;
  const tableHost = shell.querySelector('#report-table-host') as HTMLElement;
  const titleEl = shell.querySelector('#report-title') as HTMLElement;
  const contractEl = shell.querySelector('#report-contract') as HTMLElement;
  const generatedEl = shell.querySelector('#report-generated') as HTMLElement;
  const invoiceSyncEl = shell.querySelector('#report-invoice-sync') as HTMLElement;
  const syncMessageEl = shell.querySelector('#report-sync-message') as HTMLElement;
  const syncDockHintEl = shell.querySelector('#report-sync-dock-hint') as HTMLElement;
  const reportNoticeEl = shell.querySelector('#report-notice') as HTMLElement;
  const dataSourceSelect = shell.querySelector('#report-data-source') as HTMLSelectElement;
  const csvBtn = shell.querySelector('[data-action="report-csv"]') as HTMLButtonElement;
  const printBtn = shell.querySelector('[data-action="report-print"]') as HTMLButtonElement;

  const renderInvoiceSyncMeta = () => {
    const billingReady = invoiceBillingConfigured(options.hostname);
    if (invoiceCache.lastSyncedAt) {
      const base = `${new Date(invoiceCache.lastSyncedAt).toLocaleString('ja-JP')}（${invoiceCache.entries.length} 件）`;
      invoiceSyncEl.textContent = billingReady ? base : `${base} — bill_item 未設定`;
      syncDockHintEl.classList.add('hidden');
      syncDockHintEl.innerHTML = '';
    } else {
      invoiceSyncEl.textContent = billingReady ? '未同期' : '未同期（bill_item 未設定）';
      if (billingReady) {
        syncDockHintEl.classList.remove('hidden');
        syncDockHintEl.innerHTML =
          '請求データ（F13）が未同期です。PrintSheet の <button type="button" class="btn btn-sm" data-action="goto-sync-dock">Sync Dock</button> から Manabie 同期を行えます。';
      } else {
        syncDockHintEl.classList.add('hidden');
      }
    }
    syncMessageEl.textContent = syncMessage;
  };

  const refreshStudentOptions = () => {
    const boothSource = new BoothActivitySource(session.cells, session.settings, session.slotMeta);
    const manaerpSource = new ManaerpStudentSessionSource(manaerpSessions);
    const names = mergeStudentOptions(catalog, [
      ...uniqueStudentNames(boothSource),
      ...uniqueStudentNames(manaerpSource),
    ]);
    studentSelect.innerHTML =
      `<option value="">— 選択 —</option>` +
      names.map((name) => `<option value="${name.replace(/"/g, '&quot;')}">${name}</option>`).join('');
    if (selectedStudent && names.includes(selectedStudent)) {
      studentSelect.value = selectedStudent;
    }
    if (!fiscalInput.value.trim()) {
      fiscalInput.value = session.settings.fiscalYear || String(reportFiscalYearDefault(session));
    }
  };

  function reportFiscalYearDefault(sess: typeof session): number {
    const first = sess.cells.find((c) => c.studentName.trim())?.date;
    if (first) return schoolYearFromDate(first);
    return schoolYearFromDate(formatDateKey(new Date()));
  }

  const renderReport = () => {
    if (!currentReport) {
      tableHost.innerHTML = '<p class="muted">生徒を選び「回数報告を更新」を押してください。</p>';
      csvBtn.disabled = true;
      printBtn.disabled = true;
      contractEl.textContent = '—';
      generatedEl.textContent = '—';
      return;
    }
    titleEl.textContent = `授業回数報告 — ${currentReport.studentName}（${currentReport.contract}）`;
    contractEl.textContent = currentReport.contract;
    generatedEl.textContent = new Date(currentReport.generatedAt).toLocaleString('ja-JP');
    tableHost.innerHTML = renderReportTable(currentReport, diffMonthKeys);
    csvBtn.disabled = false;
    printBtn.disabled = false;
  };

  const buildActivitySource = async (): Promise<LessonActivitySource> => {
    if (activityDataSource === 'manaerp') {
      const range = fiscalYearDateRange(fiscalInput.value.trim(), session);
      const cached = options.getManaerpSessions?.(range.from, range.to) ?? [];
      if (cached.length) {
        manaerpSessions = cached;
        return new ManaerpStudentSessionSource(manaerpSessions);
      }
      await options.onRequestManaerpRefresh?.();
      const refreshed = options.getManaerpSessions?.(range.from, range.to) ?? [];
      if (refreshed.length) {
        manaerpSessions = refreshed;
        return new ManaerpStudentSessionSource(manaerpSessions);
      }
      manaerpSessions = await queryManaerpLessonSessions(createDashboardApiClient(), {
        accountId: session.settings.accountId || undefined,
        dateFrom: range.from,
        dateTo: range.to,
        config: discoveryConfig(options.hostname),
      });
      return new ManaerpStudentSessionSource(manaerpSessions);
    }
    return new BoothActivitySource(session.cells, session.settings, session.slotMeta);
  };

  const updateReport = async () => {
    selectedStudent = studentSelect.value.trim();
    reportNotice = '';
    diffMonthKeys = new Set();
    if (!selectedStudent) {
      currentReport = null;
      renderReport();
      reportNoticeEl.textContent = '';
      return;
    }
    try {
      const source = await buildActivitySource();
      currentReport = buildMonthlyReport(source, selectedStudent, fiscalInput.value.trim() || undefined, {
        billing: invoiceCache.entries,
        closedDates: closedDateSet(closedDates),
        contactId: findContactId(catalog, selectedStudent),
      });

      if (activityDataSource === 'manaerp') {
        const boothReport = buildMonthlyReport(
          new BoothActivitySource(session.cells, session.settings, session.slotMeta),
          selectedStudent,
          fiscalInput.value.trim() || undefined,
          { billing: invoiceCache.entries, closedDates: closedDateSet(closedDates) },
        );
        const manaerpExecuted = currentReport.rows
          .filter((row) => row.kind === 'month')
          .reduce((sum, row) => sum + row.right.executed, 0);
        const boothExecuted = boothReport.rows
          .filter((row) => row.kind === 'month')
          .reduce((sum, row) => sum + row.right.executed, 0);
        for (const row of currentReport.rows) {
          if (row.kind !== 'month' || !row.monthKey) continue;
          const boothRow = boothReport.rows.find((item) => item.monthKey === row.monthKey);
          if (boothRow && boothRow.right.executed !== row.right.executed) {
            diffMonthKeys.add(row.monthKey);
          }
        }
        if (manaerpExecuted !== boothExecuted) {
          reportNotice = `差分: Manabie SF 実施 ${manaerpExecuted} コマ / コマ組 ${boothExecuted} コマ（右表は Manabie SF データ）`;
        }
        if (diffMonthKeys.size) {
          const monthNotice = `月別差分 ${diffMonthKeys.size} か月（ハイライト行を確認）`;
          reportNotice = reportNotice ? `${reportNotice} / ${monthNotice}` : monthNotice;
        }
      }
      renderReport();
      reportNoticeEl.textContent = reportNotice;
    } catch (error) {
      reportNotice = error instanceof Error ? error.message : String(error);
      reportNoticeEl.textContent = reportNotice;
    }
  };

  const syncInvoices = async () => {
    const phrase = await confirmSandboxExecute({
      title: '請求データ同期（F13）',
      summaryHtml: '<p>Sandbox から請求データを取得し、左表のコマ数列を更新します。</p>',
    });
    if (phrase !== SANDBOX_CONFIRMATION_PHRASE) {
      syncMessage = '同期をキャンセルしました。';
      renderInvoiceSyncMeta();
      return;
    }
    const targetMonth = invoiceMonthInput.value.trim();
    try {
      const result = await syncInvoicesFromSalesforce(createDashboardApiClient(), {
        targetMonth: targetMonth || undefined,
        billing: invoiceBillingConfig(options.hostname),
      });
      const mergedEntries = mergeInvoiceCacheEntries(
        invoiceCache.entries,
        result.entries,
        targetMonth || undefined,
      );
      invoiceCache = {
        entries: mergedEntries,
        lastSyncedAt: result.syncedAt,
      };
      await saveInvoiceCache(options.hostname, invoiceCache);
      options.onInvoiceSynced?.();
      if (!result.billingConfigured) {
        syncMessage =
          '同期は成功しましたが、bill_item フィールドが未設定のため左表のコマ数列は空です。discovery の invoiceBilling を設定してください。';
      } else if (result.recordCount === 0) {
        syncMessage = '取得 0 件でした（対象月・権限・bill_item 設定を確認してください）。';
      } else {
        syncMessage = `請求データを反映しました: ${result.recordCount} 件`;
      }
      showToast(syncMessage, result.recordCount > 0 ? 'success' : 'info');
      renderInvoiceSyncMeta();
      void updateReport();
    } catch (error) {
      syncMessage = error instanceof Error ? error.message : String(error);
      showToast(syncMessage, 'error');
      renderInvoiceSyncMeta();
    }
  };

  shell.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
    if (!target) return;
    const action = target.dataset.action;
    if (action === 'report-refresh') {
      void updateReport();
    } else if (action === 'report-sync-invoice') {
      void syncInvoices();
    } else if (action === 'goto-sync-dock') {
      navigateToSyncDock();
    } else if (action === 'report-csv' && currentReport) {
      downloadText(
        `${formatDateKey(new Date())}-report-${currentReport.studentName}.csv`,
        monthlyReportToCsv(currentReport),
      );
    } else if (action === 'report-print') {
      document.body.classList.add('print-report-a4');
      window.print();
      window.setTimeout(() => document.body.classList.remove('print-report-a4'), 500);
    } else if (action === 'booth-print-a3') {
      document.body.classList.add('print-booth-a3');
      window.print();
      window.setTimeout(() => document.body.classList.remove('print-booth-a3'), 500);
    }
  });

  dataSourceSelect.addEventListener('change', () => {
    activityDataSource = dataSourceSelect.value === 'manaerp' ? 'manaerp' : 'booth';
  });

  refreshStudentOptions();
  if (!invoiceBillingConfigured(options.hostname)) {
    syncMessage =
      '請求連携（F13）: bill_item が未設定のため、同期成功後も左表のコマ数列は空のままです。';
  } else {
    syncMessage = '';
  }
  renderInvoiceSyncMeta();
  renderReport();

  return async (partial) => {
    if (partial?.catalog !== undefined) catalog = partial.catalog;
    if (partial?.closedDates) closedDates = partial.closedDates;
    if (partial?.reloadSession) session = await loadBoothSession(options.hostname);
    refreshStudentOptions();
    if (selectedStudent) await updateReport();
  };
};
