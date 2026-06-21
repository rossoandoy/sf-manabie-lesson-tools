import type {
  ClosedDateDefinition,
  LessonMasterCatalog,
  LessonSlotImportPlan,
  StudentSessionUpdatePlan,
  ExecutionLog,
} from '../../src/contracts';
import { formatDateKey, schoolYearFromDate, weekRow } from '../../lib/calendar-utils';
import { jumpToToday, navigateNext, navigatePrev } from '../../lib/calendar/calendar-state';
import { createInitialCalendarState, type CalendarUIState } from '../../lib/calendar/calendar-state';
import {
  ATTENDANCE_OPTIONS,
  applyAttendanceToCell,
  registerTransfer,
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
  applyRepeatPlan,
  dryRunRepeat,
  getCell,
  loadBoothSession,
  mergePrintRowsIntoSession,
  rescheduleRepeat,
  saveBoothSession,
  upsertCell,
  type RepeatRecord,
} from '../../lib/booth-session-state';
import { bindSyncDockActions, renderSyncDock, type SyncDockOptions } from './sync-dock-panel';
import { rowNeedsSync } from '../../lib/sync-manifest';
import {
  applyTeacherRepeat,
  dryRunTeacherRepeat,
  rescheduleTeacherRepeat,
  type TeacherRepeatRecord,
} from '../../lib/booth-teacher-repeat';
import { confirmAction } from './confirm-modal';
import { showToast } from './toast';

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
}

