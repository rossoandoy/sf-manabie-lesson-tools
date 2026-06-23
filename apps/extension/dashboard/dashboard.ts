import type { ConnectionState } from '../lib/types';
import type {
  ClosedDateDefinition,
  ExecutionLog,
  LessonMasterCatalog,
  LessonScheduleDefinition,
  LessonSlotImportPlan,
  ScheduleImportPlan,
  ClosedDateImportPlan,
  StudentSessionUpdatePlan,
  StudentSessionCreatePlan,
  ReallocationPlan,
} from '../src/contracts';
import {
  buildLessonDatesQuerySoql,
  buildLessonScheduleOverlapQuerySoql,
  computeScheduleGapReport,
  type ScheduleGapReport,
} from '../src/services/lessonScheduleGapService';
import { SANDBOX_CONFIRMATION_PHRASE, DEFAULT_DISCOVERY_CONFIG } from '../src/contracts';
import { getOrgIdentity, setCurrentHost } from '../lib/sf-api';
import { STORAGE_KEYS, loadJson } from '../lib/lesson-storage';
import { createDashboardApiClient } from '../lib/salesforce-api-client';
import { buildScheduleImportPlan } from '../src/services/scheduleImportPlanBuilder';
import { buildClosedDateImportPlan } from '../src/services/closedDatePlanBuilder';
import { executeImportPlan } from '../src/services/registrationExecutor';
import { runMasterSync, renderMasterSyncSummary } from './components/master-sync-panel';
import { mountDrawerPanel } from './components/lesson-calendar-panel';
import { mountClosedDatePanel } from './components/closed-date-calendar-panel';
import { mountBoothGridPanel } from './components/booth-grid-panel';
import { mountPrintSheetPanel } from './components/print-sheet-panel';
import { mountReportPanel } from './components/report-panel';
import { renderSchedulePreviewPanel, formatExecutionLog } from './components/schedule-preview-panel';
import { bindSlotSyncActions, renderSlotSyncSummary } from './components/slot-sync-panel';
import { buildLessonSlotImportPlan } from '../src/services/slotImportPlanBuilder';
import { buildStudentSessionUpdatePlan } from '../src/services/studentSessionUpdatePlanBuilder';
import { buildStudentSessionCreatePlan } from '../src/services/studentSessionCreatePlanBuilder';
import { buildReallocationPlan } from '../src/services/reallocationPlanBuilder';
import {
  buildManaerpLessonQuerySoql,
  parseManaerpLessonQuery,
} from '../src/services/manaerpLessonQueryService';
import {
  buildManabieCacheKey,
  cacheRangeCovers,
  mergeManabieCacheEntries,
  recomputeScheduleGapFromCache,
  sessionsInDateRange,
  weekGapFromFiscalCache,
  type ManabieQueryCacheEntry,
} from '../lib/manabie-query-cache';
import { getBundledLessonDiscoveryForHost } from '../lib/bundled-discovery';
import { boothCellsToPrintRows } from '../lib/booth-print-sheet';
import { reconcileClosedDates } from '../lib/closed-date-guard';
import { loadBoothSession, saveBoothSession } from '../lib/booth-session-state';
import {
  applyAffiliationToBoothSession,
  affiliationFailureMessage,
  resolveUserAffiliation,
} from '../src/services/user-affiliation-context';
import { schoolYearFromDate } from '../lib/calendar-utils';
import { applySlotSyncFromExecutionLog } from '../lib/slot-sync-state';
import {
  applyReallocationSyncToManifest,
  applyStudentSessionCreateToManifest,
  applyStudentSessionSyncToManifest,
} from '../lib/sync-manifest';
import { loadInvoiceCache } from '../lib/invoice-cache-state';
import {
  academicCalendarIdForLocation,
  loadClosedDateSession,
  loadLessonSession,
  saveClosedDateSession,
} from '../lib/session-state';
import { confirmSandboxExecute, confirmAction } from './components/confirm-modal';
import { showToast } from './components/toast';
import { bindSetupChecklist, renderSetupChecklist } from './components/setup-checklist';
import { productionBlockedReason } from '../lib/production-guard';
import { summarizeExecutionLog, type SyncDockOptions } from './components/sync-dock-panel';

interface ManabieQueryCacheEntryLocal extends ManabieQueryCacheEntry {}

interface AppState {
  hostname: string;
  tabId: number;
  orgBlocked: boolean;
  isSandbox: boolean;
  orgId: string;
  catalog: LessonMasterCatalog | null;
  lessons: LessonScheduleDefinition[];
  closedDates: ClosedDateDefinition[];
  schedulePlan: ScheduleImportPlan | null;
  closedPlan: ClosedDateImportPlan | null;
  slotPlan: LessonSlotImportPlan | null;
  studentSessionPlan: StudentSessionUpdatePlan | null;
  studentSessionCreatePlan: StudentSessionCreatePlan | null;
  reallocationPlan: ReallocationPlan | null;
  studentSessionPlanLoading: boolean;
  scheduleGapReport: ScheduleGapReport | null;
  selectedLocationId: string;
  boothAccountId: string;
  affiliationHint: string | null;
  lastExecutionLog: ExecutionLog | null;
  manabieCacheStale: boolean;
  manabieDataLoading: boolean;
}

