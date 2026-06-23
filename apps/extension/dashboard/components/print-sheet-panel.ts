import type {
  ClosedDateDefinition,
  LessonMasterCatalog,
  LessonSlotImportPlan,
  StudentSessionUpdatePlan,
  ExecutionLog,
} from '../../src/contracts';
import { formatDateKey, schoolYearFromDate } from '../../lib/calendar-utils';
import {
  ATTENDANCE_OPTIONS,
  applyAttendanceToCell,
  rowAttendanceCssClass,
  type AttendanceStatus,
} from '../../lib/booth-attendance';
import {
  boothCellsToPrintRows,
  buildSlotKey,
  type PrintSheetRow,
} from '../../lib/booth-print-sheet';
import type { LessonKind, StudentType } from '../../lib/booth-session-state';
import {
  getCell,
  loadBoothSession,
  mergePrintRowsIntoSession,
  saveBoothSession,
  upsertCell,
} from '../../lib/booth-session-state';
import { loadCenterScopedCatalog, studentsForPicker, teachersForPicker, type CenterScopedCatalog } from '../../src/services/center-scoped-catalog';
import { gradeFromCatalogRecord } from '../../lib/booth-grade-lookup';
import { bindSyncDockActions, renderSyncDock, type SyncDockOptions } from './sync-dock-panel';
import { rowNeedsSync } from '../../lib/sync-manifest';
import { mountEntitySearchModal } from './entity-search-modal';
import { renderEntityNamePickerRow } from './entity-name-picker-row';
import { showToast } from './toast';

export const PRINT_SHEET_VIRTUAL_THRESHOLD = 200;
const PRINT_SHEET_ROW_HEIGHT = 36;
const PRINT_SHEET_OVERSCAN = 8;

export function filterPrintSheetRows(
  rows: PrintSheetRow[],
  filters: {
    entityFilterType: '' | 'student' | 'teacher';
    entityName: string;
    unsyncedOnly: boolean;
    transferPendingOnly: boolean;
  },
): PrintSheetRow[] {
  let out = rows;
  if (filters.entityFilterType === 'student' && filters.entityName.trim()) {
    out = out.filter((row) => row.studentName.trim() === filters.entityName.trim());
  } else if (filters.entityFilterType === 'teacher' && filters.entityName.trim()) {
    out = out.filter((row) => row.teacherName.trim() === filters.entityName.trim());
  }
  if (filters.transferPendingOnly) {
    out = out.filter((row) => row.attendance === '振替' && !row.transferTo?.trim());
  }
  if (filters.unsyncedOnly) {
    out = out.filter((row) => row.syncVisual && rowNeedsSync(row.syncVisual));
  }
  return out;
}

export interface PrintSheetPanelOptions {
  hostname: string;
  closedDates: ClosedDateDefinition[];
  catalog?: LessonMasterCatalog | null;
  onSessionChange?: () => void;
  onLog?: (text: string) => void;
  getSlotPlan?: () => LessonSlotImportPlan | null;
  getStudentSessionPlan?: () => StudentSessionUpdatePlan | null;
  getStudentSessionLoading?: () => boolean;
  getScheduleGapReport?: () => import('../../src/services/lessonScheduleGapService').ScheduleGapReport | null;
  getSyncDockOptions?: () => SyncDockOptions;
  onSlotSyncExecuted?: (log: ExecutionLog, plan: LessonSlotImportPlan) => void | Promise<void>;
  onStudentSessionSyncExecuted?: (
    log: ExecutionLog,
    plan: StudentSessionUpdatePlan,
  ) => void | Promise<void>;
  onStudentSessionCreateExecuted?: (
    log: ExecutionLog,
    plan: import('../../src/contracts').StudentSessionCreatePlan,
  ) => void | Promise<void>;
  onReallocationExecuted?: (
    log: ExecutionLog,
    plan: import('../../src/contracts').ReallocationPlan,
  ) => void | Promise<void>;
  onRefreshManabieData?: () => void | Promise<void>;
  ensureFreshManabieCache?: () => Promise<boolean>;
}

