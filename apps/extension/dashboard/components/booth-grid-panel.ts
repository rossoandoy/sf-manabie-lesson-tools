import { createMasterSyncConnection, fetchSubjectMasterCatalog } from '../../src/services/lessonMasterCatalog';
import type { CatalogRecord, ClosedDateDefinition, LessonMasterCatalog, LessonScheduleDefinition } from '../../src/contracts';
import type { CenterScopedCatalog } from '../../src/services/center-scoped-catalog';
import {
  loadCenterScopedCatalog,
  studentsForPicker,
  teachersForPicker,
} from '../../src/services/center-scoped-catalog';
import { boothCountFromAccountFields } from '../../lib/booth-count-from-account';
import { mountBoothLessonCalendar } from './booth-lesson-calendar';
import { mountEntitySearchModal } from './entity-search-modal';
import { renderEntityNamePickerRow } from './entity-name-picker-row';
import {
  mountSlotPickerModal,
  slotRepeatPrefillFromRef,
  type SlotPickerConfirmResult,
} from './slot-picker-modal';
import { attendanceCssClass, bulkSetAttendance } from '../../lib/booth-attendance';
import {
  captureSlot,
  clearAllSlotsForDate,
  moveSlot,
  pasteSlot,
  type SlotClipboardPayload,
} from '../../lib/booth-slot-clipboard';
import { copyWeekSlots } from '../../lib/booth-week-copy';
import { gradeForStudentName, gradeFromCatalogRecord } from '../../lib/booth-grade-lookup';
import { ONE_ON_ONE_PLACEHOLDER, shouldBlockSeat2 } from '../../lib/booth-student-capacity';
import { formatDateKey, fiscalYearEndDateFrom, parseDateKey, schoolYearFromDate, weekRow, downloadText } from '../../lib/calendar-utils';
import { jumpToToday, navigateNext, navigatePrev } from '../../lib/calendar/calendar-state';
import { createInitialCalendarState, type CalendarUIState } from '../../lib/calendar/calendar-state';
import { boothCellsToPrintRows, buildSlotKey } from '../../lib/booth-print-sheet';
import { periodCellSyncClass } from '../../lib/sync-manifest';
import {
  collectBoothActiveDays,
  type ScheduleGapReport,
} from '../../src/services/lessonScheduleGapService';
import { confirmAction, confirmTokenInput } from './confirm-modal';
import { renderScheduleGapBannerPlainHtml } from './operator-messages';
import { showAlert, showToast } from './toast';
import {
  applyRepeatPlan,
  clearSlot,
  dryRunRepeat,
  getCell,
  getSlotMeta,
  loadBoothSession,
  normalizeSettingsAfterPeriodCountChange,
  saveBoothSession,
  slotRefKey,
  upsertCell,
  upsertSlotMeta,
  visiblePeriodNumbers,
  type BoothGridSession,
  type BoothSlotRef,
  type BoothViewMode,
} from '../../lib/booth-session-state';
import { applyTeacherRepeat, dryRunTeacherRepeat } from '../../lib/booth-teacher-repeat';
import { mountAttendancePanel } from './attendance-panel';
import { applyBulkDelete, previewBulkDelete, type BulkDeleteTarget } from '../../lib/booth-bulk-delete';
import {
  applyFiscalRollover,
  buildRolloverBackupJson,
  formatRepeatCleanupSummary,
  previewFiscalRollover,
} from '../../lib/booth-fiscal-rollover';
import { mountBoothRepeatPanel } from './booth-repeat-panel';
import {
  computeBoothVirtualState,
  formatVirtualDayRange,
  navigateDayOffset,
  resetDayOffsetForWeek,
  type BoothVirtualState,
} from '../../lib/booth-grid-virtual';
import {
  fieldHintFromInput,
  isClipboardShortcut,
  nextFieldHint,
  parseSeatNumber,
  selectorForField,
  type BoothFieldHint,
} from '../../lib/booth-grid-keyboard';

export interface BoothGridPanelOptions {
  hostname: string;
  closedDates: ClosedDateDefinition[];
  catalog?: LessonMasterCatalog | null;
  onSessionChange?: (detail?: { resetPrintDateRange?: boolean }) => void;
  onAccountChange?: () => void;
  getWeekGapReport?: () => { report: ScheduleGapReport | null; loading: boolean };
  onWeekGapRefresh?: (options: {
    accountId: string;
    dateFrom: string;
    dateTo: string;
    daysWithBoothStudents: string[];
  }) => void | Promise<void>;
  onMarkClosedDate?: (date: string, title: string) => void | Promise<void>;
  onUnmarkClosedDate?: (date: string) => void | Promise<void>;
  onLessonsChange?: (lessons: LessonScheduleDefinition[]) => void;
}

export interface BoothGridPanelRefreshOptions {
  closedDates?: ClosedDateDefinition[];
  catalog?: LessonMasterCatalog | null;
  reloadSession?: boolean;
  refreshGapBanner?: boolean;
}

function visibleWeekDates(state: CalendarUIState, hideSunday: boolean): Date[] {
  const dates = weekRow(state.anchor);
  return hideSunday ? dates.filter((d) => d.getDay() !== 0) : dates;
}

function closedDateSet(closedDates: ClosedDateDefinition[]): Set<string> {
  return new Set(closedDates.map((c) => c.date));
}

function accountDetailHref(instanceUrl: string | undefined, accountId: string): string | null {
  if (!instanceUrl || !accountId) return null;
  const base = instanceUrl.replace(/\/$/, '');
  return `${base}/lightning/r/Account/${accountId}/view`;
}

function boothCountFromCatalog(
  catalog: LessonMasterCatalog | null | undefined,
  accountId: string,
): number | null {
  if (!catalog || !accountId) return null;
  const loc = catalog.catalogs.locations.find((item) => item.id === accountId);
  return boothCountFromAccountFields(loc?.fields);
}

function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return ((...args: never[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  }) as T;
}

function gradeDatalistId(): string {
  return 'booth-grade-datalist';
}

function renderGradeDatalist(
  catalog: LessonMasterCatalog | null,
  centerCatalog: CenterScopedCatalog | null,
): string {
  const grades = new Set<string>();
  for (const student of studentsForPicker(centerCatalog, catalog?.catalogs.students)) {
    const grade = student.fields?.Grade__c ?? student.fields?.grade;
    if (typeof grade === 'string' && grade.trim()) grades.add(grade.trim());
  }
  if (!grades.size) return '';
  const options = [...grades]
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .map((grade) => `<option value="${grade.replace(/"/g, '&quot;')}"></option>`)
    .join('');
  return `<datalist id="${gradeDatalistId()}">${options}</datalist>`;
}