const appState: AppState = {
  hostname: '',
  tabId: 0,
  orgBlocked: false,
  isSandbox: false,
  orgId: '',
  catalog: null,
  lessons: [],
  closedDates: [],
  schedulePlan: null,
  closedPlan: null,
  slotPlan: null,
  studentSessionPlan: null,
  studentSessionCreatePlan: null,
  reallocationPlan: null,
  studentSessionPlanLoading: false,
  scheduleGapReport: null,
  selectedLocationId: '',
  boothAccountId: '',
  affiliationHint: null,
  lastExecutionLog: null,
  manabieCacheStale: false,
  manabieDataLoading: false,
};

let manabieQueryCache: ManabieQueryCacheEntryLocal | null = null;
const manabiePendingFetches = new Map<string, Promise<ManabieQueryCacheEntryLocal | null>>();
let boothWeekGapReport: ScheduleGapReport | null = null;
let boothWeekGapLoading = false;
let boothWeekGapKey: string | null = null;

let refreshClosedPanel: ((partial?: Partial<import('./components/closed-date-calendar-panel').ClosedDatePanelOptions>) => Promise<void>) | null = null;
let refreshBoothPanel: ((partial?: Partial<import('./components/booth-grid-panel').BoothGridPanelRefreshOptions>) => Promise<void>) | null = null;
let refreshPrintSheetPanel: ((partial?: Partial<import('./components/print-sheet-panel').PrintSheetPanelRefreshOptions>) => Promise<void>) | null = null;
let refreshReportPanel: ((partial?: Partial<import('./components/report-panel').ReportPanelRefreshOptions>) => Promise<void>) | null = null;
let closedRegistrationBound = false;
let syncDockRefreshScheduled = false;

function markManabieCacheStale(): void {
  appState.manabieCacheStale = true;
  scheduleSyncDockRefresh();
}

function scheduleSyncDockRefresh(): void {
  if (syncDockRefreshScheduled) return;
  syncDockRefreshScheduled = true;
  requestAnimationFrame(() => {
    syncDockRefreshScheduled = false;
    refreshPreviewTabSlotSync();
    void refreshPrintSheetPanel?.({ refreshSlotSync: true });
  });
}

function invalidateManabieCache(): void {
  manabieQueryCache = null;
  boothWeekGapKey = null;
  appState.manabieCacheStale = false;
}

async function fetchManabieQueryCache(options: {
  accountId: string;
  dateFrom: string;
  dateTo: string;
  daysWithBoothStudents: string[];
  force?: boolean;
}): Promise<ManabieQueryCacheEntryLocal | null> {
  const accountId = options.accountId.trim();
  if (!accountId) return null;
  const cacheKey = buildManabieCacheKey(accountId, options.dateFrom, options.dateTo);
  if (!options.force && manabieQueryCache?.cacheKey === cacheKey) {
    return manabieQueryCache;
  }
  const pending = manabiePendingFetches.get(cacheKey);
  if (pending) return pending;

  const promise = (async () => {
    const config = getBundledLessonDiscoveryForHost(appState.hostname)?.config;
    const api = createDashboardApiClient();
    const lessonSoql = buildManaerpLessonQuerySoql({
      accountId,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      config,
    });
    const lessonDatesSoql = buildLessonDatesQuerySoql({
      accountId,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      config,
    });
    const scheduleSoql = buildLessonScheduleOverlapQuerySoql({
      accountId,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      config,
    });
    const cfg = config?.fields?.lesson?.lessonDate;
    const lessonDateField = cfg ?? DEFAULT_DISCOVERY_CONFIG.fields.lesson?.lessonDate ?? 'MANAERP__Lesson_Date__c';

    const [{ records: lessonQueryRecords }, { records: lessonRecords }, { records: scheduleRecords }] =
      await Promise.all([
        api.query<Record<string, unknown>>(lessonSoql),
        api.query<Record<string, unknown>>(lessonDatesSoql),
        api.query<Record<string, unknown>>(scheduleSoql),
      ]);

    const { sessions, lessonDayIndex } = parseManaerpLessonQuery(lessonQueryRecords, config);
    const lessonDates = [
      ...new Set(
        lessonRecords
          .map((record) => String(record[lessonDateField] ?? '').trim())
          .filter(Boolean),
      ),
    ];
    const scheduleGapReport = computeScheduleGapReport({
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      daysWithBoothStudents: options.daysWithBoothStudents,
      lessonDates,
      scheduleCountInRange: scheduleRecords.length,
      lessonCountInRange: lessonRecords.length,
    });
    const entry: ManabieQueryCacheEntryLocal = {
      cacheKey,
      sessions,
      lessonDayIndex,
      lessonDates,
      scheduleCountInRange: scheduleRecords.length,
      lessonCountInRange: lessonRecords.length,
      scheduleGapReport,
    };
    manabieQueryCache = mergeManabieCacheEntries(manabieQueryCache, entry);
    appState.manabieCacheStale = false;
    return manabieQueryCache;
  })();

  manabiePendingFetches.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    manabiePendingFetches.delete(cacheKey);
  }
}