function visibleWeekDates(state: CalendarUIState, hideSunday: boolean): Date[] {
  const dates = weekRow(state.anchor);
  return hideSunday ? dates.filter((d) => d.getDay() !== 0) : dates;
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
  let navState = createInitialCalendarState();
  navState.view = 'week';
  let nameFilter = '';
  let kindFilter = '';
  let dateFrom = '';
  let dateTo = '';
  let showSlotKey = false;
  let unsyncedOnly = false;
  let repeatMode: 'student' | 'teacher' = 'student';
  let pendingRepeatPlan: ReturnType<typeof dryRunRepeat> | null = null;
  let pendingTeacherRepeat: { dates: string[]; skips: { date: string; reason: string }[] } | null = null;
  let pendingRepeatInput: Omit<RepeatRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'> | null = null;
  let pendingTeacherInput: Omit<TeacherRepeatRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'> | null = null;
  let bound = false;
  let slotSyncBound = false;

  const persist = debounce(async () => {
    await saveBoothSession(options.hostname, session);
    options.onSessionChange?.();
  }, 300);

  const weekDateKeys = (): string[] =>
    visibleWeekDates(navState, session.settings.hideSunday).map(formatDateKey);

  const allRows = (): PrintSheetRow[] =>
    boothCellsToPrintRows(
      session.cells,
      session.settings,
      weekDateKeys(),
      session.slotMeta,
      session.syncManifest,
    );

  const filteredRows = (): PrintSheetRow[] => {
    let rows = allRows();
    const needle = nameFilter.trim();
    if (needle) rows = rows.filter((row) => row.studentName.includes(needle));
    if (unsyncedOnly) rows = rows.filter((row) => row.syncVisual && rowNeedsSync(row.syncVisual));
    if (kindFilter.startsWith('att:')) {
      const status = kindFilter.slice(4);
      rows = rows.filter((row) => row.attendance === status);
    } else if (kindFilter === 'transfer-pending') {
      rows = rows.filter((row) => row.attendance === '振替' && !row.transferTo?.trim());
    } else if (kindFilter.startsWith('kind:')) {
      const kind = kindFilter.slice(5) as LessonKind;
      rows = rows.filter((row) => row.lessonKind === kind);
    }
    if (dateFrom) rows = rows.filter((row) => row.date >= dateFrom);
    if (dateTo) rows = rows.filter((row) => row.date <= dateTo);
    return rows;
  };

  const shell = document.createElement('div');
  shell.className = 'print-sheet-layout';
  shell.innerHTML = `
    <header class="print-sheet-toolbar panel-card"></header>
    <div class="print-sheet-main">
      <section class="print-sheet-table-area panel-card">
        <div class="print-table-host"></div>
      </section>
      <aside class="print-sheet-repeat panel-card">
        <h2>繰り返し配置</h2>
        <div class="repeat-mode-toggle">
          <button type="button" class="btn btn-sm ${repeatMode === 'student' ? 'primary' : ''}" data-action="repeat-mode-student">生徒</button>
          <button type="button" class="btn btn-sm ${repeatMode === 'teacher' ? 'primary' : ''}" data-action="repeat-mode-teacher">講師</button>
        </div>
        <div class="repeat-form-host"></div>
        <div class="repeat-preview-host"></div>
        <div class="repeat-actions footer-actions">
          <button type="button" class="btn" data-action="repeat-preview">プレビュー</button>
          <button type="button" class="btn primary" data-action="repeat-apply" disabled>適用</button>
        </div>
        <div class="repeat-skip-host"></div>
        <h3>登録済み繰り返し</h3>
        <div class="repeat-list-host"></div>
        <h3>振替待ち</h3>
        <div class="transfer-pending-host"></div>
        <button type="button" class="btn" data-action="transfer-wizard">振替ウィザード</button>
      </aside>
    </div>
    <div class="print-sheet-sync-host panel-card"></div>
  `;
  root.replaceChildren(shell);

  const toolbarEl = shell.querySelector('.print-sheet-toolbar') as HTMLElement;
  const tableHost = shell.querySelector('.print-table-host') as HTMLElement;
  const repeatFormHost = shell.querySelector('.repeat-form-host') as HTMLElement;
  const repeatPreviewHost = shell.querySelector('.repeat-preview-host') as HTMLElement;
  const repeatSkipHost = shell.querySelector('.repeat-skip-host') as HTMLElement;
  const repeatListHost = shell.querySelector('.repeat-list-host') as HTMLElement;
  const transferPendingHost = shell.querySelector('.transfer-pending-host') as HTMLElement;
  const slotSyncHost = shell.querySelector('.print-sheet-sync-host') as HTMLElement;
  const applyBtn = shell.querySelector('[data-action="repeat-apply"]') as HTMLButtonElement;

  const renderToolbar = () => {
    const dates = weekDateKeys();
    const range = dates.length ? `${dates[0]} 〜 ${dates[dates.length - 1]}` : '—';
    if (!dateFrom && !dateTo) {
      const fy = fiscalYearRange(session.settings.fiscalYear);
      dateFrom = fy.from;
      dateTo = fy.to;
    }
    const kindOptions = [
      `<option value="">種別: すべて</option>`,
      ...LESSON_KIND_OPTIONS.map(
        (kind) =>
          `<option value="kind:${kind}" ${kindFilter === `kind:${kind}` ? 'selected' : ''}>授業: ${kind}</option>`,
      ),
      ...ATTENDANCE_OPTIONS.map(
        (status) =>
          `<option value="att:${status}" ${kindFilter === `att:${status}` ? 'selected' : ''}>出欠: ${status}</option>`,
      ),
      `<option value="transfer-pending" ${kindFilter === 'transfer-pending' ? 'selected' : ''}>振替待ち（先日未確定）</option>`,
    ].join('');
    toolbarEl.innerHTML = `
      <h2>PrintSheet（配布用授業スケジュール）</h2>
      <div class="print-toolbar-row">
        <strong>${session.settings.classroomName}</strong>
        <span class="muted">${range}</span>
      </div>
      <div class="print-toolbar-row print-filter-row">
        <label class="inline-filter">生徒<input id="print-name-filter" value="${escapeAttr(nameFilter)}" placeholder="生徒名" /></label>
        <label class="inline-filter">種別<select id="print-kind-filter">${kindOptions}</select></label>
        <label class="inline-filter">期間（自）<input id="print-date-from" type="date" value="${escapeAttr(dateFrom)}" /></label>
        <label class="inline-filter">期間（至）<input id="print-date-to" type="date" value="${escapeAttr(dateTo)}" /></label>
        <label class="inline-filter"><input id="print-show-slotkey" type="checkbox" ${showSlotKey ? 'checked' : ''} /> slotKey</label>
        <label class="inline-filter"><input id="print-unsynced-only" type="checkbox" ${unsyncedOnly ? 'checked' : ''} /> 未同期のみ</label>
      </div>
      <div class="print-toolbar-row footer-actions">
        <button type="button" class="btn" data-action="print-prev">◀ 週</button>
        <button type="button" class="btn" data-action="print-today">Today</button>
        <button type="button" class="btn" data-action="print-next">週 ▶</button>
      </div>
    `;
  };

  const renderRepeatForm = () => {
    if (repeatMode === 'teacher') {
      repeatFormHost.innerHTML = `
        <label>講師名<input id="teacher-repeat-name" /></label>
        <label>曜日
          <select id="teacher-repeat-dow">
            <option value="0">日</option><option value="1">月</option><option value="2">火</option>
            <option value="3">水</option><option value="4">木</option><option value="5">金</option><option value="6">土</option>
          </select>
        </label>
        <label>時限<input id="teacher-repeat-period" type="number" min="1" max="10" value="1" /></label>
        <label>ブース<input id="teacher-repeat-booth" type="number" min="1" max="12" value="1" /></label>
        <label>間隔
          <select id="teacher-repeat-interval"><option value="weekly">毎週</option><option value="biweekly">隔週</option></select>
        </label>
        <label>開始日<input id="teacher-repeat-start" type="date" /></label>
        <label>終了日<input id="teacher-repeat-end" type="date" /></label>
      `;
    } else {
      repeatFormHost.innerHTML = `
      <label>生徒名<input id="repeat-name" /></label>
      <label>教科<input id="repeat-subject" /></label>
      <label>曜日
        <select id="repeat-dow">
          <option value="0">日</option><option value="1">月</option><option value="2">火</option>
          <option value="3">水</option><option value="4">木</option><option value="5">金</option><option value="6">土</option>
        </select>
      </label>
      <label>時限<input id="repeat-period" type="number" min="1" max="10" value="1" /></label>
      <label>ブース<input id="repeat-booth" type="number" min="1" max="12" value="1" /></label>
      <label>自席
        <select id="repeat-home-seat"><option value="1">席1</option><option value="2">席2</option></select>
      </label>
      <label>定員
        <select id="repeat-capacity"><option value="1:1">1:1</option><option value="1:2">1:2</option></select>
      </label>
      <label>間隔
        <select id="repeat-interval"><option value="weekly">毎週</option><option value="biweekly">隔週</option></select>
      </label>
      <label>開始日<input id="repeat-start" type="date" /></label>
      <label>終了日<input id="repeat-end" type="date" /></label>
    `;
    }
    const start = weekDateKeys()[0];
    const end = weekDateKeys().slice(-1)[0];
    const startSel = repeatMode === 'teacher' ? '#teacher-repeat-start' : '#repeat-start';
    const endSel = repeatMode === 'teacher' ? '#teacher-repeat-end' : '#repeat-end';
    if (start) (repeatFormHost.querySelector(startSel) as HTMLInputElement).value = start;
    if (end) (repeatFormHost.querySelector(endSel) as HTMLInputElement).value = end;
  };

  const readTeacherRepeatInput = (): Omit<TeacherRepeatRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'> => ({
    teacherName: (repeatFormHost.querySelector('#teacher-repeat-name') as HTMLInputElement).value.trim(),
    dow: Number((repeatFormHost.querySelector('#teacher-repeat-dow') as HTMLSelectElement).value),
    period: Math.max(1, Number((repeatFormHost.querySelector('#teacher-repeat-period') as HTMLInputElement).value) || 1),
    booth: Math.max(1, Number((repeatFormHost.querySelector('#teacher-repeat-booth') as HTMLInputElement).value) || 1),
    interval: (repeatFormHost.querySelector('#teacher-repeat-interval') as HTMLSelectElement).value as 'weekly' | 'biweekly',
    startDate: (repeatFormHost.querySelector('#teacher-repeat-start') as HTMLInputElement).value,
    endDate: (repeatFormHost.querySelector('#teacher-repeat-end') as HTMLInputElement).value,
  });

  const readRepeatInput = (): Omit<RepeatRecord, 'id' | 'status' | 'createdAt' | 'updatedAt'> => ({
    type: 'student',
    name: (repeatFormHost.querySelector('#repeat-name') as HTMLInputElement).value.trim(),
    subject: (repeatFormHost.querySelector('#repeat-subject') as HTMLInputElement).value.trim(),
    dow: Number((repeatFormHost.querySelector('#repeat-dow') as HTMLSelectElement).value),
    period: Math.max(1, Number((repeatFormHost.querySelector('#repeat-period') as HTMLInputElement).value) || 1),
    booth: Math.max(1, Number((repeatFormHost.querySelector('#repeat-booth') as HTMLInputElement).value) || 1),
    homeSeat: Number((repeatFormHost.querySelector('#repeat-home-seat') as HTMLSelectElement).value) as 1 | 2,
    capacity: (repeatFormHost.querySelector('#repeat-capacity') as HTMLSelectElement).value as '1:1' | '1:2',
    interval: (repeatFormHost.querySelector('#repeat-interval') as HTMLSelectElement).value as 'weekly' | 'biweekly',
    startDate: (repeatFormHost.querySelector('#repeat-start') as HTMLInputElement).value,
    endDate: (repeatFormHost.querySelector('#repeat-end') as HTMLInputElement).value,
  });

  const renderRepeatPreview = () => {
    if (repeatMode === 'teacher') {
      if (!pendingTeacherRepeat) {
        repeatPreviewHost.innerHTML = '<p class="muted">プレビュー未実行</p>';
        return;
      }
      const body = pendingTeacherRepeat.dates.map((date) => `<tr><td>${date}</td><td>講師配置</td></tr>`).join('');
      repeatPreviewHost.innerHTML = `<table class="print-preview-table"><thead><tr><th>日付</th><th>内容</th></tr></thead><tbody>${body || '<tr><td colspan="2" class="muted">配置なし</td></tr>'}</tbody></table>`;
      return;
    }
    if (!pendingRepeatPlan) {
      repeatPreviewHost.innerHTML = '<p class="muted">プレビュー未実行</p>';
      return;
    }
    const body = pendingRepeatPlan.plan
      .map(
        (item) =>
          `<tr class="${item.irregular ? 'row-irregular' : ''}"><td>${item.date}</td><td>${item.seat}${item.irregular ? ' △' : ''}</td></tr>`,
      )
      .join('');
    repeatPreviewHost.innerHTML = `<table class="print-preview-table"><thead><tr><th>日付</th><th>席</th></tr></thead><tbody>${body || '<tr><td colspan="2" class="muted">配置なし</td></tr>'}</tbody></table>`;
  };

  const renderRepeatSkips = (skips: { date: string; reason: string }[]) => {
    if (!skips.length) {
      repeatSkipHost.innerHTML = '';
      return;
    }
    repeatSkipHost.innerHTML = `<ul class="repeat-skip-list">${skips.map((s) => `<li>${s.date}: ${s.reason}</li>`).join('')}</ul>`;
  };

  const renderRepeatList = () => {
    const studentItems = session.repeatRecords
      .filter((r) => r.status === 'active')
      .map(
        (r) =>
          `<div class="repeat-list-item"><span>[生徒] ${r.name} / ${r.dow}曜 ${r.period}限 B${r.booth}</span>
           <button type="button" class="btn" data-action="reschedule-repeat" data-repeat-id="${r.id}">再配置</button></div>`,
      );
    const teacherItems = (session.teacherRepeatRecords ?? [])
      .filter((r) => r.status === 'active')
      .map(
        (r) =>
          `<div class="repeat-list-item"><span>[講師] ${r.teacherName} / ${r.dow}曜 ${r.period}限 B${r.booth}</span>
           <button type="button" class="btn" data-action="reschedule-teacher-repeat" data-repeat-id="${r.id}">再配置</button></div>`,
      );
    const items = [...studentItems, ...teacherItems];
    repeatListHost.innerHTML = items.length ? items.join('') : '<p class="muted">なし</p>';
  };

  const renderTransferPending = () => {
    const pending = allRows().filter((row) => row.attendance === '振替' && !row.transferTo?.trim());
    if (!pending.length) {
      transferPendingHost.innerHTML = '<p class="muted">振替待ちなし</p>';
      return;
    }
    transferPendingHost.innerHTML = `<ul class="transfer-pending-list">${pending
      .slice(0, 20)
      .map((row) => `<li>${row.date} ${row.studentName}（元: ${row.transferFrom ?? '—'}）</li>`)
      .join('')}${pending.length > 20 ? `<li class="muted">…他 ${pending.length - 20} 件</li>` : ''}</ul>`;
  };

  const renderTable = () => {
    const rows = filteredRows();
    if (!rows.length) {
      tableHost.innerHTML = '<p class="muted">この週の PrintSheet 行はありません。コマ組タブで入力するか、繰り返しを適用してください。</p>';
      return;
    }
    const slotKeyHeader = showSlotKey ? '<th>slotKey</th>' : '';
    const body = rows
      .map((row, index) => {
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
        const slotKeyCell = showSlotKey
          ? `<td class="muted mono">${escapeAttr(row.slotKey)}</td>`
          : '';
        const syncCell = row.syncVisualHtml ?? '<span class="muted">—</span>';
        return `<tr class="${rowCls}" data-row-index="${index}">
          <td>${escapeAttr(row.dayOfWeek)}</td>
          <td><input data-field="date" data-row-index="${index}" value="${escapeAttr(row.date)}" /></td>
          <td><input data-field="booth" data-row-index="${index}" type="number" min="1" value="${row.booth}" /></td>
          <td><input data-field="period" data-row-index="${index}" type="number" min="1" value="${row.period}" /></td>
          <td>${row.seat}${row.irregular ? ' △' : ''}</td>
          <td><input data-field="teacherName" data-row-index="${index}" value="${escapeAttr(row.teacherName)}" placeholder="講師" /></td>
          <td><input data-field="studentName" data-row-index="${index}" value="${escapeAttr(row.studentName)}" /></td>
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
      })
      .join('');
    tableHost.innerHTML = `<div class="print-sheet-table-scroll"><table class="print-sheet-table">
      <thead><tr>
        <th>曜</th><th>日付</th><th>ブース</th><th>時限</th><th>席</th><th>講師</th><th>生徒</th><th>学年</th><th>教科</th>
        <th>授業種別</th><th>回数対象</th><th>生徒区分</th><th>出欠</th><th>振替元</th><th>振替先</th><th>備考</th><th>SF</th>
        ${slotKeyHeader}
      </tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
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
    mergePrintRowsIntoSession(session, rows, weekDateKeys());
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
    renderRepeatForm();
    renderTable();
    renderRepeatPreview();
    renderRepeatList();
    renderTransferPending();
    renderSlotSync();
    applyBtn.disabled =
      repeatMode === 'teacher'
        ? !pendingTeacherRepeat?.dates.length
        : !pendingRepeatPlan?.plan.length;
  };

  const bindEvents = () => {
    if (bound) return;
    bound = true;

    shell.addEventListener('click', async (event) => {
      const target = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'print-prev') navState = navigatePrev(navState);
      else if (action === 'print-next') navState = navigateNext(navState);
      else if (action === 'print-today') navState = jumpToToday(navState);
      else if (action === 'repeat-mode-student') {
        repeatMode = 'student';
        pendingTeacherRepeat = null;
        pendingTeacherInput = null;
        renderAll();
        return;
      } else if (action === 'repeat-mode-teacher') {
        repeatMode = 'teacher';
        pendingRepeatPlan = null;
        pendingRepeatInput = null;
        renderAll();
        return;
      } else if (action === 'transfer-wizard') {
        const weekStart = weekDateKeys()[0] ?? '';
        void confirmAction({
          title: '振替ウィザード',
          messageHtml: `
            <label>生徒名<input id="tw-student" style="width:100%" /></label>
            <label>振替元日<input id="tw-from-date" type="date" value="${weekStart}" style="width:100%" /></label>
            <label>振替元ブース<input id="tw-from-booth" type="number" min="1" value="1" style="width:100%" /></label>
            <label>振替元時限<input id="tw-from-period" type="number" min="1" value="1" style="width:100%" /></label>
            <label>振替元席<select id="tw-from-seat" style="width:100%"><option value="1">席1</option><option value="2">席2</option></select></label>
            <label>振替先日<input id="tw-to-date" type="date" value="${weekStart}" style="width:100%" /></label>
            <label>振替先ブース<input id="tw-to-booth" type="number" min="1" value="1" style="width:100%" /></label>
            <label>振替先時限<input id="tw-to-period" type="number" min="1" value="1" style="width:100%" /></label>
            <label>振替先席<select id="tw-to-seat" style="width:100%"><option value="1">席1</option><option value="2">席2</option></select></label>
          `,
          confirmLabel: '振替登録',
        }).then((ok) => {
          if (!ok) return;
          const student = (document.getElementById('tw-student') as HTMLInputElement | null)?.value.trim();
          if (!student) {
            showToast('生徒名を入力してください', 'error');
            return;
          }
          const from = {
            date: (document.getElementById('tw-from-date') as HTMLInputElement).value,
            booth: Number((document.getElementById('tw-from-booth') as HTMLInputElement).value) || 1,
            period: Number((document.getElementById('tw-from-period') as HTMLInputElement).value) || 1,
            seat: Number((document.getElementById('tw-from-seat') as HTMLSelectElement).value) as 1 | 2,
          };
          const to = {
            date: (document.getElementById('tw-to-date') as HTMLInputElement).value,
            booth: Number((document.getElementById('tw-to-booth') as HTMLInputElement).value) || 1,
            period: Number((document.getElementById('tw-to-period') as HTMLInputElement).value) || 1,
            seat: Number((document.getElementById('tw-to-seat') as HTMLSelectElement).value) as 1 | 2,
          };
          const sourceCell = getCell(session, from.date, from.booth, from.period, from.seat);
          if (sourceCell.studentName.trim() !== student) {
            showToast('振替元に該当生徒が見つかりません', 'error');
            return;
          }
          const result = registerTransfer(session, from, to, closedDates);
          if (!result.ok) {
            showToast(result.error ?? '振替失敗', 'error');
            return;
          }
          void saveBoothSession(options.hostname, session).then(() => {
            options.onSessionChange?.();
            showToast('振替を登録しました', 'success');
            renderAll();
          });
        });
        return;
      } else if (action === 'repeat-preview') {
        if (repeatMode === 'teacher') {
          pendingTeacherInput = readTeacherRepeatInput();
          pendingTeacherRepeat = dryRunTeacherRepeat(pendingTeacherInput, closedDates);
          renderRepeatPreview();
          renderRepeatSkips(pendingTeacherRepeat.skips);
          applyBtn.disabled = !pendingTeacherRepeat.dates.length;
          return;
        }
        pendingRepeatInput = readRepeatInput();
        pendingRepeatPlan = dryRunRepeat(session, pendingRepeatInput, closedDates);
        renderRepeatPreview();
        renderRepeatSkips(pendingRepeatPlan.skips);
        applyBtn.disabled = !pendingRepeatPlan.plan.length;
        return;
      } else if (action === 'repeat-apply' && repeatMode === 'teacher' && pendingTeacherInput && pendingTeacherRepeat) {
        applyTeacherRepeat(session, pendingTeacherInput, closedDates);
        pendingTeacherRepeat = null;
        pendingTeacherInput = null;
        await saveBoothSession(options.hostname, session);
        options.onSessionChange?.();
        renderAll();
        return;
      } else if (action === 'repeat-apply' && pendingRepeatInput && pendingRepeatPlan) {
        applyRepeatPlan(session, pendingRepeatInput, pendingRepeatPlan.plan, closedDates);
        pendingRepeatPlan = null;
        pendingRepeatInput = null;
        await saveBoothSession(options.hostname, session);
        options.onSessionChange?.();
        renderAll();
        return;
      } else if (action === 'reschedule-repeat') {
        const repeatId = target.dataset.repeatId!;
        rescheduleRepeat(session, repeatId, closedDates);
        await saveBoothSession(options.hostname, session);
        options.onSessionChange?.();
        renderAll();
        return;
      } else if (action === 'reschedule-teacher-repeat') {
        const repeatId = target.dataset.repeatId!;
        rescheduleTeacherRepeat(session, repeatId, closedDates);
        await saveBoothSession(options.hostname, session);
        options.onSessionChange?.();
        renderAll();
        return;
      } else return;
      pendingRepeatPlan = null;
      pendingTeacherRepeat = null;
      renderAll();
    });

    shell.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement;
      const field = target.dataset.field;
      const rowIndexRaw = target.dataset.rowIndex;
      if (field === 'attendance' && rowIndexRaw !== undefined) {
        syncAttendanceFromTable(Number(rowIndexRaw), target.value as AttendanceStatus);
        return;
      }
      if (target.id === 'print-kind-filter') {
        kindFilter = target.value;
        renderTable();
        return;
      }
      if (target.id === 'print-date-from') {
        dateFrom = target.value;
        renderTable();
        return;
      }
      if (target.id === 'print-date-to') {
        dateTo = target.value;
        renderTable();
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
      if (target.id === 'print-name-filter') {
        nameFilter = target.value;
        renderTable();
        return;
      }
      const field = target.dataset.field as keyof PrintSheetRow | undefined;
      const rowIndexRaw = target.dataset.rowIndex;
      if (!field || rowIndexRaw === undefined) return;
      syncRowsFromTable(Number(rowIndexRaw), field, target.value);
    });
  };

  bindEvents();
  renderAll();

  return async (partial) => {
    if (partial?.closedDates) closedDates = partial.closedDates;
    if (partial?.reloadSession) session = await loadBoothSession(options.hostname);
    if (partial?.refreshSlotSync) {
      renderSlotSync();
      return;
    }
    renderAll();
  };
}
