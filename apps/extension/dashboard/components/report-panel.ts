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
import {
  enrolledStudentsForReport,
  loadCenterScopedCatalog,
  studentsForPicker,
  type CenterScopedCatalog,
} from '../../src/services/center-scoped-catalog';
import { mountEntitySearchModal } from './entity-search-modal';
import { renderEntityNamePickerRow, syncEntityNameDisplay } from './entity-name-picker-row';
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

function findContactId(
  catalog: LessonMasterCatalog | null,
  centerCatalog: CenterScopedCatalog | null,
  studentName: string,
): string | undefined {
  const trimmed = studentName.trim();
  if (!trimmed) return undefined;
  const scoped = studentsForPicker(centerCatalog, catalog?.catalogs.students).find(
    (student) => student.name.trim() === trimmed,
  );
  if (scoped?.id) return scoped.id;
  return catalog?.catalogs.students.find((student) => student.name.trim() === trimmed)?.id;
}

function formatMetric(value: number): string {
  return value > 0 ? String(value) : '';
}

function formatCreatedDate(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
}

function fiscalYearInvoiceMonthOptions(fiscalYearRaw: string, syncedMonths: Set<string>): string {
  const year = Number(fiscalYearRaw.trim()) || schoolYearFromDate(formatDateKey(new Date()));
  const options = [`<option value="">全件（空）</option>`];
  for (let month = 4; month <= 12; month += 1) {
    const key = `${year}/${String(month).padStart(2, '0')}`;
    const synced = syncedMonths.has(key) ? '（同期済）' : '';
    options.push(`<option value="${key}">${key}${synced}</option>`);
  }
  for (let month = 1; month <= 3; month += 1) {
    const key = `${year + 1}/${String(month).padStart(2, '0')}`;
    const synced = syncedMonths.has(key) ? '（同期済）' : '';
    options.push(`<option value="${key}">${key}${synced}</option>`);
  }
  return options.join('');
}

function syncedInvoiceMonths(entries: { monthKey?: string }[]): Set<string> {
  return new Set(entries.map((entry) => String(entry.monthKey ?? '').trim()).filter(Boolean));
}