async function getStatusForTab(tabId: number): Promise<ConnectionState & { error?: string }> {
  return chrome.runtime.sendMessage({ type: 'getStatus', tabId }) as Promise<ConnectionState & { error?: string }>;
}

function setExecutionLog(text: string): void {
  const el = document.getElementById('execution-log');
  if (el) el.textContent = text;
}

function syncDockOptions(): SyncDockOptions {
  return {
    catalog: appState.catalog,
    isSandbox: appState.isSandbox,
    productionWriteBlocked: productionBlockedReason(appState.orgId, appState.isSandbox),
    slotPlan: appState.slotPlan,
    studentSessionPlan: appState.studentSessionPlan,
    studentSessionCreatePlan: appState.studentSessionCreatePlan,
    reallocationPlan: appState.reallocationPlan,
    studentSessionLoading: appState.studentSessionPlanLoading,
    scheduleGapReport: appState.scheduleGapReport,
    executionSummary: summarizeExecutionLog(appState.lastExecutionLog),
    manabieCacheStale: appState.manabieCacheStale,
    manabieDataLoading: appState.manabieDataLoading,
  };
}

export function getCachedManaerpSessions(dateFrom: string, dateTo: string): import('../src/services/manaerpLessonQueryService').NormalizedLessonSession[] {
  if (!manabieQueryCache || !cacheRangeCovers(manabieQueryCache, dateFrom, dateTo)) return [];
  return sessionsInDateRange(manabieQueryCache.sessions, dateFrom, dateTo);
}

async function refreshManabieData(): Promise<void> {
  appState.manabieDataLoading = true;
  scheduleSyncDockRefresh();
  try {
    await rebuildSlotPlan(true);
  } finally {
    appState.manabieDataLoading = false;
    scheduleSyncDockRefresh();
  }
}

async function ensureFreshManabieCacheBeforeExecute(): Promise<boolean> {
  if (!appState.manabieCacheStale) return true;
  return confirmAction({
    title: 'Manabie データが最新ではありません',
    messageHtml:
      '<p>ローカル編集後、Manabie データを更新していません。</p>' +
      '<p>更新せずに実行しますか？（推奨: 先に「Manabie データ更新」）</p>',
    confirmLabel: '更新せず実行',
    danger: true,
  });
}

async function refreshSetupChecklist(): Promise<void> {
  const root = document.getElementById('setup-checklist-root');
  if (!root) return;
  const invoiceCache = appState.hostname ? await loadInvoiceCache(appState.hostname) : { entries: [], lastSyncedAt: null };
  renderSetupChecklist(root, {
    catalog: appState.catalog,
    accountId: appState.boothAccountId,
    hostname: appState.hostname,
    invoiceSynced: Boolean(invoiceCache.lastSyncedAt),
    affiliationHint: appState.affiliationHint,
  });
}

function previewTabSlotOptions(): import('./components/slot-sync-panel').SlotSyncPanelOptions {
  return {
    slotPlan: appState.slotPlan,
    productionWriteBlocked: productionBlockedReason(appState.orgId, appState.isSandbox),
  };
}

function refreshPreviewTabSlotSync(): void {
  const root = document.getElementById('slot-sync-preview-root');
  if (!root) return;
  renderSlotSyncSummary(root, previewTabSlotOptions());
}

function updateRegisterButton(): void {
  const btn = document.getElementById('btn-register-legacy') as HTMLButtonElement | null;
  if (!btn) return;
  const hasErrors = (appState.schedulePlan?.validationIssues ?? []).some((issue) => issue.severity === 'error');
  btn.disabled = appState.orgBlocked || !appState.catalog || !appState.lessons.length || hasErrors;
}