function slotSelected(selected: BoothSlotRef | null, date: string, booth: number, period: number): boolean {
  return Boolean(selected && slotRefKey(selected) === slotRefKey({ date, booth, period }));
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function entityFieldDisplayValue(el: HTMLElement): string {
  return (el.textContent ?? '').trim();
}

function renderEntityButton(options: {
  picker: 'student' | 'teacher';
  date: string;
  booth: number;
  period: number;
  seat?: 1 | 2;
  value: string;
  placeholder: string;
  disabled: string;
  extraClass?: string;
}): string {
  const trimmed = options.value.trim();
  const display = trimmed || options.placeholder;
  const filled = trimmed && trimmed !== ONE_ON_ONE_PLACEHOLDER ? ' booth-entity-filled' : ' booth-entity-empty';
  const seatAttr = options.seat !== undefined ? ` data-seat="${options.seat}"` : '';
  const teacherAttr = options.picker === 'teacher' ? ' data-teacher' : '';
  const cls = ['booth-entity-btn', options.extraClass, filled.trim()].filter(Boolean).join(' ');
  return `<button type="button" class="${cls}"
    data-picker="${options.picker}" data-date="${options.date}" data-booth="${options.booth}" data-period="${options.period}"${seatAttr}${teacherAttr}
    data-placeholder="${escapeAttr(options.placeholder)}" ${options.disabled}
    title="ダブルクリックで選択・Alt+クリックで解除">${escapeAttr(display)}</button>`;
}

function subjectsForPicker(catalog: LessonMasterCatalog | null, session: BoothGridSession): CatalogRecord[] {
  const fromCatalog = catalog?.catalogs.subjects ?? [];
  if (fromCatalog.length) return fromCatalog;
  const seen = new Set<string>();
  const fallback: CatalogRecord[] = [];
  for (const cell of session.cells) {
    const subject = cell.subject.trim();
    if (subject && !seen.has(subject)) {
      seen.add(subject);
      fallback.push({ id: subject, name: subject });
    }
  }
  return fallback.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

function resolveSeatFromTarget(target: HTMLElement): 1 | 2 | null {
  const seatEl = target.closest('[data-seat]') as HTMLElement | null;
  const raw = seatEl?.dataset.seat;
  if (raw === '1' || raw === '2') return Number(raw) as 1 | 2;
  const input = target.closest('[data-seat]') as HTMLElement | null;
  const seatRaw = input?.dataset.seat;
  if (!seatRaw) return null;
  if (seatRaw === '1' || seatRaw.startsWith('1-')) return 1;
  if (seatRaw === '2' || seatRaw.startsWith('2-')) return 2;
  return null;
}

function renderSubjectSelectOptions(
  catalog: LessonMasterCatalog | null,
  session: BoothGridSession,
  selected: string,
): string {
  const subjects = subjectsForPicker(catalog, session);
  const known = new Set(subjects.map((s) => s.name));
  const custom =
    selected.trim() && !known.has(selected.trim())
      ? `<option value="${escapeAttr(selected)}" selected>${escapeAttr(selected)}（未登録）</option>`
      : '';
  const options = subjects
    .map(
      (s) =>
        `<option value="${escapeAttr(s.name)}" ${s.name === selected ? 'selected' : ''}>${escapeAttr(s.name)}</option>`,
    )
    .join('');
  return `<option value="">—</option>${custom}${options}`;
}

function renderSeatFieldTds(
  key: string,
  booth: number,
  period: number,
  seat: 1 | 2,
  session: BoothGridSession,
  catalog: LessonMasterCatalog | null,
  isClosed: boolean,
  blocked: boolean,
  stateCls: string,
  slotSelected: boolean,
  activeSeat: 1 | 2,
): string {
  const cell = getCell(session, key, booth, period, seat);
  const disabled = isClosed || blocked ? 'disabled' : '';
  const studentValue = blocked && !cell.studentName.trim() ? ONE_ON_ONE_PLACEHOLDER : cell.studentName;
  const studentPlaceholder = blocked ? ONE_ON_ONE_PLACEHOLDER : seat === 1 ? '生徒' : '生徒(2)';
  const attendCls = attendanceCssClass(cell.attendance);
  const seatActive = slotSelected && activeSeat === seat;
  const rowCls = [
    'booth-field-cell',
    stateCls,
    slotSelected ? 'booth-slot-selected' : '',
    blocked ? 'one-on-one-blocked' : '',
    attendCls ? `booth-attend-cell ${attendCls}` : '',
    seatActive ? 'booth-seat-active' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const seatAttrs = `data-action="select-slot" data-date="${key}" data-booth="${booth}" data-period="${period}" data-seat="${seat}"`;
  return `
    <td class="${rowCls}" ${seatAttrs}>
      ${renderEntityButton({
        picker: 'student',
        date: key,
        booth,
        period,
        seat,
        value: studentValue,
        placeholder: studentPlaceholder,
        disabled,
      })}
    </td>
    <td class="${rowCls}" ${seatAttrs}>
      <input data-date="${key}" data-booth="${booth}" data-period="${period}" data-seat="${seat}-grade"
        placeholder="学年" value="${escapeAttr(cell.grade ?? '')}" class="booth-grade-input" readonly tabindex="-1" ${disabled} />
    </td>
    <td class="${rowCls}" ${seatAttrs}>
      <select data-date="${key}" data-booth="${booth}" data-period="${period}" data-seat="${seat}-subject"
        class="subject-select" ${disabled}>${renderSubjectSelectOptions(catalog, session, cell.subject)}</select>
    </td>`;
}

function periodCellStateClass(
  date: string,
  booth: number,
  period: number,
  session: Awaited<ReturnType<typeof loadBoothSession>>,
  gapReport: ScheduleGapReport | null,
  isClosed: boolean,
): string {
  if (isClosed) return 'cell-state-closed';
  if (gapReport?.daysMissingLessons.includes(date)) return 'cell-state-gap';
  for (const seat of [1, 2] as const) {
    const cell = getCell(session, date, booth, period, seat);
    if (!cell.studentName.trim()) continue;
    const slotKey = buildSlotKey(date, booth, period, seat);
    const rows = boothCellsToPrintRows([cell], session.settings, [date], session.slotMeta, session.syncManifest);
    const row = rows[0];
    const cls = periodCellSyncClass(session.syncManifest, slotKey, row);
    if (cls) return cls;
  }
  return '';
}

export async function mountBoothGridPanel(
  root: HTMLElement,
  options: BoothGridPanelOptions,
): Promise<(partial?: Partial<BoothGridPanelRefreshOptions>) => void> {
  let session = await loadBoothSession(options.hostname);
  let closedDates = options.closedDates;
  let catalog = options.catalog ?? null;
  let subjectsLoadAttempted = false;

  const ensureSubjectCatalog = async (): Promise<void> => {
    if ((catalog?.catalogs.subjects?.length ?? 0) > 0) return;
    if (subjectsLoadAttempted) return;
    subjectsLoadAttempted = true;
    try {
      const conn = await createMasterSyncConnection(options.hostname);
      const subjects = await fetchSubjectMasterCatalog(conn.query);
      if (subjects.length && catalog) {
        catalog = { ...catalog, catalogs: { ...catalog.catalogs, subjects } };
      }
      if (subjects.length) {
        renderSettings();
        if (viewMode() === 'grid') renderGrid();
      } else if (!catalog?.catalogs.subjects?.length) {
        showToast('教科マスタが取得できませんでした。前提マスタ同期を実行してください。', 'error');
      }
    } catch (error) {
      showToast(`教科マスタ取得エラー: ${error instanceof Error ? error.message : String(error)}`, 'error');
    }
  };
  let navState = createInitialCalendarState();
  navState.view = 'week';
  let selected: BoothSlotRef | null = null;
  let selectedSeat: 1 | 2 = 1;
  let bound = false;
  let weekGapReport: ScheduleGapReport | null = null;
  let weekGapLoading = false;
  let slotClipboard: SlotClipboardPayload | null = null;
  let moveSource: BoothSlotRef | null = null;
  let manualSettingsOverride = false;
  let centerCatalog: CenterScopedCatalog | null = null;
  let centerCatalogLoading = false;
  let settingsCollapsed = session.settings.settingsCollapsed ?? false;
  let previewCollapsed = session.settings.previewCollapsed ?? false;
  let contextCollapsed = session.settings.contextCollapsed ?? false;

  const entityFieldValueFromSession = (field: HTMLElement): string => {
    const date = field.dataset.date;
    const booth = Number(field.dataset.booth);
    const period = Number(field.dataset.period);
    if (!date || !booth || !period || Number.isNaN(booth) || Number.isNaN(period)) {
      return entityFieldDisplayValue(field);
    }
    if (field.dataset.picker === 'teacher') {
      return getSlotMeta(session, date, booth, period).teacherName.trim();
    }
    if (field.dataset.picker === 'student') {
      const seat = parseSeatNumber(field.dataset.seat);
      return getCell(session, date, booth, period, seat).studentName.trim();
    }
    return entityFieldDisplayValue(field);
  };
  let bulkDeleteTarget: BulkDeleteTarget = 'student';
  let bulkDeleteName = '';
  let bulkDeleteStartDate = '';
  let refreshCalendarPanel: ((partial?: Partial<{ catalog: LessonMasterCatalog | null; closedDates: ClosedDateDefinition[] }>) => Promise<void>) | null = null;
  let closeSearchModal: (() => void) | null = null;
  let suppressPickerUntil = 0;
  let focusedFieldHint: BoothFieldHint = 'seat1';
  let clipLiveRegion: HTMLElement | null = null;

  const viewMode = (): BoothViewMode => session.settings.boothViewMode ?? 'grid';

  const getVirtualState = (): BoothVirtualState => {
    const keys = weekDateKeys();
    const offset = session.settings.dayScrollOffset ?? 0;
    const state = computeBoothVirtualState(session.settings, keys, offset);
    if (state.dayOffset !== offset) {
      session.settings.dayScrollOffset = state.dayOffset;
    }
    return state;
  };

  const syncDayOffset = (nextOffset: number, persistOffset = true): void => {
    const state = computeBoothVirtualState(session.settings, weekDateKeys(), nextOffset);
    session.settings.dayScrollOffset = state.dayOffset;
    if (persistOffset) void persist();
  };

  const resetWeekDayOffset = (): void => {
    session.settings.dayScrollOffset = resetDayOffsetForWeek();
  };

  const focusSlotInput = (ref: BoothSlotRef, hint: BoothFieldHint = focusedFieldHint): void => {
    focusedFieldHint = hint;
    const el = gridHost.querySelector(selectorForField(ref, hint)) as HTMLElement | null;
    if (!el) return;
    if (el instanceof HTMLButtonElement && el.disabled) return;
    if (el instanceof HTMLInputElement && el.disabled) return;
    if (el instanceof HTMLSelectElement && el.disabled) return;
    el.focus();
  };

  const updateClipLiveRegion = (): void => {
    if (!clipLiveRegion) return;
    if (moveSource) {
      clipLiveRegion.textContent = `移動モード: ${moveSource.date} B${moveSource.booth} ${moveSource.period}限 → 移動先をクリック`;
    } else if (slotClipboard) {
      clipLiveRegion.textContent = 'クリップボード: コマ内容あり';
    } else {
      clipLiveRegion.textContent = '';
    }
  };

  const reloadCenterCatalog = async (): Promise<void> => {
    const accountId = session.settings.accountId.trim();
    if (!accountId) {
      centerCatalog = null;
      return;
    }
    centerCatalogLoading = true;
    renderContextBar();
    try {
      centerCatalog = await loadCenterScopedCatalog(accountId, session.settings.classroomName);
      if (centerCatalog.studentLoadError) {
        showToast(`生徒取得エラー: ${centerCatalog.studentLoadError}`, 'error');
      } else if (centerCatalog.enrollmentFilterWarning) {
        showToast(centerCatalog.enrollmentFilterWarning, 'error');
      }
    } catch (error) {
      centerCatalog = null;
      showToast(`拠点カタログ取得エラー: ${error instanceof Error ? error.message : String(error)}`, 'error');
    } finally {
      centerCatalogLoading = false;
      renderContextBar();
      renderSettings();
    }
  };

  const allWeekDates = (): Date[] => visibleWeekDates(navState, session.settings.hideSunday);

  const weekDateKeys = (): string[] => allWeekDates().map(formatDateKey);

  const persist = debounce(async () => {
    await saveBoothSession(options.hostname, session);
    options.onSessionChange?.();
  }, 300);

  const updateSlotVisuals = (date: string, booth: number, period: number): void => {
    const closed = closedDateSet(closedDates);
    const isClosed = closed.has(date);
    const stateCls = periodCellStateClass(date, booth, period, session, weekGapReport, isClosed);
    const slotMeta = getSlotMeta(session, date, booth, period);
    const sel = slotSelected(selected, date, booth, period);
    const teacherCell = gridHost.querySelector(
      `td.booth-teacher-cell[data-action="select-slot"][data-date="${date}"][data-booth="${booth}"][data-period="${period}"]`,
    ) as HTMLElement | null;
    if (teacherCell) {
      teacherCell.className = [
        'booth-teacher-cell',
        'booth-field-cell',
        stateCls,
        sel ? 'booth-slot-selected' : '',
        slotMeta.highlighted ? 'booth-cell-highlighted' : '',
      ]
        .filter(Boolean)
        .join(' ');
      if (sel) teacherCell.setAttribute('aria-selected', 'true');
      else teacherCell.removeAttribute('aria-selected');
    }
    for (const seat of [1, 2] as const) {
      const blockSeat2 = shouldBlockSeat2(session, date, booth, period, catalog, centerCatalog);
      const cell = getCell(session, date, booth, period, seat);
      const attendCls = attendanceCssClass(cell.attendance);
      const seatSelectors = [`${seat}`, `${seat}-grade`, `${seat}-subject`];
      for (const seatKey of seatSelectors) {
        const fieldEl = gridHost.querySelector(
          `[data-date="${date}"][data-booth="${booth}"][data-period="${period}"][data-seat="${seatKey}"]`,
        );
        const td = fieldEl?.closest('td');
        if (!td) continue;
        td.className = [
          'booth-field-cell',
          stateCls,
          sel ? 'booth-slot-selected' : '',
          blockSeat2 && seat === 2 && seatKey === `${seat}` ? 'one-on-one-blocked' : '',
          attendCls ? `booth-attend-cell ${attendCls}` : '',
          sel && selectedSeat === seat ? 'booth-seat-active' : '',
        ]
          .filter(Boolean)
          .join(' ');
        if (sel && selectedSeat === seat && seatKey === `${seat}`) td.setAttribute('aria-selected', 'true');
        else if (seatKey === `${seat}`) td.removeAttribute('aria-selected');
        if (fieldEl instanceof HTMLButtonElement && blockSeat2 && seat === 2 && seatKey === `${seat}`) {
          fieldEl.disabled = true;
          if (!cell.studentName.trim()) fieldEl.textContent = ONE_ON_ONE_PLACEHOLDER;
        }
      }
    }
  };

  const applySelectionVisuals = (previous: BoothSlotRef | null): void => {
    if (previous && (!selected || slotRefKey(previous) !== slotRefKey(selected))) {
      updateSlotVisuals(previous.date, previous.booth, previous.period);
    }
    if (selected) {
      updateSlotVisuals(selected.date, selected.booth, selected.period);
    }
  };

  const applyCellFieldChange = (
    date: string,
    booth: number,
    period: number,
    seatRaw: string,
    field: 'student' | 'grade' | 'subject',
    value: string,
  ): void => {
    if (closedDateSet(closedDates).has(date)) return;
    const seat = parseSeatNumber(seatRaw);
    if (shouldBlockSeat2(session, date, booth, period, catalog, centerCatalog) && seat === 2 && field === 'student') {
      return;
    }
    const cell = getCell(session, date, booth, period, seat);
    if (field === 'subject') cell.subject = value;
    else if (field === 'grade') cell.grade = value;
    else {
      cell.studentName = value;
      if (!cell.studentName.trim()) {
        cell.attendance = undefined;
        cell.grade = '';
      } else if (!cell.attendance) {
        cell.attendance = '未確定';
        cell.countTarget = true;
      }
      const autoGrade = gradeForStudentName(catalog, centerCatalog, cell.studentName);
      if (autoGrade && !cell.grade?.trim()) cell.grade = autoGrade;
    }
    upsertCell(session, cell);
    void persist();
    updateSlotVisuals(date, booth, period);
    renderSlotDetail();
    updatePreview();
  };

  const saveNow = async () => {
    await saveBoothSession(options.hostname, session);
    options.onSessionChange?.();
  };

  const shell = document.createElement('div');
  shell.className = 'booth-layout';
  shell.innerHTML = `
    <div class="booth-context-bar panel-card"></div>
    <div class="booth-main">
      <aside class="booth-settings panel-card"></aside>
      <section class="booth-grid-area">
        <div class="grid-toolbar booth-toolbar"></div>
        <div class="booth-calendar-host hidden"></div>
        <div class="booth-grid-scroll">
          <div class="booth-grid-host"></div>
        </div>
      </section>
      <aside class="booth-preview panel-card">
        <div class="booth-pane-header">
          <h2>コマ組操作</h2>
          <button type="button" class="btn btn-sm" data-action="booth-toggle-preview">${previewCollapsed ? '▶' : '▼'}</button>
        </div>
        <div class="booth-preview-inner">
          <details class="booth-preview-section" open>
            <summary>選択中コマ</summary>
            <div class="booth-slot-detail"></div>
            <div class="booth-attendance-host"></div>
          </details>
          <details class="booth-preview-section" open>
            <summary>一括削除（F04）</summary>
            <div class="booth-bulk-delete-host"></div>
          </details>
          <details class="booth-preview-section">
            <summary>登録済み繰り返し</summary>
            <div class="booth-repeat-host"></div>
          </details>
          <details class="booth-preview-section">
            <summary>授業一覧</summary>
            <div class="print-preview-host"></div>
          </details>
        </div>
      </aside>
    </div>
    <div class="booth-lesson-editor-host editor-drawer-host"></div>
  `;
  root.replaceChildren(shell);

  const contextBarEl = shell.querySelector('.booth-context-bar') as HTMLElement;
  const settingsEl = shell.querySelector('.booth-settings') as HTMLElement;
  const calendarHost = shell.querySelector('.booth-calendar-host') as HTMLElement;
  const lessonEditorHost = shell.querySelector('.booth-lesson-editor-host') as HTMLElement;
  const toolbarEl = shell.querySelector('.booth-toolbar') as HTMLElement;
  const gridHost = shell.querySelector('.booth-grid-host') as HTMLElement;
  const slotDetailEl = shell.querySelector('.booth-slot-detail') as HTMLElement;
  const bulkDeleteHost = shell.querySelector('.booth-bulk-delete-host') as HTMLElement;
  const attendanceHost = shell.querySelector('.booth-attendance-host') as HTMLElement;
  const previewHost = shell.querySelector('.print-preview-host') as HTMLElement;
  const repeatHost = shell.querySelector('.booth-repeat-host') as HTMLElement;
  const previewAside = shell.querySelector('.booth-preview') as HTMLElement;

  const refreshRepeatPanel = mountBoothRepeatPanel(repeatHost, {
    hostname: options.hostname,
    closedDates,
    getSession: () => session,
    getWeekDateKeys: weekDateKeys,
    getAllRows: () =>
      boothCellsToPrintRows(
        session.cells,
        session.settings,
        weekDateKeys(),
        session.slotMeta,
        session.syncManifest,
      ),
    getSelectedSlot: () =>
      selected
        ? {
            ref: selected,
            seat: selectedSeat,
            studentName: getCell(session, selected.date, selected.booth, selected.period, selectedSeat).studentName,
            subject: getCell(session, selected.date, selected.booth, selected.period, selectedSeat).subject,
            teacherName: getSlotMeta(session, selected.date, selected.booth, selected.period).teacherName,
          }
        : null,
    getStudentRecords: () => studentsForPicker(centerCatalog, catalog?.catalogs.students),
    getTeacherRecords: () => teachersForPicker(centerCatalog, catalog?.catalogs.teachers),
    onSelectSlot: (ref, seat) => {
      selected = ref;
      selectedSeat = seat;
      const virtual = getVirtualState();
      if (virtual.enabled) {
        const idx = weekDateKeys().indexOf(ref.date);
        if (idx >= 0) syncDayOffset(idx, false);
      }
      renderGrid();
      renderSlotDetail();
      focusSlotInput(ref, 'seat1');
      gridHost.querySelector(`[data-date="${ref.date}"][data-booth="${ref.booth}"]`)?.scrollIntoView({
        block: 'nearest',
        inline: 'nearest',
      });
    },
    onSessionChange: options.onSessionChange,
    onRefresh: () => renderAll(),
  });

  const attendancePanel = mountAttendancePanel(attendanceHost, {
    getSession: () => session,
    getSelection: () => (selected ? { ref: selected, seat: selectedSeat } : null),
    setSelectedSeat: (seat) => {
      selectedSeat = seat;
      if (selected) {
        renderGrid();
        renderSlotDetail();
      }
    },
    getClosedDates: () => closedDates,
    onChange: () => {
      renderGrid();
      renderSlotDetail();
      updatePreview();
    },
    persist: saveNow,
  });

  const fiscalYearLabel = (): string => {
    const dates = visibleWeekDates(navState, session.settings.hideSunday);
    const key = dates[0] ? formatDateKey(dates[0]) : formatDateKey(new Date());
    return session.settings.fiscalYear || String(schoolYearFromDate(key));
  };

  const weekRangeLabel = (): string => {
    const keys = weekDateKeys();
    if (!keys.length) return '—';
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const first = keys[0]!;
    const last = keys[keys.length - 1]!;
    const firstDow = weekdays[new Date(`${first}T12:00:00`).getDay()] ?? '';
    const lastDow = weekdays[new Date(`${last}T12:00:00`).getDay()] ?? '';
    return `${first} 〜 ${last}（${firstDow}〜${lastDow}）`;
  };

  const bulkDeleteWeekRange = (): { from: string; to: string } => {
    const keys = weekDateKeys();
    const from = bulkDeleteStartDate || keys[0] || '';
    const to = from ? fiscalYearEndDateFrom(from) : keys[keys.length - 1] || '';
    return { from, to };
  };

  const bulkDeleteNameOptions = (): CatalogRecord[] =>
    bulkDeleteTarget === 'teacher'
      ? teachersForPicker(centerCatalog, catalog?.catalogs.teachers)
      : studentsForPicker(centerCatalog, catalog?.catalogs.students);

  const renderContextBar = () => {
    const mode = viewMode();
    const scopedLabel = centerCatalogLoading
      ? '生徒/講師一覧を読込中…'
      : centerCatalog?.studentLoadError
        ? '生徒取得エラー'
        : centerCatalog
          ? centerCatalog.enrollmentFilterWarning
            ? `生徒 ${centerCatalog.students.length} / 講師 ${centerCatalog.teachers.length}（Enrollment 未確認）`
            : `生徒 ${centerCatalog.students.length} / 講師 ${centerCatalog.teachers.length}`
          : session.settings.accountId
            ? '拠点未同期'
            : '所属校舎未設定';
    contextBarEl.innerHTML = `
      <div class="booth-context-row">
        <span class="booth-context-location">
          <span class="badge">所属校舎</span>
          ${escapeAttr(session.settings.classroomName || '—')}
          ${session.settings.accountId ? `<span class="muted">(${scopedLabel})</span>` : ''}
        </span>
        <div class="booth-mode-toggle">
          <button type="button" class="btn btn-sm ${mode === 'calendar' ? 'active' : ''}" data-action="booth-mode-calendar">カレンダー</button>
          <button type="button" class="btn btn-sm ${mode === 'grid' ? 'active' : ''}" data-action="booth-mode-grid">ブース表</button>
        </div>
        <div class="booth-context-nav footer-actions">
          <button type="button" class="btn btn-sm" data-action="booth-prev">◀ 週</button>
          <button type="button" class="btn btn-sm" data-action="booth-today">Today</button>
          <button type="button" class="btn btn-sm" data-action="booth-next">週 ▶</button>
        </div>
        <span class="booth-week-range">${weekRangeLabel()}</span>
        <span class="muted booth-context-year">${fiscalYearLabel()}年度</span>
        <button type="button" class="btn btn-sm booth-context-toggle" data-action="booth-toggle-context">${contextCollapsed ? '▼' : '▲'}</button>
      </div>
      <div class="booth-context-collapsed-bar">
        <span class="booth-week-range">${weekRangeLabel()}</span>
        <span class="muted">${fiscalYearLabel()}年度</span>
        <button type="button" class="btn btn-sm" data-action="booth-toggle-context">▼ 週ナビ</button>
      </div>`;
    contextBarEl.classList.toggle('booth-context-collapsed', contextCollapsed);
    settingsEl.classList.toggle('booth-panel-collapsed', settingsCollapsed);
    previewAside.classList.toggle('booth-panel-collapsed', previewCollapsed);
    calendarHost.classList.toggle('hidden', mode !== 'calendar');
    gridHost.classList.toggle('hidden', mode !== 'grid');
    toolbarEl.classList.toggle('hidden', mode !== 'grid');
  };

  const renderSettings = () => {
    const boothFromAccount = boothCountFromCatalog(catalog, session.settings.accountId);
    if (boothFromAccount) session.settings.boothCount = boothFromAccount;
    const periods = visiblePeriodNumbers(session.settings);
    const periodChecks = Array.from({ length: session.settings.periodCount }, (_, i) => i + 1)
      .map(
        (p) =>
          `<label class="period-filter-item"><input type="checkbox" data-period-filter="${p}" ${
            periods.includes(p) ? 'checked' : ''
          } /> ${p}限</label>`,
      )
      .join('');
    const affiliationLocked =
      session.settings.accountSource === 'affiliation' && !manualSettingsOverride;
    const manualToggle =
      session.settings.accountSource === 'affiliation' || session.settings.accountId
        ? `<label class="booth-manual-toggle"><input id="booth-manual-override" type="checkbox" ${manualSettingsOverride ? 'checked' : ''} /> 手動で変更（所属校舎の自動設定を上書き）</label>`
        : '';
    const accountHref = accountDetailHref(catalog?.org?.instanceUrl, session.settings.accountId);
    const catalogBoothCount = boothCountFromCatalog(catalog, session.settings.accountId);
    const boothCountDisplay = catalogBoothCount ?? session.settings.boothCount;
    const locationBlock = affiliationLocked
      ? `<div class="booth-settings-location">
          <p class="booth-settings-row"><span class="booth-settings-label">拠点</span>
            ${
              accountHref
                ? `<a href="${escapeAttr(accountHref)}" target="_blank" rel="noopener noreferrer">${escapeAttr(session.settings.classroomName || '—')}</a>`
                : escapeAttr(session.settings.classroomName || '—')
            }
          </p>
          <p class="booth-settings-row"><span class="booth-settings-label">ブース数</span> ${boothCountDisplay} <span class="muted">（Account）</span></p>
        </div>`
      : `<label>拠点 (Account)
          ${
            catalog?.catalogs.locations.length
              ? `<select id="booth-account">
                  <option value="">— 選択 —</option>
                  ${catalog.catalogs.locations
                    .map(
                      (loc) =>
                        `<option value="${loc.id}" ${session.settings.accountId === loc.id ? 'selected' : ''}>${loc.name}</option>`,
                    )
                    .join('')}
                </select>`
              : `<input id="booth-account" value="${escapeAttr(session.settings.accountId)}" placeholder="マスタ同期後に選択可能" />`
          }
        </label>
        <label>教室名<input id="booth-classroom" value="${escapeAttr(session.settings.classroomName)}" /></label>
        <p class="booth-settings-row"><span class="booth-settings-label">ブース数</span> ${boothCountDisplay} <span class="muted">（Account・変更不可）</span></p>`;
    settingsEl.innerHTML = `
      <div class="booth-pane-header">
        <h2>表示設定</h2>
        <button type="button" class="btn btn-sm" data-action="booth-toggle-settings">${settingsCollapsed ? '▶' : '▼'}</button>
      </div>
      ${manualToggle}
      ${locationBlock}
      <label>時限数<input id="booth-periods" type="number" min="1" max="10" value="${session.settings.periodCount}" /></label>
      <fieldset class="period-filter-fieldset">
        <legend>時限フィルタ</legend>
        <div class="period-filter-list">${periodChecks}</div>
      </fieldset>
      <fieldset class="period-times-fieldset">
        <legend>時限時刻</legend>
        <div class="period-time-grid">
        ${Array.from({ length: session.settings.periodCount }, (_, i) => i + 1)
          .map(
            (p) =>
              `<div class="period-time-row">
                <span class="period-time-label">${p}限</span>
                <label class="period-time-item">開始<input type="time" data-period-start="${p}" value="${escapeAttr(session.settings.periodStartTimes?.[String(p)] ?? '')}" /></label>
                <label class="period-time-item">終了<input type="time" data-period-end="${p}" value="${escapeAttr(session.settings.periodEndTimes?.[String(p)] ?? '')}" /></label>
              </div>`,
          )
          .join('')}
        </div>
      </fieldset>
      <label><input id="booth-hide-sunday" type="checkbox" ${session.settings.hideSunday ? 'checked' : ''} /> 日曜を非表示</label>
      <label class="booth-one-to-one-legacy"><input id="booth-one-to-one" type="checkbox" ${session.settings.oneToOneMode ? 'checked' : ''} /> 教室全体を 1:1 モード（席2を無効）</label>
      <p class="muted booth-one-to-one-note">Account の定員（Capacity__c）が 1:1 の場合、所属取得時に自動 ON。上記は手動上書きです。</p>
      ${renderGradeDatalist(catalog, centerCatalog)}
      <p class="muted booth-subject-sync-note">教科マスタ: ${catalog?.catalogs.subjects?.length ?? 0} 件${(catalog?.catalogs.subjects?.length ?? 0) === 0 ? ' — 前提マスタ同期が必要' : ''}</p>
      <fieldset class="booth-fiscal-rollover-fieldset">
        <legend>翌年度準備（R04）</legend>
        ${renderFiscalRolloverSummary()}
        <button type="button" class="btn btn-sm danger" data-action="fiscal-rollover-run">翌年度を準備</button>
      </fieldset>
    `;
  };

  const renderBulkDelete = () => {
    if (!bulkDeleteStartDate) {
      const keys = weekDateKeys();
      bulkDeleteStartDate = keys[0] ?? '';
    }
    const range = bulkDeleteWeekRange();
    const records = bulkDeleteNameOptions();
    const loadError =
      bulkDeleteTarget === 'student' && centerCatalog?.studentLoadError
        ? centerCatalog.studentLoadError
        : bulkDeleteTarget === 'teacher' && centerCatalog?.teacherLoadError
          ? centerCatalog.teacherLoadError
          : '';
    bulkDeleteHost.innerHTML = `
      <div class="booth-bulk-delete-panel">
        <div class="booth-bulk-target-row">
          <label><input type="radio" name="bulk-delete-target" value="student" ${bulkDeleteTarget === 'student' ? 'checked' : ''} /> 生徒</label>
          <label><input type="radio" name="bulk-delete-target" value="teacher" ${bulkDeleteTarget === 'teacher' ? 'checked' : ''} /> 講師</label>
        </div>
        <label>名前
          ${renderEntityNamePickerRow({
            value: bulkDeleteName,
            placeholder: '— 選択 —',
            pickAction: 'bulk-delete-pick',
            clearAction: 'bulk-delete-clear-name',
            disabled: !records.length || !!loadError,
          })}
        </label>
        <label>削除開始日<input id="booth-bulk-start" type="date" value="${escapeAttr(bulkDeleteStartDate)}" /></label>
        <p class="muted">対象: ${range.from || '—'} 〜 ${range.to || '—'}（年度末まで）</p>
        ${loadError ? `<p class="booth-load-error muted">取得エラー: ${escapeAttr(loadError)}</p>` : ''}
        <button type="button" class="btn btn-sm danger" data-action="bulk-delete-run" ${bulkDeleteName && !loadError ? '' : 'disabled'}>一括削除</button>
      </div>
    `;
  };

  const openBulkDeletePicker = () => {
    const records = bulkDeleteNameOptions();
    const loadError =
      bulkDeleteTarget === 'student' && centerCatalog?.studentLoadError
        ? centerCatalog.studentLoadError
        : bulkDeleteTarget === 'teacher' && centerCatalog?.teacherLoadError
          ? centerCatalog.teacherLoadError
          : '';
    if (loadError) {
      showToast(`取得エラー: ${loadError}`, 'error');
      return;
    }
    if (!records.length) {
      showToast('所属校舎の一覧がありません。Account を設定してください。', 'error');
      return;
    }
    closeSearchModal?.();
    closeSearchModal = mountEntitySearchModal({
      kind: bulkDeleteTarget,
      title: bulkDeleteTarget === 'teacher' ? '講師を選択（一括削除）' : '生徒を選択（一括削除）',
      records,
      initialQuery: bulkDeleteName,
      onSelect: (record) => {
        bulkDeleteName = record.name;
        renderBulkDelete();
      },
      onClose: () => {
        closeSearchModal = null;
      },
    });
  };

  const renderFiscalRolloverSummary = (): string => {
    const preview = previewFiscalRollover(session, closedDates);
    return `<p class="muted">
      現在 ${preview.currentYear} 年度 → 新 ${preview.nextYear} 年度 /
      削除対象 ${preview.deleteYear} 年度（${preview.deleteFrom} 〜 ${preview.deleteTo}）:
      ${preview.deletableCells.length} コマ削除、振替保護 ${preview.transferProtectedCount} 件<br />
      ${formatRepeatCleanupSummary(preview.repeatCleanup)}
    </p>`;
  };

  const runFiscalRollover = () => {
    const preview = previewFiscalRollover(session, closedDates);
    void confirmTokenInput({
      title: '翌年度を準備（R04）',
      messageHtml:
        `<p><strong>${preview.nextYear} 年度</strong>の準備を行います。</p>` +
        `<p>前年度（${preview.deleteYear} 年度）のコマ <strong>${preview.deletableCells.length}</strong> 件を削除します。</p>` +
        `<p>振替跨ぎ保護: <strong>${preview.transferProtectedCount}</strong> 件は残します。</p>` +
        `<p>slotMeta 削除: <strong>${preview.deletableSlotMetaCount}</strong> 件</p>` +
        `<p>${formatRepeatCleanupSummary(preview.repeatCleanup)}</p>` +
        `<p class="muted">実行前に JSON バックアップをダウンロードします。</p>`,
      expectedToken: preview.token,
      confirmLabel: '翌年度準備を実行',
    }).then(async (ok) => {
      if (!ok) {
        showToast('確認トークンが一致しないため中止しました', 'error');
        return;
      }
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      downloadText(
        `booth-backup-${preview.token}-${stamp}.json`,
        buildRolloverBackupJson(session, preview),
        'application/json;charset=utf-8',
      );
      applyFiscalRollover(session, preview);
      await saveNow();
      showToast(`${preview.nextYear} 年度の準備が完了しました`, 'success');
      options.onSessionChange?.({ resetPrintDateRange: true });
      renderAll();
    });
  };

  const renderToolbar = () => {
    const external = options.getWeekGapReport?.();
    if (external) {
      weekGapReport = external.report;
      weekGapLoading = external.loading;
    }
    const gapBanner = weekGapLoading
      ? '<div class="schedule-gap-banner muted">Manabie Schedule 警告を確認中...</div>'
      : renderScheduleGapBannerPlainHtml(weekGapReport);
    const clipHint = slotClipboard
      ? '<span class="muted booth-clip-hint">クリップボード: コマ内容あり</span>'
      : '';
    const moveHint = moveSource
      ? `<span class="muted booth-clip-hint">移動先をクリック (${moveSource.date} B${moveSource.booth} ${moveSource.period}限)</span>`
      : '';
    const virtual = getVirtualState();
    const dayNav = virtual.enabled
      ? `<span class="booth-day-nav footer-actions">
          <button type="button" class="btn btn-sm" data-action="booth-day-prev" ${virtual.dayOffset <= 0 ? 'disabled' : ''}>◀ 日</button>
          <span class="muted booth-day-range">${formatVirtualDayRange(virtual.visibleDates)}</span>
          <button type="button" class="btn btn-sm" data-action="booth-day-next" ${virtual.dayOffset >= virtual.maxOffset ? 'disabled' : ''}>日 ▶</button>
        </span>`
      : '';
    toolbarEl.innerHTML = `
      ${gapBanner}
      <div class="booth-toolbar-row" aria-live="polite">
        <strong>${fiscalYearLabel()}年度 — ${navState.anchor.getFullYear()}年 — ${session.settings.classroomName}</strong>
        ${dayNav}
        <button type="button" class="btn btn-sm" data-action="booth-week-copy">前週→今週コピー</button>
        <button type="button" class="btn btn-sm" data-action="booth-print-a3">A3 印刷（F12）</button>
        ${clipHint}
        ${moveHint}
        <span class="sr-only booth-clip-live" aria-live="polite"></span>
      </div>`;
    clipLiveRegion = toolbarEl.querySelector('.booth-clip-live');
    updateClipLiveRegion();
  };

  const refreshWeekGapReport = () => {
    const accountId = session.settings.accountId.trim();
    const dates = visibleWeekDates(navState, session.settings.hideSunday).map(formatDateKey);
    if (!accountId || !dates.length) {
      weekGapReport = null;
      renderToolbar();
      return;
    }
    void options.onWeekGapRefresh?.({
      accountId,
      dateFrom: dates[0]!,
      dateTo: dates[dates.length - 1]!,
      daysWithBoothStudents: collectBoothActiveDays(session.cells, dates),
    });
  };

  const renderSlotDetail = () => {
    if (!selected) {
      slotDetailEl.innerHTML = '<p class="muted">コマをクリックして選択</p>';
      attendancePanel.refresh();
      return;
    }
    const seat1 = getCell(session, selected.date, selected.booth, selected.period, 1);
    const seat2 = getCell(session, selected.date, selected.booth, selected.period, 2);
    const slotMeta = getSlotMeta(session, selected.date, selected.booth, selected.period);
    slotDetailEl.innerHTML = `
      <h2>選択中コマ</h2>
      <p><strong>${selected.date}</strong> / B${selected.booth} / ${selected.period}限</p>
      <p class="muted">操作中: 席${selectedSeat}</p>
      <p>講師: ${slotMeta.teacherName || '—'}</p>
      <p>席1: ${seat1.studentName || '—'} (${seat1.subject || '—'}) ${seat1.grade ? `[${seat1.grade}]` : ''} ${seat1.attendance ? `[${seat1.attendance}]` : ''}</p>
      <p>席2: ${seat2.studentName || '—'} (${seat2.subject || '—'}) ${seat2.grade ? `[${seat2.grade}]` : ''} ${seat2.attendance ? `[${seat2.attendance}]` : ''}</p>
      <div class="footer-actions booth-slot-actions">
        <button type="button" class="btn btn-sm" data-action="slot-copy">コピー</button>
        <button type="button" class="btn btn-sm" data-action="slot-paste" ${slotClipboard ? '' : 'disabled'}>貼付</button>
        <button type="button" class="btn btn-sm" data-action="slot-move">移動</button>
        <button type="button" class="btn btn-sm" data-action="slot-highlight">${slotMeta.highlighted ? '強調解除' : '強調'}</button>
        <button type="button" class="btn danger btn-sm" data-action="clear-slot">クリア</button>
      </div>
    `;
    attendancePanel.refresh();
  };

  const updatePreview = () => {
    const dates = visibleWeekDates(navState, session.settings.hideSunday).map(formatDateKey);
    const rows = boothCellsToPrintRows(session.cells, session.settings, dates, session.slotMeta, session.slotSyncState);
    previewHost.innerHTML = `
      <p><strong>${rows.length}</strong> 行（この週）</p>
      <p class="muted">詳細編集は授業一覧タブで行います。</p>
      <button type="button" class="btn" data-action="goto-print-tab">授業一覧タブを開く</button>
    `;
  };

  const renderGrid = () => {
    const virtual = getVirtualState();
    const dateKeys = virtual.visibleDates;
    const dates = dateKeys.map((key) => parseDateKey(key));
    const closed = closedDateSet(closedDates);
    const periods = visiblePeriodNumbers(session.settings);
    const subHeaders = periods
      .map(() => '<th class="booth-subhead">講師</th><th class="booth-subhead">生徒</th><th class="booth-subhead">学年</th><th class="booth-subhead">教科</th>')
      .join('');
    const periodHeaders = periods
      .map((p) => {
        const start = session.settings.periodStartTimes?.[String(p)];
        const end = session.settings.periodEndTimes?.[String(p)];
        const timeLabel =
          start && end ? `${start}–${end}` : start ? `${start}〜` : end ? `〜${end}` : '';
        const label = timeLabel ? `${p}限 ${timeLabel}` : `${p}限`;
        return `<th colspan="4" class="booth-period-head">${label}</th>`;
      })
      .join('');
    const boothRowSpan = session.settings.boothCount * 2;
    const bodyRows = dates
      .flatMap((date) => {
        const key = formatDateKey(date);
        const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
        const isClosed = closed.has(key);
        const closedLabel = isClosed
          ? `<div class="closed-day-label">${closedDates.find((c) => c.date === key)?.title ?? '休校日'}</div>`
          : '';
        const dayActions = isClosed
          ? `<div class="booth-date-actions">
              <button type="button" class="btn btn-sm" data-action="unmark-closed" data-date="${key}">休校解除</button>
            </div>`
          : `<div class="booth-date-actions">
              <button type="button" class="btn btn-sm" data-action="bulk-attend" data-date="${key}">出席</button>
              <button type="button" class="btn btn-sm" data-action="mark-closed" data-date="${key}">休校</button>
              <button type="button" class="btn btn-sm danger" data-action="clear-day" data-date="${key}">削除</button>
            </div>`;
        return Array.from({ length: session.settings.boothCount }, (_, boothIdx) => {
          const booth = boothIdx + 1;
          const row1Cells = periods
            .map((period) => {
              const slotMeta = getSlotMeta(session, key, booth, period);
              const sel = slotSelected(selected, key, booth, period);
              const stateCls = periodCellStateClass(key, booth, period, session, weekGapReport, isClosed);
              const disabled = isClosed ? 'disabled' : '';
              const teacherCls = [
                'booth-teacher-cell',
                'booth-field-cell',
                stateCls,
                sel ? 'booth-slot-selected' : '',
                slotMeta.highlighted ? 'booth-cell-highlighted' : '',
              ]
                .filter(Boolean)
                .join(' ');
              const teacherAria = sel ? ' aria-selected="true"' : '';
              return `
                <td rowspan="2" class="${teacherCls}" data-action="select-slot" data-date="${key}" data-booth="${booth}" data-period="${period}"${teacherAria}>
                  ${renderEntityButton({
                    picker: 'teacher',
                    date: key,
                    booth,
                    period,
                    value: slotMeta.teacherName,
                    placeholder: '講師',
                    disabled,
                    extraClass: 'booth-teacher-input',
                  })}
                </td>
                ${renderSeatFieldTds(key, booth, period, 1, session, catalog, isClosed, false, stateCls, sel, selectedSeat)}`;
            })
            .join('');
          const row2Cells = periods
            .map((period) => {
              const sel = slotSelected(selected, key, booth, period);
              const stateCls = periodCellStateClass(key, booth, period, session, weekGapReport, isClosed);
              const blockSeat2 = shouldBlockSeat2(session, key, booth, period, catalog, centerCatalog);
              return renderSeatFieldTds(
                key,
                booth,
                period,
                2,
                session,
                catalog,
                isClosed,
                blockSeat2,
                stateCls,
                sel,
                selectedSeat,
              );
            })
            .join('');
          const dateCell =
            boothIdx === 0
              ? `<td rowspan="${boothRowSpan}" class="booth-date-cell ${isClosed ? 'closed-day' : ''}">
                  <div class="booth-date-label">${key}</div>
                  <div class="muted booth-date-weekday">${weekday}</div>
                  ${closedLabel}
                  ${dayActions}
                </td>`
              : '';
          const rowCls = isClosed ? 'booth-row-closed' : '';
          return `
            <tr class="booth-seat-row-1 ${rowCls}">
              ${dateCell}
              <td rowspan="2" class="booth-label">B${booth}</td>
              ${row1Cells}
            </tr>
            <tr class="booth-seat-row-2 ${rowCls}">${row2Cells}</tr>`;
        });
      })
      .join('');
    gridHost.innerHTML = `<table class="booth-grid-table booth-excel-table">
      <thead>
        <tr><th rowspan="2" class="booth-date-head">日付</th><th rowspan="2" class="booth-label-head">ブース</th>${periodHeaders}</tr>
        <tr>${subHeaders}</tr>
      </thead>
      <tbody>${bodyRows}</tbody>
    </table>`;
  };

  const renderAll = () => {
    renderContextBar();
    renderSettings();
    renderBulkDelete();
    renderToolbar();
    if (viewMode() === 'grid') {
      renderGrid();
      renderSlotDetail();
      updatePreview();
    }
    refreshRepeatPanel();
    void refreshWeekGapReport();
    void ensureSubjectCatalog();
  };

  const applySlotPickerResult = (
    field: HTMLElement,
    result: SlotPickerConfirmResult,
    explicitSeat: 1 | 2,
  ) => {
    const picker = field.dataset.picker;
    const date = field.dataset.date;
    const booth = Number(field.dataset.booth);
    const period = Number(field.dataset.period);

    if (picker === 'teacher' && date && booth && period && !Number.isNaN(booth) && !Number.isNaN(period)) {
      upsertSlotMeta(session, { date, booth, period, teacherName: result.record.name });
      void persist();
      renderSlotDetail();
      updatePreview();
    } else if (picker !== 'teacher' && date && booth && period && !Number.isNaN(booth) && !Number.isNaN(period)) {
      applyCellFieldChange(date, booth, period, String(explicitSeat), 'student', result.record.name);
      const autoGrade = gradeFromCatalogRecord(result.record);
      if (autoGrade) {
        const cell = getCell(session, date, booth, period, explicitSeat);
        cell.grade = autoGrade;
        upsertCell(session, cell);
      }
    }

    if (result.studentRepeat) {
      const repeatInput = {
        type: 'student' as const,
        name: result.record.name,
        subject: result.studentRepeat.subject,
        grade: gradeFromCatalogRecord(result.record) ?? getCell(session, date!, booth, period, explicitSeat).grade,
        dow: result.studentRepeat.dow,
        period: result.studentRepeat.period,
        booth: result.studentRepeat.booth,
        homeSeat: result.studentRepeat.homeSeat,
        capacity: result.studentRepeat.capacity,
        interval: result.studentRepeat.interval,
        startDate: result.studentRepeat.startDate,
        endDate: result.studentRepeat.endDate,
      };
      const dry = dryRunRepeat(session, repeatInput, closedDates);
      applyRepeatPlan(session, repeatInput, dry.plan, closedDates);
      void persist();
      refreshRepeatPanel();
      showToast(`繰り返し配置: ${dry.plan.length} コマ`, 'success');
    }

    if (result.teacherRepeat) {
      const repeatInput = {
        teacherName: result.record.name,
        dow: result.teacherRepeat.dow,
        period: result.teacherRepeat.period,
        booth: result.teacherRepeat.booth,
        interval: result.teacherRepeat.interval,
        startDate: result.teacherRepeat.startDate,
        endDate: result.teacherRepeat.endDate,
      };
      const dry = dryRunTeacherRepeat(repeatInput, closedDates, session);
      applyTeacherRepeat(session, repeatInput, closedDates);
      void persist();
      refreshRepeatPanel();
      showToast(`講師繰り返し: ${dry.dates.length} 日`, 'success');
    }
  };

  const clearEntityPickerField = (field: HTMLElement): void => {
    const picker = field.dataset.picker;
    const date = field.dataset.date;
    const booth = Number(field.dataset.booth);
    const period = Number(field.dataset.period);
    if (!date || !booth || !period || Number.isNaN(booth) || Number.isNaN(period)) return;
    if (picker === 'teacher') {
      upsertSlotMeta(session, { date, booth, period, teacherName: '' });
      void persist();
      renderGrid();
      renderSlotDetail();
      updatePreview();
      showToast('講師を解除しました', 'success');
      return;
    }
    if (picker === 'student') {
      const seat = parseSeatNumber(field.dataset.seat);
      applyCellFieldChange(date, booth, period, String(seat), 'student', '');
      renderGrid();
      showToast('生徒を解除しました', 'success');
    }
  };

  const openEntityPicker = (field: HTMLElement) => {
    const picker = field.dataset.picker;
    if (!picker || (field instanceof HTMLButtonElement && field.disabled)) return;
    if (Date.now() < suppressPickerUntil) return;
    closeSearchModal?.();

    if (picker === 'subject') {
      const records = subjectsForPicker(catalog, session);
      if (!records.length) {
        showToast('教科一覧がありません。前提マスタ同期を実行してください。', 'error');
        return;
      }
      closeSearchModal = mountEntitySearchModal({
        kind: 'subject',
        title: '教科を選択',
        records,
        initialQuery: entityFieldValueFromSession(field),
        onSelect: (record) => {
          suppressPickerUntil = Date.now() + 250;
          const date = field.dataset.date;
          const booth = Number(field.dataset.booth);
          const period = Number(field.dataset.period);
          const seatRaw = field.dataset.seat;
          if (date && booth && period && seatRaw) {
            applyCellFieldChange(date, booth, period, seatRaw, 'subject', record.name);
            renderGrid();
          }
          field.blur();
        },
        onClose: () => {
          closeSearchModal = null;
        },
      });
      return;
    }

    const pickerSeat = parseSeatNumber(field.dataset.seat);
    const records =
      picker === 'teacher'
        ? teachersForPicker(centerCatalog, catalog?.catalogs.teachers)
        : studentsForPicker(centerCatalog, catalog?.catalogs.students);
    if (!records.length) {
      const msg = centerCatalog?.studentLoadError
        ? `生徒取得エラー: ${centerCatalog.studentLoadError}`
        : centerCatalog?.teacherLoadError && picker === 'teacher'
          ? `講師取得エラー: ${centerCatalog.teacherLoadError}`
          : '所属校舎の一覧がありません。Account を設定してください。';
      showToast(msg, 'error');
      return;
    }

    const date = field.dataset.date;
    const booth = Number(field.dataset.booth);
    const period = Number(field.dataset.period);
    const ref: BoothSlotRef | null = date && booth && period ? { date, booth, period } : null;
    const cell = ref ? getCell(session, ref.date, ref.booth, ref.period, pickerSeat) : null;

    closeSearchModal = mountSlotPickerModal({
      kind: picker === 'teacher' ? 'teacher' : 'student',
      title: picker === 'teacher' ? '講師を選択' : '生徒を選択',
      records,
      initialQuery: entityFieldValueFromSession(field),
      subjectRecords: subjectsForPicker(catalog, session),
      prefill: ref
        ? slotRepeatPrefillFromRef(ref, pickerSeat, weekDateKeys(), cell?.subject)
        : undefined,
      onConfirm: (result) => {
        suppressPickerUntil = Date.now() + 250;
        applySlotPickerResult(field, result, pickerSeat);
        field.blur();
        renderAll();
      },
      onClose: () => {
        closeSearchModal = null;
      },
    });
  };

  const bindEvents = () => {
    if (bound) return;
    bound = true;

    shell.addEventListener('click', (event) => {
      const rawTarget = event.target as HTMLElement;
      if (rawTarget.closest('select.subject-select')) return;
      const entityBtn = rawTarget.closest('[data-picker="student"], [data-picker="teacher"]') as HTMLElement | null;
      if (entityBtn && event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        clearEntityPickerField(entityBtn);
        return;
      }
      const target = rawTarget.closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'goto-print-tab') {
        document.querySelector<HTMLElement>('[data-tab="print"]')?.click();
        return;
      }
      if (action === 'booth-mode-calendar') {
        session.settings.boothViewMode = 'calendar';
        void persist();
        renderAll();
        void refreshCalendarPanel?.({ catalog, closedDates });
        return;
      }
      if (action === 'booth-mode-grid') {
        session.settings.boothViewMode = 'grid';
        void persist();
        renderAll();
        return;
      }
      if (action === 'booth-toggle-context') {
        contextCollapsed = !contextCollapsed;
        session.settings.contextCollapsed = contextCollapsed;
        void persist();
        renderContextBar();
        return;
      }
      if (action === 'booth-toggle-settings') {
        settingsCollapsed = !settingsCollapsed;
        session.settings.settingsCollapsed = settingsCollapsed;
        void persist();
        renderContextBar();
        return;
      }
      if (action === 'booth-toggle-preview') {
        previewCollapsed = !previewCollapsed;
        session.settings.previewCollapsed = previewCollapsed;
        void persist();
        renderContextBar();
        return;
      }
      if (action === 'fiscal-rollover-run') {
        runFiscalRollover();
        return;
      }
      if (action === 'bulk-delete-pick') {
        openBulkDeletePicker();
        return;
      }
      if (action === 'bulk-delete-clear-name') {
        bulkDeleteName = '';
        renderBulkDelete();
        return;
      }
      if (action === 'bulk-delete-run') {
        const range = bulkDeleteWeekRange();
        const preview = previewBulkDelete(
          session,
          bulkDeleteTarget,
          bulkDeleteName,
          range.from,
          range.to,
          closedDates,
        );
        if (!preview.matches.length) {
          showToast('削除対象のコマがありません', 'error');
          return;
        }
        void confirmAction({
          title: '一括削除（F04）',
          messageHtml:
            `<p>${escapeAttr(preview.name)} の${bulkDeleteTarget === 'student' ? '生徒配置' : '講師配置'}を ` +
            `<strong>${preview.matches.length}</strong> コマ削除します（${range.from} 〜 ${range.to}）。</p>`,
          confirmLabel: '削除',
          danger: true,
        }).then(async (ok) => {
          if (!ok) return;
          applyBulkDelete(session, preview);
          bulkDeleteName = '';
          await saveNow();
          showToast(`${preview.matches.length} コマを削除しました`, 'success');
          renderAll();
        });
        return;
      }
      if (action === 'unmark-closed') {
        const date = target.dataset.date!;
        void options.onUnmarkClosedDate?.(date);
        return;
      }
      if (action === 'bulk-attend') {
        const date = target.dataset.date!;
        bulkSetAttendance(session, date, '出席', closedDates);
        void saveNow();
        renderGrid();
        renderSlotDetail();
        return;
      }
      if (action === 'mark-closed') {
        const date = target.dataset.date!;
        void options.onMarkClosedDate?.(date, '休校日');
        return;
      }
      if (action === 'clear-day') {
        const date = target.dataset.date!;
        void confirmAction({
          title: '全コマ削除',
          messageHtml: `<p>${date} の全コマ（講師・生徒）を削除します。</p>`,
          confirmLabel: '削除',
          danger: true,
        }).then((ok) => {
          if (!ok) return;
          clearAllSlotsForDate(session, date);
          void saveNow();
          renderAll();
        });
        return;
      }
      if (action === 'booth-week-copy') {
        const dates = allWeekDates().map(formatDateKey);
        if (dates.length < 7) {
          showToast('週コピーには7日分の表示が必要です', 'error');
          return;
        }
        const targetStart = dates[0]!;
        const sourceStart = formatDateKey(new Date(new Date(`${targetStart}T12:00:00`).getTime() - 7 * 86400000));
        void confirmAction({
          title: '前週→今週コピー',
          messageHtml: `<p>${sourceStart} 〜 から ${targetStart} 〜 へ、講師+生徒が揃ったコマのみコピーします（空きコマのみ）。</p>`,
          confirmLabel: 'コピー',
        }).then((ok) => {
          if (!ok) return;
          const result = copyWeekSlots(session, sourceStart, targetStart, 7, closedDates);
          void saveNow();
          showToast(
            `週コピー: ${result.copied} コマ（占有スキップ ${result.skippedOccupied} / 空スキップ ${result.skippedEmpty}）`,
            'success',
          );
          renderAll();
        });
        return;
      }
      if (action === 'slot-copy' && selected) {
        slotClipboard = captureSlot(session, selected);
        moveSource = null;
        showToast('コマをコピーしました', 'success');
        renderToolbar();
        renderSlotDetail();
        updateClipLiveRegion();
        return;
      }
      if (action === 'slot-paste' && selected && slotClipboard) {
        const pasted = pasteSlot(session, selected, slotClipboard, closedDates);
        if (!pasted.ok) showToast(pasted.error ?? '貼付失敗', 'error');
        else {
          void saveNow();
          renderAll();
          showToast('貼り付けました', 'success');
        }
        return;
      }
      if (action === 'slot-move' && selected) {
        moveSource = { ...selected };
        slotClipboard = null;
        showToast('移動先のコマをクリックしてください', 'success');
        renderToolbar();
        updateClipLiveRegion();
        return;
      }
      if (action === 'slot-highlight' && selected) {
        const meta = getSlotMeta(session, selected.date, selected.booth, selected.period);
        upsertSlotMeta(session, { ...meta, highlighted: !meta.highlighted });
        void persist();
        renderGrid();
        renderSlotDetail();
        return;
      }
      if (action === 'booth-print-a3') {
        document.body.classList.add('print-booth-a3');
        window.print();
        window.setTimeout(() => document.body.classList.remove('print-booth-a3'), 500);
        return;
      }
      if (action === 'booth-day-prev') {
        const virtual = getVirtualState();
        syncDayOffset(navigateDayOffset(virtual.dayOffset, -1, virtual.maxOffset));
        renderGrid();
        renderToolbar();
        return;
      }
      if (action === 'booth-day-next') {
        const virtual = getVirtualState();
        syncDayOffset(navigateDayOffset(virtual.dayOffset, 1, virtual.maxOffset));
        renderGrid();
        renderToolbar();
        return;
      }
      if (action === 'booth-prev') {
        resetWeekDayOffset();
        navState = navigatePrev(navState);
      } else if (action === 'booth-next') {
        resetWeekDayOffset();
        navState = navigateNext(navState);
      } else if (action === 'booth-today') {
        resetWeekDayOffset();
        navState = jumpToToday(navState);
      } else if (action === 'select-slot') {
        const next: BoothSlotRef = {
          date: target.dataset.date!,
          booth: Number(target.dataset.booth),
          period: Number(target.dataset.period),
        };
        if (moveSource) {
          const moved = moveSlot(session, moveSource, next, closedDates);
          moveSource = null;
          updateClipLiveRegion();
          if (!moved.ok) showToast(moved.error ?? '移動失敗', 'error');
          else {
            void saveNow();
            showToast('コマを移動しました', 'success');
          }
          selected = next;
          renderAll();
          return;
        }
        const previousSelected = selected;
        selected = next;
        const clickedSeat = resolveSeatFromTarget(target);
        if (clickedSeat) {
          selectedSeat = clickedSeat;
          focusedFieldHint = clickedSeat === 2 ? 'seat2' : 'seat1';
        } else {
          const s1 = getCell(session, selected.date, selected.booth, selected.period, 1);
          const s2 = getCell(session, selected.date, selected.booth, selected.period, 2);
          selectedSeat = s1.studentName.trim() ? 1 : s2.studentName.trim() ? 2 : 1;
          focusedFieldHint = selectedSeat === 2 ? 'seat2' : 'seat1';
        }
        applySelectionVisuals(previousSelected);
        renderSlotDetail();
        updatePreview();
        return;
      } else if (action === 'clear-slot' && selected) {
        clearSlot(session, selected);
        void persist();
        renderGrid();
        renderSlotDetail();
        updatePreview();
        return;
      } else return;
      renderAll();
    });

    shell.addEventListener('change', (event) => {
      const target = event.target as HTMLInputElement | HTMLSelectElement;
      if (target.id === 'booth-classroom') session.settings.classroomName = target.value;
      else if (target.id === 'booth-manual-override') {
        manualSettingsOverride = target.checked;
        if (manualSettingsOverride) session.settings.accountSource = 'manual';
        renderSettings();
        return;
      }
      else if (target.id === 'booth-account') {
        session.settings.accountId = target.value;
        session.settings.accountSource = 'manual';
        manualSettingsOverride = true;
        const loc = catalog?.catalogs.locations.find((item) => item.id === target.value);
        if (loc) session.settings.classroomName = loc.name;
        const boothN = boothCountFromCatalog(catalog, target.value);
        if (boothN) session.settings.boothCount = boothN;
        void saveBoothSession(options.hostname, session);
        void reloadCenterCatalog();
        options.onAccountChange?.();
        renderAll();
        return;
      }
      else if (target.id === 'booth-bulk-start') {
        bulkDeleteStartDate = target.value;
        renderBulkDelete();
        return;
      } else if (target.id === 'booth-periods') {
        session.settings.periodCount = Math.max(1, Number(target.value) || 1);
        session.settings = normalizeSettingsAfterPeriodCountChange(session.settings);
        resetWeekDayOffset();
      } else if (target.id === 'booth-hide-sunday') {
        session.settings.hideSunday = target.checked;
        resetWeekDayOffset();
      } else if (target.id === 'booth-one-to-one') session.settings.oneToOneMode = target.checked;
      else if (target.name === 'bulk-delete-target') {
        bulkDeleteTarget = target.value as BulkDeleteTarget;
        bulkDeleteName = '';
        renderBulkDelete();
        return;
      }
      else if (target.dataset.periodStart) {
        const period = String(target.dataset.periodStart);
        if (!session.settings.periodStartTimes) session.settings.periodStartTimes = {};
        const value = target.value.trim();
        if (value) session.settings.periodStartTimes[period] = value;
        else delete session.settings.periodStartTimes[period];
      } else if (target.dataset.periodEnd) {
        const period = String(target.dataset.periodEnd);
        if (!session.settings.periodEndTimes) session.settings.periodEndTimes = {};
        const value = target.value.trim();
        if (value) session.settings.periodEndTimes[period] = value;
        else delete session.settings.periodEndTimes[period];
      }       else if (target.dataset.periodFilter) {
        const period = Number(target.dataset.periodFilter);
        const set = new Set(session.settings.visiblePeriods);
        if (target.checked) set.add(period);
        else set.delete(period);
        session.settings.visiblePeriods = [...set].sort((a, b) => a - b);
      } else if (target instanceof HTMLSelectElement && target.dataset.seat?.endsWith('-subject')) {
        const date = target.dataset.date;
        const booth = Number(target.dataset.booth);
        const period = Number(target.dataset.period);
        const seatRaw = target.dataset.seat;
        if (!date || !booth || !period || !seatRaw) return;
        applyCellFieldChange(date, booth, period, seatRaw, 'subject', target.value);
        return;
      } else return;
      void saveBoothSession(options.hostname, session);
      options.onSessionChange?.();
      renderAll();
    });

    shell.addEventListener('input', (event) => {
      const target = event.target as HTMLInputElement;
      const date = target.dataset.date;
      const booth = Number(target.dataset.booth);
      const period = Number(target.dataset.period);
      const seatRaw = target.dataset.seat;
      if (!date || !booth || !period || !seatRaw) return;
      if (closedDateSet(closedDates).has(date)) return;
      if (seatRaw.endsWith('-subject')) return;
      if (target.dataset.picker) return;
      const seat = parseSeatNumber(seatRaw);
      if (shouldBlockSeat2(session, date, booth, period, catalog, centerCatalog) && seat === 2 && !seatRaw.includes('-')) return;
      if (seatRaw.endsWith('-grade')) {
        applyCellFieldChange(date, booth, period, seatRaw, 'grade', target.value);
        return;
      }
    });

    shell.addEventListener('dblclick', (event) => {
      const field = (event.target as HTMLElement).closest('[data-picker="student"], [data-picker="teacher"]') as HTMLElement | null;
      if (!field) return;
      if (field instanceof HTMLButtonElement && field.disabled) return;
      event.preventDefault();
      event.stopPropagation();
      openEntityPicker(field);
    });

    shell.addEventListener('keydown', (event) => {
      const shortcut = isClipboardShortcut(event);
      if (shortcut && selected) {
        event.preventDefault();
        if (shortcut === 'copy') {
          slotClipboard = captureSlot(session, selected);
          moveSource = null;
          showToast('コマをコピーしました', 'success');
          renderToolbar();
          updateClipLiveRegion();
          return;
        }
        if (shortcut === 'paste' && slotClipboard) {
          const pasted = pasteSlot(session, selected, slotClipboard, closedDates);
          if (!pasted.ok) showToast(pasted.error ?? '貼付失敗', 'error');
          else {
            void saveNow();
            renderAll();
            showToast('貼り付けました', 'success');
            focusSlotInput(selected);
          }
          return;
        }
        if (shortcut === 'cut') {
          moveSource = { ...selected };
          slotClipboard = null;
          showToast('移動先のコマをクリックしてください', 'success');
          renderToolbar();
          updateClipLiveRegion();
          return;
        }
      }

      if (event.key === 'Escape') {
        if (moveSource || slotClipboard) {
          event.preventDefault();
          moveSource = null;
          slotClipboard = null;
          renderToolbar();
          updateClipLiveRegion();
          showToast('クリップボード/移動をキャンセルしました', 'success');
        }
        return;
      }

      if (event.key === 'Tab' && selected) {
        const hintTarget = event.target instanceof HTMLElement ? event.target : null;
        const hint = hintTarget ? fieldHintFromInput(hintTarget) : null;
        if (hint) {
          event.preventDefault();
          const nextHint = nextFieldHint(hint, event.shiftKey);
          focusSlotInput(selected, nextHint);
          return;
        }
      }

      const fieldTarget = event.target instanceof HTMLElement ? event.target : null;
      if (!selected || !fieldTarget) return;
      const activeHint = fieldHintFromInput(fieldTarget);
      if (!activeHint) return;
      const dates = allWeekDates().map(formatDateKey);
      const periods = visiblePeriodNumbers(session.settings);
      const dateIdx = dates.indexOf(selected.date);
      const periodIdx = periods.indexOf(selected.period);
      let handled = false;
      if (event.key === 'ArrowRight' && !event.altKey && periodIdx >= 0 && periodIdx < periods.length - 1) {
        selected = { ...selected, period: periods[periodIdx + 1]! };
        handled = true;
      } else if (event.key === 'ArrowLeft' && !event.altKey && periodIdx > 0) {
        selected = { ...selected, period: periods[periodIdx - 1]! };
        handled = true;
      } else if (event.key === 'ArrowDown') {
        selected = { ...selected, booth: Math.min(session.settings.boothCount, selected.booth + 1) };
        handled = true;
      } else if (event.key === 'ArrowUp') {
        selected = { ...selected, booth: Math.max(1, selected.booth - 1) };
        handled = true;
      } else if (event.key === 'ArrowRight' && event.altKey && dateIdx >= 0 && dateIdx < dates.length - 1) {
        selected = { ...selected, date: dates[dateIdx + 1]! };
        handled = true;
      } else if (event.key === 'ArrowLeft' && event.altKey && dateIdx > 0) {
        selected = { ...selected, date: dates[dateIdx - 1]! };
        handled = true;
      }
      if (handled) {
        event.preventDefault();
        const virtual = getVirtualState();
        if (virtual.enabled) {
          const newIdx = dates.indexOf(selected.date);
          if (newIdx >= 0) syncDayOffset(newIdx, false);
        }
        renderGrid();
        renderSlotDetail();
        focusSlotInput(selected);
      }
    });
  };

  bindEvents();
  refreshCalendarPanel = await mountBoothLessonCalendar(calendarHost, {
    hostname: options.hostname,
    catalog,
    closedDates,
    editorRoot: lessonEditorHost,
    onChange: (lessons) => options.onLessonsChange?.(lessons),
  });
  void reloadCenterCatalog();
  renderAll();

  return async (partial) => {
    if (partial?.closedDates) closedDates = partial.closedDates;
    if (partial?.catalog !== undefined) {
      catalog = partial.catalog;
      subjectsLoadAttempted = false;
    }
    if (partial?.reloadSession) session = await loadBoothSession(options.hostname);
    if (partial?.reloadSession) {
      settingsCollapsed = session.settings.settingsCollapsed ?? false;
      previewCollapsed = session.settings.previewCollapsed ?? false;
      contextCollapsed = session.settings.contextCollapsed ?? false;
      void reloadCenterCatalog();
    }
    if (partial?.refreshGapBanner) {
      renderToolbar();
      return;
    }
    void refreshCalendarPanel?.({ catalog, closedDates: partial?.closedDates ?? closedDates });
    renderAll();
  };
}