export interface PrintSheetPanelRefreshOptions {
  closedDates?: ClosedDateDefinition[];
  catalog?: LessonMasterCatalog | null;
  reloadSession?: boolean;
  refreshSlotSync?: boolean;
  resetDateRange?: boolean;
}

function dateKeysInRange(from: string, to: string): string[] {
  if (!from || !to || from > to) return [];
  const keys: string[] = [];
  let current = new Date(`${from}T12:00:00`);
  const end = new Date(`${to}T12:00:00`);
  while (current <= end) {
    keys.push(formatDateKey(current));
    current = new Date(current.getTime() + 86400000);
  }
  return keys;
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function escapeAttr(text: string): string {
  return text.replace(/"/g, '&quot;');
}

function fiscalYearRange(fiscalYear: string): { from: string; to: string } {
  const year = Number(fiscalYear) || schoolYearFromDate(formatDateKey(new Date()));
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}

const LESSON_KIND_OPTIONS: LessonKind[] = ['通常', '体験'];
const STUDENT_TYPE_OPTIONS: StudentType[] = ['在籍', '未入会'];

export async function mountPrintSheetPanel(
  root: HTMLElement,
  options: PrintSheetPanelOptions,
): Promise<(partial?: Partial<PrintSheetPanelRefreshOptions>) => void> {
  let session = await loadBoothSession(options.hostname);
  let closedDates = options.closedDates;
  let centerCatalog: CenterScopedCatalog | null = null;
  let entityFilterType: '' | 'student' | 'teacher' = '';
  let entityName = '';
  let dateFrom = '';
  let dateTo = '';
  let showSlotKey = false;
  let unsyncedOnly = false;
  let transferPendingOnly = false;
  let closeEntityModal: (() => void) | null = null;
  let closeRowPicker: (() => void) | null = null;
  let suppressPickerUntil = 0;
  let virtualScrollEl: HTMLElement | null = null;
  let virtualRowsCache: PrintSheetRow[] = [];
  let bound = false;
  let slotSyncBound = false;

  const persist = debounce(async () => {
    await saveBoothSession(options.hostname, session);
    options.onSessionChange?.();
  }, 300);

  const visibleDateKeys = (): string[] => dateKeysInRange(dateFrom, dateTo);

  const allRows = (): PrintSheetRow[] =>
    boothCellsToPrintRows(
      session.cells,
      session.settings,
      visibleDateKeys(),
      session.slotMeta,
      session.syncManifest,
    );

  const filteredRows = (): PrintSheetRow[] =>
    filterPrintSheetRows(allRows(), {
      entityFilterType,
      entityName,
      unsyncedOnly,
      transferPendingOnly,
    });

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

  const openEntityFilterModal = () => {
    if (!entityFilterType) {
      return;
    }
    closeEntityModal?.();
    const records =
      entityFilterType === 'teacher'
        ? teachersForPicker(centerCatalog, options.catalog?.catalogs.teachers)
        : studentsForPicker(centerCatalog, options.catalog?.catalogs.students);
    if (!records.length) {
      showToast('所属校舎の一覧がありません。Account を設定してください。', 'error');
      return;
    }
    closeEntityModal = mountEntitySearchModal({
      kind: entityFilterType,
      title: entityFilterType === 'teacher' ? '講師を選択（絞り込み）' : '生徒を選択（絞り込み）',
      records,
      initialQuery: entityName,
      onSelect: (record) => {
        entityName = record.name;
        renderAll();
      },
      onClose: () => {
        closeEntityModal = null;
      },
    });
  };

  const shell = document.createElement('div');
  shell.className = 'print-sheet-layout';
  shell.innerHTML = `
    <header class="print-sheet-toolbar panel-card"></header>
    <div class="print-sheet-main">
      <section class="print-sheet-table-area panel-card">
        <div class="print-table-host"></div>
      </section>
    </div>
    <div class="print-sheet-sync-host panel-card"></div>
  `;
  root.replaceChildren(shell);

  const toolbarEl = shell.querySelector('.print-sheet-toolbar') as HTMLElement;
  const tableHost = shell.querySelector('.print-table-host') as HTMLElement;
  const slotSyncHost = shell.querySelector('.print-sheet-sync-host') as HTMLElement;

  const renderToolbar = () => {
    if (!dateFrom && !dateTo) {
      const fy = fiscalYearRange(session.settings.fiscalYear);
      dateFrom = fy.from;
      dateTo = fy.to;
    }
    const range = dateFrom && dateTo ? `${dateFrom} 〜 ${dateTo}` : '—';
    const nameDisabled = !entityFilterType;
    toolbarEl.innerHTML = `
      <h2>授業一覧</h2>
      <div class="print-toolbar-row">
        <strong>${session.settings.classroomName}</strong>
        <span class="muted">${range} / ${filteredRows().length} 行</span>
      </div>
      <div class="print-toolbar-row print-filter-row">
        <label class="inline-filter">絞り込み
          <select id="print-entity-type">
            <option value="" ${entityFilterType === '' ? 'selected' : ''}>指定なし（全件）</option>
            <option value="student" ${entityFilterType === 'student' ? 'selected' : ''}>生徒</option>
            <option value="teacher" ${entityFilterType === 'teacher' ? 'selected' : ''}>講師</option>
          </select>
        </label>
        <label class="inline-filter">名前
          ${renderEntityNamePickerRow({
            value: entityName,
            placeholder: nameDisabled ? '先に生徒 or 講師' : '名前を選択',
            pickAction: 'print-entity-pick',
            clearAction: 'print-entity-clear',
            disabled: nameDisabled,
          })}
        </label>
        <label class="inline-filter">期間（自）<input id="print-date-from" type="date" value="${escapeAttr(dateFrom)}" /></label>
        <label class="inline-filter">期間（至）<input id="print-date-to" type="date" value="${escapeAttr(dateTo)}" /></label>
        <label class="inline-filter"><input id="print-show-slotkey" type="checkbox" ${showSlotKey ? 'checked' : ''} /> slotKey</label>
        <label class="inline-filter"><input id="print-unsynced-only" type="checkbox" ${unsyncedOnly ? 'checked' : ''} /> 未同期のみ</label>
        <label class="inline-filter"><input id="print-transfer-pending" type="checkbox" ${transferPendingOnly ? 'checked' : ''} /> 振替待ちのみ</label>
      </div>
    `;
  };

  const tableColumnCount = (): number => (showSlotKey ? 18 : 17);

  const renderRowHtml = (row: PrintSheetRow, index: number): string => {
    const attendOptions = ATTENDANCE_OPTIONS.map(
      (option) =>
        `<option value="${option}" ${row.attendance === option ? 'selected' : ''}>${option}</option>`,
    ).join('');
    const lessonKindOptions = LESSON_KIND_OPTIONS.map(
      (kind) => `<option value="${kind}" ${row.lessonKind === kind ? 'selected' : ''}>${kind}</option>`,
    ).join('');
    const studentTypeOptions = STUDENT_TYPE_OPTIONS.map(
      (type) => `<option value="${type}" ${row.studentType === type ? 'selected' : ''}>${type}</option>`,
    ).join('');
    const rowCls = [
      row.irregular ? 'row-irregular' : '',
      rowAttendanceCssClass(row.attendance),
      row.syncVisual?.overall === 'stale' ? 'row-sync-stale' : '',
    ]
      .filter(Boolean)
      .join(' ');
    const slotKeyCell = showSlotKey ? `<td class="muted mono">${escapeAttr(row.slotKey)}</td>` : '';
    const syncCell = row.syncVisualHtml ?? '<span class="muted">—</span>';
    return `<tr class="${rowCls}" data-row-index="${index}">
      <td>${escapeAttr(row.dayOfWeek)}</td>
      <td><input data-field="date" data-row-index="${index}" value="${escapeAttr(row.date)}" /></td>
      <td><input data-field="booth" data-row-index="${index}" type="number" min="1" value="${row.booth}" /></td>
      <td><input data-field="period" data-row-index="${index}" type="number" min="1" value="${row.period}" /></td>
      <td>${row.seat}${row.irregular ? ' △' : ''}</td>
      <td><button type="button" class="booth-entity-btn booth-entity-empty" data-field="teacherName" data-picker="teacher" data-row-index="${index}" data-placeholder="講師" title="ダブルクリックで選択・Alt+クリックで解除">${escapeAttr(row.teacherName || '講師')}</button></td>
      <td><button type="button" class="booth-entity-btn ${row.studentName.trim() ? 'booth-entity-filled' : 'booth-entity-empty'}" data-field="studentName" data-picker="student" data-row-index="${index}" data-placeholder="生徒" title="ダブルクリックで選択・Alt+クリックで解除">${escapeAttr(row.studentName || '生徒')}</button></td>
      <td><input data-field="grade" data-row-index="${index}" value="${escapeAttr(row.grade)}" placeholder="学年" /></td>
      <td><input data-field="subject" data-row-index="${index}" value="${escapeAttr(row.subject)}" /></td>
      <td><select data-field="lessonKind" data-row-index="${index}">${lessonKindOptions}</select></td>
      <td><input data-field="countTarget" data-row-index="${index}" type="checkbox" ${row.countTarget !== false ? 'checked' : ''} /></td>
      <td><select data-field="studentType" data-row-index="${index}">${studentTypeOptions}</select></td>
      <td><select data-field="attendance" data-row-index="${index}">${attendOptions}</select></td>
      <td><input data-field="transferFrom" data-row-index="${index}" value="${escapeAttr(row.transferFrom ?? '')}" placeholder="振替元" /></td>
      <td><input data-field="transferTo" data-row-index="${index}" value="${escapeAttr(row.transferTo ?? '')}" placeholder="振替先" /></td>
      <td><input data-field="note" data-row-index="${index}" value="${escapeAttr(row.note)}" placeholder="備考" /></td>
      <td class="sync-cell">${syncCell}</td>
      ${slotKeyCell}
    </tr>`;
  };

  const renderTableHead = (): string => {
    const slotKeyHeader = showSlotKey ? '<th>slotKey</th>' : '';
    return `<thead><tr>
      <th>曜</th><th>日付</th><th>ブース</th><th>時限</th><th>席</th><th>講師</th><th>生徒</th><th>学年</th><th>教科</th>
      <th>授業種別</th><th>回数対象</th><th>生徒区分</th><th>出欠</th><th>振替元</th><th>振替先</th><th>備考</th><th>SF</th>
      ${slotKeyHeader}
    </tr></thead>`;
  };

  const updateVirtualTableBody = () => {
    if (!virtualScrollEl || virtualRowsCache.length <= PRINT_SHEET_VIRTUAL_THRESHOLD) return;
    const scrollTop = virtualScrollEl.scrollTop;
    const viewport = virtualScrollEl.clientHeight || 480;
    const start = Math.max(0, Math.floor(scrollTop / PRINT_SHEET_ROW_HEIGHT) - PRINT_SHEET_OVERSCAN);
    const visibleCount = Math.ceil(viewport / PRINT_SHEET_ROW_HEIGHT) + PRINT_SHEET_OVERSCAN * 2;
    const end = Math.min(virtualRowsCache.length, start + visibleCount);
    const topPad = start * PRINT_SHEET_ROW_HEIGHT;
    const bottomPad = Math.max(0, (virtualRowsCache.length - end) * PRINT_SHEET_ROW_HEIGHT);
    const colCount = tableColumnCount();
    const tbody = virtualScrollEl.querySelector('tbody');
    if (!tbody) return;
    const topSpacer = topPad
      ? `<tr class="print-virtual-spacer" aria-hidden="true"><td colspan="${colCount}" style="height:${topPad}px;padding:0;border:none"></td></tr>`
      : '';
    const bottomSpacer = bottomPad
      ? `<tr class="print-virtual-spacer" aria-hidden="true"><td colspan="${colCount}" style="height:${bottomPad}px;padding:0;border:none"></td></tr>`
      : '';
    tbody.innerHTML = `${topSpacer}${virtualRowsCache
      .slice(start, end)
      .map((row, offset) => renderRowHtml(row, start + offset))
      .join('')}${bottomSpacer}`;
  };

  const renderTable = () => {
    const rows = filteredRows();
    virtualRowsCache = rows;
    if (!rows.length) {
      virtualScrollEl = null;
      tableHost.innerHTML = '<p class="muted">表示期間内の授業行がありません。コマ組タブで入力するか、絞り込み条件を変更してください。</p>';
      return;
    }
    if (rows.length <= PRINT_SHEET_VIRTUAL_THRESHOLD) {
      virtualScrollEl = null;
      const body = rows.map((row, index) => renderRowHtml(row, index)).join('');
      tableHost.innerHTML = `<div class="print-sheet-table-scroll"><table class="print-sheet-table">
        ${renderTableHead()}
        <tbody>${body}</tbody>
      </table></div>`;
      return;
    }
    tableHost.innerHTML = `<div class="print-sheet-table-scroll print-sheet-virtual"><table class="print-sheet-table">
      ${renderTableHead()}
      <tbody></tbody>
    </table></div>`;
    virtualScrollEl = tableHost.querySelector('.print-sheet-table-scroll');
    virtualScrollEl!.scrollTop = 0;
    virtualScrollEl!.onscroll = () => updateVirtualTableBody();
    updateVirtualTableBody();
  };

  const syncAttendanceFromTable = (rowIndex: number, status: AttendanceStatus) => {
    const filtered = filteredRows();
    const target = filtered[rowIndex];
    if (!target) return;
    const cell = getCell(session, target.date, target.booth, target.period, target.seat);
    upsertCell(session, applyAttendanceToCell(cell, status));
    void persist();
  };

  const syncRowsFromTable = (
    rowIndex: number,
    field: keyof PrintSheetRow,
    value: string | number | boolean,
  ) => {
    const rows = allRows();
    const filtered = filteredRows();
    const target = filtered[rowIndex];
    if (!target) return;
    const fullIndex = rows.findIndex((r) => r.slotKey === target.slotKey);
    if (fullIndex < 0) return;
    const updated = { ...rows[fullIndex]! };

    if (field === 'booth' || field === 'period') {
      updated[field] = Number(value) || updated[field];
    } else if (field === 'countTarget') {
      updated.countTarget = Boolean(value);
    } else if (
      field === 'date' ||
      field === 'studentName' ||
      field === 'subject' ||
      field === 'grade' ||
      field === 'teacherName' ||
      field === 'lessonKind' ||
      field === 'studentType' ||
      field === 'note' ||
      field === 'transferFrom' ||
      field === 'transferTo'
    ) {
      updated[field] = String(value);
    }

    if (field === 'lessonKind' && updated.lessonKind === '体験') {
      updated.countTarget = false;
    }

    if (field === 'date' || field === 'booth' || field === 'period') {
      updated.slotKey = buildSlotKey(updated.date, updated.booth, updated.period, updated.seat);
    }

    rows[fullIndex] = updated;
    mergePrintRowsIntoSession(session, rows, visibleDateKeys());
    void persist();
  };

  const renderSlotSync = () => {
    const dockOptions = options.getSyncDockOptions?.();
    if (!dockOptions) return;
    renderSyncDock(slotSyncHost, dockOptions);
    if (!slotSyncBound && options.onLog) {
      slotSyncBound = true;
      bindSyncDockActions(slotSyncHost, () => options.getSyncDockOptions?.()!, options.onLog!, {
        onSlotSyncExecuted: options.onSlotSyncExecuted,
        onStudentSessionSyncExecuted: options.onStudentSessionSyncExecuted,
        onStudentSessionCreateExecuted: options.onStudentSessionCreateExecuted,
        onReallocationExecuted: options.onReallocationExecuted,
        onRefreshManabieData: options.onRefreshManabieData,
        ensureFreshManabieCache: options.ensureFreshManabieCache,
      });
    }
  };

  const renderAll = () => {
    renderToolbar();
    renderTable();
    renderSlotSync();
  };

  const bindEvents = () => {
    if (bound) return;
    bound = true;

    shell.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      if (target.dataset.action === 'print-entity-pick') {
        openEntityFilterModal();
        return;
      }
      if (target.dataset.action === 'print-entity-clear') {
        entityName = '';
        renderAll();
      }
    });

    shell.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement;
      const field = target.dataset.field;
      const rowIndexRaw = target.dataset.rowIndex;
      if (field === 'attendance' && rowIndexRaw !== undefined) {
        syncAttendanceFromTable(Number(rowIndexRaw), target.value as AttendanceStatus);
        return;
      }
      if (target.id === 'print-entity-type') {
        entityFilterType = target.value as '' | 'student' | 'teacher';
        entityName = '';
        renderAll();
        return;
      }
      if (target.id === 'print-transfer-pending') {
        transferPendingOnly = (target as HTMLInputElement).checked;
        renderToolbar();
        renderTable();
        return;
      }
      if (target.id === 'print-date-from') {
        dateFrom = target.value;
        renderAll();
        return;
      }
      if (target.id === 'print-date-to') {
        dateTo = target.value;
        renderAll();
        return;
      }
      if (target.id === 'print-show-slotkey') {
        showSlotKey = (target as HTMLInputElement).checked;
        renderTable();
        return;
      }
      if (target.id === 'print-unsynced-only') {
        unsyncedOnly = (target as HTMLInputElement).checked;
        renderTable();
        return;
      }
      if (field && rowIndexRaw !== undefined) {
        const value =
          field === 'countTarget' ? (target as HTMLInputElement).checked : target.value;
        syncRowsFromTable(Number(rowIndexRaw), field as keyof PrintSheetRow, value);
        if (field === 'lessonKind' || field === 'countTarget') renderTable();
      }
    });

    shell.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const field = target.dataset.field as keyof PrintSheetRow | undefined;
      const rowIndexRaw = target.dataset.rowIndex;
      if (!field || rowIndexRaw === undefined) return;
      if (target.dataset.picker) return;
      syncRowsFromTable(Number(rowIndexRaw), field, target.value);
    });

    shell.addEventListener('dblclick', (event) => {
      const target = (event.target as HTMLElement).closest('[data-picker="student"], [data-picker="teacher"]') as HTMLElement | null;
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      const picker = target.dataset.picker;
      if (picker !== 'student' && picker !== 'teacher') return;
      if (Date.now() < suppressPickerUntil) return;

      closeRowPicker?.();
      const records =
        picker === 'teacher'
          ? teachersForPicker(centerCatalog, options.catalog?.catalogs.teachers)
          : studentsForPicker(centerCatalog, options.catalog?.catalogs.students);
      if (!records.length) {
        showToast('所属校舎の一覧がありません。Account を設定してください。', 'error');
        return;
      }
      const rowIndex = Number(target.dataset.rowIndex);
      closeRowPicker = mountEntitySearchModal({
        kind: picker,
        title: picker === 'teacher' ? '講師を選択' : '生徒を選択',
        records,
        initialQuery: current === placeholder ? '' : current,
        onSelect: (record) => {
          suppressPickerUntil = Date.now() + 250;
          if (picker === 'teacher') {
            syncRowsFromTable(rowIndex, 'teacherName', record.name);
          } else {
            syncRowsFromTable(rowIndex, 'studentName', record.name);
            const grade = gradeFromCatalogRecord(record);
            if (grade) syncRowsFromTable(rowIndex, 'grade', grade);
          }
          target.blur();
          renderTable();
        },
        onClose: () => {
          closeRowPicker = null;
        },
      });
    });
  };

  bindEvents();
  await reloadCenterCatalog();
  renderAll();

  return async (partial) => {
    if (partial?.closedDates) closedDates = partial.closedDates;
    if (partial?.reloadSession) {
      session = await loadBoothSession(options.hostname);
      await reloadCenterCatalog();
    }
    if (partial?.resetDateRange) {
      const fy = fiscalYearRange(session.settings.fiscalYear);
      dateFrom = fy.from;
      dateTo = fy.to;
    }
    if (partial?.refreshSlotSync) {
      renderSlotSync();
      return;
    }
    renderAll();
  };
}