function rebuildPlans(): void {
  if (!appState.catalog) {
    appState.schedulePlan = null;
    appState.closedPlan = null;
    appState.slotPlan = null;
    return;
  }
  appState.schedulePlan = buildScheduleImportPlan({
    definitions: appState.lessons,
    catalog: appState.catalog,
  });
  const locationId = appState.selectedLocationId || appState.catalog.catalogs.locations[0]?.id || '';
  const location = appState.catalog.catalogs.locations.find((item) => item.id === locationId);
  appState.closedPlan = buildClosedDateImportPlan({
    definitions: appState.closedDates,
    catalog: appState.catalog,
    locationId,
    locationName: location?.name ?? '',
    academicCalendarId: academicCalendarIdForLocation(appState.catalog, locationId),
  });
  renderSchedulePreviewPanel(
    document.getElementById('preview-panel-root')!,
    appState.schedulePlan,
    appState.closedPlan,
  );
  void rebuildSlotPlan();
  refreshPreviewTabSlotSync();
  updateRegisterButton();
}

async function handleSlotSyncExecuted(
  log: ExecutionLog,
  plan: LessonSlotImportPlan,
): Promise<void> {
  appState.lastExecutionLog = log;
  if (!appState.hostname || !log.success) {
    void refreshPrintSheetPanel?.({ refreshSlotSync: true });
    return;
  }
  const session = await loadBoothSession(appState.hostname);
  const updated = applySlotSyncFromExecutionLog(session, log, plan.sourceRows);
  await saveBoothSession(appState.hostname, updated);
  void refreshPrintSheetPanel?.({ reloadSession: true, refreshSlotSync: true });
  void refreshBoothPanel?.({ reloadSession: true });
}

async function handleExecutionComplete(
  log: ExecutionLog,
  manifestUpdate?: (session: Awaited<ReturnType<typeof loadBoothSession>>) => Awaited<ReturnType<typeof loadBoothSession>>,
): Promise<void> {
  appState.lastExecutionLog = log;
  await saveExecutionLog(log);
  if (manifestUpdate && appState.hostname && log.success) {
    const session = await loadBoothSession(appState.hostname);
    const updated = manifestUpdate(session);
    await saveBoothSession(appState.hostname, updated);
    void refreshPrintSheetPanel?.({ reloadSession: true, refreshSlotSync: true });
    void refreshBoothPanel?.({ reloadSession: true });
  } else {
    scheduleSyncDockRefresh();
  }
}

async function rebuildStudentSessionPlan(
  rows: ReturnType<typeof boothCellsToPrintRows>,
  settings: Awaited<ReturnType<typeof loadBoothSession>>['settings'],
  accountName?: string,
  force = false,
): Promise<void> {
  appState.studentSessionPlanLoading = force;
  scheduleSyncDockRefresh();
  try {
    if (!settings.accountId.trim() || !rows.length) {
      appState.studentSessionPlan = null;
      appState.studentSessionCreatePlan = null;
      appState.reallocationPlan = null;
      appState.scheduleGapReport = null;
      return;
    }
    const dates = rows.map((row) => row.date);
    const dateFrom = dates.reduce((min, date) => (date < min ? date : min));
    const dateTo = dates.reduce((max, date) => (date > max ? date : max));
    const daysWithBoothStudents = [
      ...new Set(rows.filter((row) => row.studentName.trim()).map((row) => row.date)),
    ].sort();

    let cacheEntry = manabieQueryCache;
    if (force) {
      cacheEntry = await fetchManabieQueryCache({
        accountId: settings.accountId,
        dateFrom,
        dateTo,
        daysWithBoothStudents,
        force: true,
      });
    } else if (!cacheEntry || !cacheRangeCovers(cacheEntry, dateFrom, dateTo)) {
      appState.studentSessionPlan = null;
      appState.studentSessionCreatePlan = null;
      appState.reallocationPlan = null;
      appState.scheduleGapReport = cacheEntry?.scheduleGapReport ?? null;
      return;
    }

    const sessions = cacheEntry?.sessions ?? [];
    appState.studentSessionPlan = buildStudentSessionUpdatePlan({
      rows,
      sessions,
      settings,
      catalog: appState.catalog,
      accountName,
    });
    appState.studentSessionCreatePlan = buildStudentSessionCreatePlan({
      rows,
      sessions,
      lessonDayIndex: cacheEntry?.lessonDayIndex ?? new Map(),
      settings,
      catalog: appState.catalog,
      accountName,
      daysMissingLessons: cacheEntry?.scheduleGapReport?.daysMissingLessons,
    });
    appState.reallocationPlan = buildReallocationPlan({
      rows,
      sessions,
      lessonDayIndex: cacheEntry?.lessonDayIndex ?? new Map(),
      settings,
      catalog: appState.catalog,
      accountName,
      daysMissingLessons: cacheEntry?.scheduleGapReport?.daysMissingLessons,
    });
    if (cacheEntry) {
      appState.scheduleGapReport = recomputeScheduleGapFromCache(cacheEntry, {
        dateFrom,
        dateTo,
        daysWithBoothStudents,
        studentSessionPlan: appState.studentSessionPlan,
      });
      manabieQueryCache = { ...cacheEntry, scheduleGapReport: appState.scheduleGapReport };
    } else {
      appState.scheduleGapReport = null;
    }
  } catch {
    appState.studentSessionPlan = null;
    appState.studentSessionCreatePlan = null;
    appState.reallocationPlan = null;
    appState.scheduleGapReport = null;
  } finally {
    appState.studentSessionPlanLoading = false;
    scheduleSyncDockRefresh();
  }
}