function reportRowClass(row: MonthlyReportResult['rows'][number], diffMonthKeys?: Set<string>): string {
  return [
    row.kind === 'yearEnd' || row.kind === 'grandTotal' || row.kind === 'priorYearEnd'
      ? 'report-row-summary'
      : '',
    row.kind === 'month' && row.monthKey && diffMonthKeys?.has(row.monthKey) ? 'report-row-diff' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function reportItemLabel(row: MonthlyReportResult['rows'][number]): string {
  if (row.kind === 'month' && row.leftItem) {
    return `${row.label}<div class="report-item-sub">${row.leftItem}</div>`;
  }
  return row.label;
}

export function renderReportTablesHtml(report: MonthlyReportResult, diffMonthKeys?: Set<string>): string {
  const leftBody = report.rows
    .map(
      (row) => `<tr class="${reportRowClass(row, diffMonthKeys)}">
        <td>${reportItemLabel(row)}</td>
        <td class="report-num">${formatMetric(row.left.billing)}</td>
        <td class="report-num">${formatMetric(row.left.paid)}</td>
      </tr>`,
    )
    .join('');
  const rightBody = report.rows
    .map(
      (row) => `<tr class="${reportRowClass(row, diffMonthKeys)}">
        <td>${reportItemLabel(row)}</td>
        <td class="report-num">${formatMetric(row.right.planned)}</td>
        <td class="report-num">${formatMetric(row.right.present)}</td>
        <td class="report-num">${formatMetric(row.right.absent)}</td>
        <td class="report-num report-makeup">${formatMetric(row.right.makeup)}</td>
      </tr>`,
    )
    .join('');
  const created = formatCreatedDate(report.generatedAt);

  return `<div class="report-print-header">
      <h1 class="report-print-title">授業回数報告</h1>
      <div class="report-print-meta">
        <span>生徒: <span class="report-meta-value">${report.studentName}</span></span>
        <span>契約: <span class="report-meta-value">${report.contract}</span></span>
        <span>作成: <span class="report-meta-value">${created}</span></span>
      </div>
    </div>
    <div class="report-tables-split">
      <table class="report-table report-table-left">
        <thead>
          <tr><th colspan="3" class="report-head-left">授業申込・支払状況</th></tr>
          <tr><th>項目</th><th>請求中</th><th>支払済</th></tr>
        </thead>
        <tbody>${leftBody}</tbody>
      </table>
      <table class="report-table report-table-right">
        <thead>
          <tr><th colspan="5" class="report-head-right">授業予定・実施状況</th></tr>
          <tr><th>授業予定・実施状況</th><th>予定</th><th>出席</th><th>欠席</th><th>振替</th></tr>
        </thead>
        <tbody>${rightBody}</tbody>
      </table>
    </div>`;
}

function renderReportTable(report: MonthlyReportResult, diffMonthKeys?: Set<string>): string {
  return renderReportTablesHtml(report, diffMonthKeys);
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

function closedDateSet(closedDates: ClosedDateDefinition[]): Set<string> {
  return new Set(closedDates.map((item) => item.date));
}

export async function mountReportPanel(
  root: HTMLElement,
  options: ReportPanelOptions,
): Promise<(partial?: ReportPanelRefreshOptions) => Promise<void>> {
  let catalog = options.catalog;
  let closedDates = options.closedDates;
  let session = await loadBoothSession(options.hostname);
  let centerCatalog: CenterScopedCatalog | null = null;
  let invoiceCache = await loadInvoiceCache(options.hostname);
  let selectedStudent = '';
  let currentReport: MonthlyReportResult | null = null;
  let syncMessage = '';
  let activityDataSource: 'booth' | 'manaerp' = 'booth';
  let manaerpSessions: NormalizedLessonSession[] = [];
  let reportNotice = '';
  let diffMonthKeys = new Set<string>();
  let closeStudentPicker: (() => void) | null = null;

  const shell = document.createElement('div');
  shell.className = 'report-layout';
  shell.innerHTML = `
    <section class="panel-card report-controls">
      <h2>回数報告（F06）</h2>
      <p class="muted">授業一覧 / コマ組データから月次の予定・実施を集計します。左表（請求/入金）は SF 請求データ（F13）で充填します。</p>
      <div class="report-meta-grid">
        <label>生徒
          <div id="report-student-picker-row">
            ${renderEntityNamePickerRow({
              value: '',
              placeholder: '生徒を選択',
              pickAction: 'report-student-pick',
              clearAction: 'report-student-clear',
            })}
          </div>
        </label>
        <label>年度<input id="report-fiscal-year" placeholder="例: 2026" /></label>
        <label>契約<span id="report-contract" class="report-contract">—</span></label>
        <label>作成<span id="report-generated" class="muted">—</span></label>
      </div>
      <div class="report-meta-grid">
        <label>データソース
          <select id="report-data-source">
            <option value="booth">コマ組 / 授業一覧</option>
            <option value="manaerp">Manabie SF（Lesson + Session）</option>
          </select>
        </label>
        <label>請求対象月（任意）
          <select id="report-invoice-month">
            <option value="">全件（空）</option>
          </select>
        </label>
        <label>請求同期<span id="report-invoice-sync" class="muted">未同期</span></label>
      </div>
      <div class="footer-actions">
        <button type="button" class="btn primary" data-action="report-refresh">回数報告を更新</button>
        <button type="button" class="btn" data-action="report-sync-invoice">請求データ同期（F13）</button>
        <button type="button" class="btn" data-action="report-csv" disabled>CSV 出力（F11）</button>
        <button type="button" class="btn" data-action="report-print" disabled>印刷（A4）</button>
      </div>
      <p id="report-sync-message" class="muted"></p>
      <p id="report-sync-dock-hint" class="report-sync-dock-hint hidden"></p>
      <p id="report-notice" class="muted"></p>
    </section>
    <section class="panel-card report-output-host">
      <div id="report-table-host"><p class="muted">生徒を選び「回数報告を更新」を押してください。</p></div>
      <div class="report-sign-block">
        <div><strong>保護者署名</strong><span class="report-sign-line"></span></div>
        <div><strong>日付</strong><span class="report-sign-line short"></span></div>
      </div>
    </section>
  `;
  root.replaceChildren(shell);

  const studentPickerRow = shell.querySelector('#report-student-picker-row') as HTMLElement;
  const fiscalInput = shell.querySelector('#report-fiscal-year') as HTMLInputElement;
  const invoiceMonthSelect = shell.querySelector('#report-invoice-month') as HTMLSelectElement;
  const tableHost = shell.querySelector('#report-table-host') as HTMLElement;
  const contractEl = shell.querySelector('#report-contract') as HTMLElement;
  const generatedEl = shell.querySelector('#report-generated') as HTMLElement;
  const invoiceSyncEl = shell.querySelector('#report-invoice-sync') as HTMLElement;
  const syncMessageEl = shell.querySelector('#report-sync-message') as HTMLElement;
  const syncDockHintEl = shell.querySelector('#report-sync-dock-hint') as HTMLElement;
  const reportNoticeEl = shell.querySelector('#report-notice') as HTMLElement;
  const dataSourceSelect = shell.querySelector('#report-data-source') as HTMLSelectElement;
  const csvBtn = shell.querySelector('[data-action="report-csv"]') as HTMLButtonElement;
  const printBtn = shell.querySelector('[data-action="report-print"]') as HTMLButtonElement;

  const renderInvoiceMonthOptions = () => {
    const selected = invoiceMonthSelect.value;
    invoiceMonthSelect.innerHTML = fiscalYearInvoiceMonthOptions(
      fiscalInput.value,
      syncedInvoiceMonths(invoiceCache.entries),
    );
    if (selected && [...invoiceMonthSelect.options].some((opt) => opt.value === selected)) {
      invoiceMonthSelect.value = selected;
    }
  };

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
          '請求データ（F13）が未同期です。授業一覧の <button type="button" class="btn btn-sm" data-action="goto-sync-dock">Sync Dock</button> から Manabie 同期を行えます。';
      } else {
        syncDockHintEl.classList.add('hidden');
      }
    }
    syncMessageEl.textContent = syncMessage;
    renderInvoiceMonthOptions();
  };

  const reloadCenterCatalog = async (): Promise<void> => {
    const accountId = session.settings.accountId.trim();
    if (!accountId) {
      centerCatalog = null;
      return;
    }
    try {
      centerCatalog = await loadCenterScopedCatalog(accountId, session.settings.classroomName);
    } catch {
      centerCatalog = null;
    }
  };

  const reportStudentRecords = (): ReturnType<typeof enrolledStudentsForReport> => {
    const boothSource = new BoothActivitySource(session.cells, session.settings, session.slotMeta);
    const manaerpSource = new ManaerpStudentSessionSource(manaerpSessions);
    return enrolledStudentsForReport(centerCatalog, catalog?.catalogs.students, [
      ...uniqueStudentNames(boothSource),
      ...uniqueStudentNames(manaerpSource),
    ]);
  };

  const syncStudentInputDisplay = () => {
    syncEntityNameDisplay(studentPickerRow, selectedStudent, '生徒を選択');
    if (!fiscalInput.value.trim()) {
      fiscalInput.value = session.settings.fiscalYear || String(reportFiscalYearDefault(session));
    }
  };

  const openReportStudentPicker = () => {
    const records = reportStudentRecords();
    if (!records.length) {
      showToast('生徒一覧がありません。拠点 Account を設定してください。', 'error');
      return;
    }
    closeStudentPicker?.();
    closeStudentPicker = mountEntitySearchModal({
      kind: 'student',
      title: '生徒を選択（回数報告）',
      records,
      initialQuery: selectedStudent,
      onSelect: (record) => {
        selectedStudent = record.name;
        syncStudentInputDisplay();
      },
      onClose: () => {
        closeStudentPicker = null;
      },
    });
  };

  const refreshStudentOptions = () => {
    const names = reportStudentRecords().map((s) => s.name);
    if (selectedStudent && !names.includes(selectedStudent)) {
      selectedStudent = '';
    }
    syncStudentInputDisplay();
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
    contractEl.textContent = currentReport.contract;
    generatedEl.textContent = formatCreatedDate(currentReport.generatedAt);
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
        contactId: findContactId(catalog, centerCatalog, selectedStudent),
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
    const targetMonth = invoiceMonthSelect.value.trim();
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
    } else if (action === 'report-student-pick') {
      openReportStudentPicker();
    } else if (action === 'report-student-clear') {
      selectedStudent = '';
      syncStudentInputDisplay();
      currentReport = null;
      renderReport();
      reportNoticeEl.textContent = '';
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
    }
  });

  dataSourceSelect.addEventListener('change', () => {
    activityDataSource = dataSourceSelect.value === 'manaerp' ? 'manaerp' : 'booth';
  });

  fiscalInput.addEventListener('change', () => {
    renderInvoiceMonthOptions();
  });

  await reloadCenterCatalog();
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
    if (partial?.reloadSession) {
      session = await loadBoothSession(options.hostname);
      await reloadCenterCatalog();
    }
    refreshStudentOptions();
    if (selectedStudent) await updateReport();
  };
};