async function refreshBoothWeekGap(options: {
  accountId: string;
  dateFrom: string;
  dateTo: string;
  daysWithBoothStudents: string[];
}): Promise<void> {
  const cacheKey = buildManabieCacheKey(options.accountId, options.dateFrom, options.dateTo);
  if (boothWeekGapKey === cacheKey && !boothWeekGapLoading) {
    void refreshBoothPanel?.({ refreshGapBanner: true });
    return;
  }
  boothWeekGapLoading = true;
  boothWeekGapKey = cacheKey;
  void refreshBoothPanel?.({ refreshGapBanner: true });
  try {
    const fiscalEntry = manabieQueryCache;
    if (fiscalEntry && cacheRangeCovers(fiscalEntry, options.dateFrom, options.dateTo)) {
      boothWeekGapReport = weekGapFromFiscalCache(fiscalEntry, options, appState.studentSessionPlan);
      return;
    }
    boothWeekGapReport = fiscalEntry?.scheduleGapReport
      ? recomputeScheduleGapFromCache(fiscalEntry, {
          ...options,
          studentSessionPlan: appState.studentSessionPlan,
        })
      : null;
  } catch {
    boothWeekGapReport = null;
  } finally {
    boothWeekGapLoading = false;
    void refreshBoothPanel?.({ refreshGapBanner: true });
  }
}

async function rebuildSlotPlan(force = false): Promise<void> {
  if (!appState.hostname) {
    appState.slotPlan = null;
    appState.studentSessionPlan = null;
    scheduleSyncDockRefresh();
    return;
  }
  if (force) invalidateManabieCache();
  const session = await loadBoothSession(appState.hostname);
  appState.boothAccountId = session.settings.accountId;
  void refreshSetupChecklist();
  const rows = boothCellsToPrintRows(
    session.cells,
    session.settings,
    undefined,
    session.slotMeta,
    session.syncManifest,
  );
  const location = appState.catalog?.catalogs.locations.find((loc) => loc.id === session.settings.accountId);
  appState.slotPlan = buildLessonSlotImportPlan({
    rows,
    settings: session.settings,
    catalog: appState.catalog,
    accountName: location?.name,
  });
  scheduleSyncDockRefresh();
  await rebuildStudentSessionPlan(rows, session.settings, location?.name, force);
}

async function bindOrgContext(): Promise<boolean> {
  const params = new URLSearchParams(location.search);
  const hostname = params.get('host');
  const tabIdRaw = params.get('tabId');
  const tabId = Number(tabIdRaw);
  if (!hostname || !tabIdRaw || Number.isNaN(tabId)) {
    document.getElementById('blocked-message')?.classList.remove('hidden');
    appState.orgBlocked = true;
    return false;
  }
  const status = await getStatusForTab(tabId);
  if (status.hostname !== hostname) {
    document.getElementById('blocked-message')?.classList.remove('hidden');
    appState.orgBlocked = true;
    return false;
  }
  appState.hostname = hostname;
  appState.tabId = tabId;
  setCurrentHost(hostname);
  const org = await getOrgIdentity(hostname);
  appState.isSandbox = org.isSandbox;
  appState.orgId = org.orgId;
  const orgBadge = document.getElementById('org-badge');
  if (orgBadge) orgBadge.textContent = `${org.username} @ ${hostname}`;
  const sandboxBadge = document.getElementById('sandbox-badge');
  const productionBadge = document.getElementById('production-badge');
  if (org.isSandbox) {
    sandboxBadge?.classList.remove('hidden');
    productionBadge?.classList.add('hidden');
  } else {
    sandboxBadge?.classList.add('hidden');
    productionBadge?.classList.remove('hidden');
  }
  return true;
}

async function applyUserAffiliationToBoothSession(): Promise<boolean> {
  if (!appState.hostname) return false;
  const result = await resolveUserAffiliation(appState.hostname, {
    locations: appState.catalog?.catalogs.locations,
  });
  if (result.context) {
    appState.affiliationHint = null;
    const session = await loadBoothSession(appState.hostname);
    if (session.settings.accountSource === 'manual' && session.settings.accountId.trim()) {
      return false;
    }
    const updated = applyAffiliationToBoothSession(session, result.context);
    await saveBoothSession(appState.hostname, updated);
    appState.boothAccountId = updated.settings.accountId;
    return true;
  }
  if (!appState.boothAccountId.trim()) {
    appState.affiliationHint = affiliationFailureMessage(result);
  }
  return false;
}

async function loadInitialData(): Promise<void> {
  appState.catalog = await loadJson<LessonMasterCatalog>(STORAGE_KEYS.MASTER_CATALOG);
  const lessonSession = await loadLessonSession(appState.hostname);
  const closedSession = await loadClosedDateSession(appState.hostname);
  appState.lessons = lessonSession.lessons;
  appState.closedDates = closedSession.closedDates;
  appState.selectedLocationId = appState.catalog?.catalogs.locations[0]?.id ?? '';
  await applyUserAffiliationToBoothSession();
  const boothSession = await loadBoothSession(appState.hostname);
  appState.boothAccountId = boothSession.settings.accountId;
  rebuildPlans();
}

async function reconcileClosedDatesToBoothSession(): Promise<void> {
  if (!appState.hostname) return;
  const session = await loadBoothSession(appState.hostname);
  const { session: updated, changed } = reconcileClosedDates(session, appState.closedDates);
  if (changed) {
    await saveBoothSession(appState.hostname, updated);
  }
}

async function mountPanels(): Promise<void> {
  refreshClosedPanel = await mountClosedDatePanel(document.getElementById('closed-panel-root')!, {
    hostname: appState.hostname,
    catalog: appState.catalog,
    editorRoot: document.getElementById('closed-editor-root')!,
    onChange: async (closedDates) => {
      appState.closedDates = closedDates;
      rebuildPlans();
      const session = await loadBoothSession(appState.hostname);
      const { session: updated } = reconcileClosedDates(session, closedDates);
      await saveBoothSession(appState.hostname, updated);
      void refreshBoothPanel?.({ closedDates, reloadSession: true });
      void refreshPrintSheetPanel?.({ closedDates, reloadSession: true });
      void refreshReportPanel?.({ closedDates, reloadSession: true });
    },
  });
  refreshBoothPanel = await mountBoothGridPanel(document.getElementById('booth-panel-root')!, {
    hostname: appState.hostname,
    closedDates: appState.closedDates,
    catalog: appState.catalog,
    getWeekGapReport: () => ({ report: boothWeekGapReport, loading: boothWeekGapLoading }),
    onWeekGapRefresh: (options) => refreshBoothWeekGap(options),
    onSessionChange: (detail) => {
      markManabieCacheStale();
      void refreshPrintSheetPanel?.({
        reloadSession: true,
        resetDateRange: detail?.resetPrintDateRange,
      });
      void refreshReportPanel?.({ reloadSession: true });
      void rebuildSlotPlan(false);
    },
    onAccountChange: () => {
      invalidateManabieCache();
      void rebuildSlotPlan(true);
    },
    onLessonsChange: (lessons) => {
      appState.lessons = lessons;
      rebuildPlans();
    },
    onMarkClosedDate: async (date, title) => {
      if (appState.closedDates.some((c) => c.date === date)) {
        showToast('既に休校日です', 'error');
        return;
      }
      const yearName = String(schoolYearFromDate(date));
      const academicYear = appState.catalog?.catalogs.academicYears.find((y) => y.name.includes(yearName));
      const item: ClosedDateDefinition = {
        id: `closed-${Date.now()}`,
        title,
        date,
        academicYearId: academicYear?.id ?? '',
        academicYearName: academicYear?.name ?? yearName,
      };
      const closedDates = [...appState.closedDates, item];
      appState.closedDates = closedDates;
      await saveClosedDateSession(appState.hostname, { closedDates });
      rebuildPlans();
      const boothSession = await loadBoothSession(appState.hostname);
      const { session: updated } = reconcileClosedDates(boothSession, closedDates);
      await saveBoothSession(appState.hostname, updated);
      void refreshClosedPanel?.({});
      void refreshBoothPanel?.({ closedDates, reloadSession: true });
      void refreshPrintSheetPanel?.({ closedDates, reloadSession: true });
      showToast(`${date} を休校日に設定しました`, 'success');
    },
    onUnmarkClosedDate: async (date) => {
      const existing = appState.closedDates.find((c) => c.date === date);
      if (!existing) {
        showToast('休校日ではありません', 'error');
        return;
      }
      const closedDates = appState.closedDates.filter((c) => c.date !== date);
      appState.closedDates = closedDates;
      await saveClosedDateSession(appState.hostname, { closedDates });
      rebuildPlans();
      void refreshClosedPanel?.({});
      void refreshBoothPanel?.({ closedDates, reloadSession: false });
      void refreshPrintSheetPanel?.({ closedDates, reloadSession: false });
      showToast(`${date} の休校日を解除しました`, 'success');
    },
  });
  refreshPrintSheetPanel = await mountPrintSheetPanel(document.getElementById('print-sheet-panel-root')!, {
    hostname: appState.hostname,
    closedDates: appState.closedDates,
    catalog: appState.catalog,
    onSessionChange: () => {
      markManabieCacheStale();
      void refreshBoothPanel?.({ reloadSession: true });
      void refreshReportPanel?.({ reloadSession: true });
      void rebuildSlotPlan(false);
    },
    onLog: setExecutionLog,
    getSyncDockOptions: syncDockOptions,
    onSlotSyncExecuted: handleSlotSyncExecuted,
    onStudentSessionSyncExecuted: async (log, plan) => {
      await handleExecutionComplete(log, (session) =>
        applyStudentSessionSyncToManifest(session, log, plan.sourceRows),
      );
      if (log.success) await rebuildSlotPlan(true);
    },
    onStudentSessionCreateExecuted: async (log, plan) => {
      await handleExecutionComplete(log, (session) =>
        applyStudentSessionCreateToManifest(session, log, plan.sourceRows),
      );
      if (log.success) await rebuildSlotPlan(true);
    },
    onReallocationExecuted: async (log, plan) => {
      await handleExecutionComplete(log, (session) =>
        applyReallocationSyncToManifest(session, log, plan.sourceRows),
      );
      if (log.success) await rebuildSlotPlan(true);
    },
    onRefreshManabieData: () => refreshManabieData(),
    ensureFreshManabieCache: () => ensureFreshManabieCacheBeforeExecute(),
  });
  refreshReportPanel = await mountReportPanel(document.getElementById('report-panel-root')!, {
    hostname: appState.hostname,
    catalog: appState.catalog,
    closedDates: appState.closedDates,
    onInvoiceSynced: () => void refreshSetupChecklist(),
    getManaerpSessions: (dateFrom, dateTo) => getCachedManaerpSessions(dateFrom, dateTo),
    onRequestManaerpRefresh: () => refreshManabieData(),
  });
  await mountDrawerPanel(document.getElementById('drawer-root')!, appState.hostname);
  renderMasterSyncSummary(document.getElementById('master-sync-summary')!, appState.catalog);
  bindClosedDateRegistration();
  bindSetupChecklist(document.getElementById('setup-checklist-root')!);
  const previewSlotRoot = document.getElementById('slot-sync-preview-root');
  if (previewSlotRoot) {
    bindSlotSyncActions(previewSlotRoot, previewTabSlotOptions, setExecutionLog, {
      onSlotSyncExecuted: handleSlotSyncExecuted,
      ensureFreshManabieCache: () => ensureFreshManabieCacheBeforeExecute(),
    });
    refreshPreviewTabSlotSync();
  }
}

function bindClosedDateRegistration(): void {
  const panel = document.getElementById('closed-register-panel');
  const select = document.getElementById('closed-location-select') as HTMLSelectElement | null;
  if (!panel || !select || !appState.catalog) return;
  panel.classList.remove('hidden');
  select.innerHTML = appState.catalog.catalogs.locations
    .map((loc) => `<option value="${loc.id}">${loc.name}</option>`)
    .join('');
  if (closedRegistrationBound) return;
  closedRegistrationBound = true;
  select.addEventListener('change', () => {
    appState.selectedLocationId = select.value;
    rebuildPlans();
  });
  document.getElementById('btn-register-closed')?.addEventListener('click', async () => {
    if (!appState.closedPlan || !appState.catalog) return;
    appState.selectedLocationId = select.value;
    rebuildPlans();
    const phrase = await confirmSandboxExecute({
      title: '休校日 Manabie 登録',
      summaryHtml: '<p>休校日を Sandbox に登録します。</p>',
    });
    if (phrase !== SANDBOX_CONFIRMATION_PHRASE) return;
    try {
      const log = await registerClosedDatesToManabie(appState.closedPlan);
      setExecutionLog(formatExecutionLog(log));
      await handleExecutionComplete(log);
      showToast(log.success ? '休校日登録が完了しました' : '休校日登録に失敗しました', log.success ? 'success' : 'error');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setExecutionLog(msg);
      showToast(msg, 'error');
    }
  });
}

function bindDashboardChrome(): void {
  const CHROME_KEY = 'manabie-dashboard-chrome-collapsed';
  const chrome = document.getElementById('dashboard-chrome');
  const main = document.querySelector('.dashboard-main');
  const expandBtn = document.getElementById('btn-toggle-dashboard-chrome');
  const collapseBtn = document.getElementById('btn-collapse-chrome');
  const collapsedBadge = document.getElementById('org-badge-collapsed');
  const orgBadge = document.getElementById('org-badge');

  const apply = (collapsed: boolean) => {
    chrome?.classList.toggle('collapsed', collapsed);
    main?.classList.toggle('dashboard-main-expanded', collapsed);
    if (collapsedBadge && orgBadge) {
      collapsedBadge.textContent = orgBadge.textContent;
      collapsedBadge.classList.toggle('hidden', !orgBadge.textContent?.trim());
    }
    if (expandBtn) expandBtn.textContent = collapsed ? '▼' : '▲';
    try {
      localStorage.setItem(CHROME_KEY, collapsed ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  const collapsed = (() => {
    try {
      return localStorage.getItem(CHROME_KEY) === '1';
    } catch {
      return false;
    }
  })();
  apply(collapsed);

  const toggle = () => apply(!chrome?.classList.contains('collapsed'));
  expandBtn?.addEventListener('click', toggle);
  collapseBtn?.addEventListener('click', toggle);
}

function bindTabs(): void {
  document.querySelectorAll('.tab-btn').forEach((button) => {
    button.addEventListener('click', () => {
      const tab = (button as HTMLElement).dataset.tab!;
      document.querySelectorAll('.tab-btn').forEach((el) => el.classList.toggle('active', el === button));
      document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.add('hidden'));
      document.getElementById(`tab-${tab}`)?.classList.remove('hidden');
    });
  });
}

function bindDrawer(): void {
  document.getElementById('btn-close-drawer')?.addEventListener('click', () => {
    document.getElementById('side-drawer')?.classList.remove('open');
  });
  document.addEventListener('click', (event) => {
    const target = (event.target as HTMLElement).closest('[data-action="open-side-drawer"]');
    if (target) document.getElementById('side-drawer')?.classList.add('open');
  });
}

async function bindActions(): Promise<void> {
  document.getElementById('btn-sync-masters')?.addEventListener('click', async () => {
    setExecutionLog('Master sync running...');
    try {
      appState.catalog = await runMasterSync(appState.hostname);
      appState.selectedLocationId = appState.catalog.catalogs.locations[0]?.id ?? '';
      await applyUserAffiliationToBoothSession();
      renderMasterSyncSummary(document.getElementById('master-sync-summary')!, appState.catalog);
      bindClosedDateRegistration();
      await refreshClosedPanel?.({ catalog: appState.catalog });
      await refreshBoothPanel?.({ catalog: appState.catalog, reloadSession: true });
      await refreshPrintSheetPanel?.({ catalog: appState.catalog });
      await refreshReportPanel?.({ catalog: appState.catalog });
      rebuildPlans();
      invalidateManabieCache();
      await rebuildSlotPlan(true);
      await refreshSetupChecklist();
      setExecutionLog('Master sync completed.');
      showToast('前提マスタ同期が完了しました', 'success');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setExecutionLog(msg);
      showToast(msg, 'error');
    }
  });

  document.getElementById('btn-register-legacy')?.addEventListener('click', async () => {
    if (!appState.schedulePlan) return;
    const phrase = await confirmSandboxExecute({
      title: '授業スケジュール Manabie 登録',
      summaryHtml: '<p>Sandbox へ ImportPlan を実行します。</p>',
    });
    if (phrase !== SANDBOX_CONFIRMATION_PHRASE) {
      setExecutionLog('Registration cancelled: confirmation phrase mismatch.');
      return;
    }
    setExecutionLog('Registration running...');
    try {
      const log = await executeImportPlan(appState.schedulePlan, createDashboardApiClient(), {
        confirmed: true,
        confirmationPhrase: phrase,
      });
      setExecutionLog(formatExecutionLog(log));
      await handleExecutionComplete(log);
      showToast(log.success ? 'Manabie 登録が完了しました' : 'Manabie 登録に失敗しました', log.success ? 'success' : 'error');
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setExecutionLog(msg);
      showToast(msg, 'error');
    }
  });
}

async function saveExecutionLog(log: ExecutionLog): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_EXECUTION]: log });
}

async function init(): Promise<void> {
  const ok = await bindOrgContext();
  if (!ok) return;
  bindTabs();
  bindDashboardChrome();
  bindDrawer();
  await loadInitialData();
  await reconcileClosedDatesToBoothSession();
  await mountPanels();
  void refreshBoothPanel?.({ catalog: appState.catalog, reloadSession: true });
  await rebuildSlotPlan(true);
  await bindActions();
  await refreshSetupChecklist();
  updateRegisterButton();
  const lastLog = await loadJson<ExecutionLog>(STORAGE_KEYS.LAST_EXECUTION);
  if (lastLog) {
    appState.lastExecutionLog = lastLog;
    setExecutionLog(formatExecutionLog(lastLog));
  }
}

init().catch((error) => {
  setExecutionLog(error instanceof Error ? error.message : String(error));
});

export async function registerClosedDatesToManabie(
  plan: ClosedDateImportPlan,
): Promise<ExecutionLog> {
  return executeImportPlan(plan, createDashboardApiClient(), {
    confirmed: true,
    confirmationPhrase: SANDBOX_CONFIRMATION_PHRASE,
  });
}
