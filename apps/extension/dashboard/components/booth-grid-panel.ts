import type { ClosedDateDefinition, LessonMasterCatalog } from '../../src/contracts';
import { attendanceCssClass, bulkSetAttendance } from '../../lib/booth-attendance';
import {
  captureSlot,
  clearAllSlotsForDate,
  moveSlot,
  pasteSlot,
  type SlotClipboardPayload,
} from '../../lib/booth-slot-clipboard';
import { copyWeekSlots } from '../../lib/booth-week-copy';
import { gradeForStudentName } from '../../lib/booth-grade-lookup';
import { formatDateKey, schoolYearFromDate, weekRow } from '../../lib/calendar-utils';
import { jumpToToday, navigateNext, navigatePrev } from '../../lib/calendar/calendar-state';
import { createInitialCalendarState, type CalendarUIState } from '../../lib/calendar/calendar-state';
import { boothCellsToPrintRows, buildSlotKey } from '../../lib/booth-print-sheet';
import type { NormalizedLessonSession } from '../../src/services/manaerpLessonQueryService';
import { periodCellSyncClass } from '../../lib/sync-manifest';
import {
  collectBoothActiveDays,
  type ScheduleGapReport,
} from '../../src/services/lessonScheduleGapService';
import { confirmAction } from './confirm-modal';
import { renderScheduleGapBannerPlainHtml } from './operator-messages';
import { showAlert, showToast } from './toast';
import {
  clearSlot,
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
} from '../../lib/booth-session-state';
import { mountAttendancePanel } from './attendance-panel';
import { renderStudentDatalist, renderStudentDatalistId } from './slot-sync-panel';

export interface BoothGridPanelOptions {
  hostname: string;
  closedDates: ClosedDateDefinition[];
  catalog?: LessonMasterCatalog | null;
  onSessionChange?: () => void;
  onAccountChange?: () => void;
  getWeekGapReport?: () => { report: ScheduleGapReport | null; loading: boolean };
  onWeekGapRefresh?: (options: {
    accountId: string;
    dateFrom: string;
    dateTo: string;
    daysWithBoothStudents: string[];
  }) => void | Promise<void>;
  onImportManaerpWeek?: (dateFrom: string, dateTo: string) => Promise<NormalizedLessonSession[]>;
  onMarkClosedDate?: (date: string, title: string) => void | Promise<void>;
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

function renderGradeDatalist(catalog: LessonMasterCatalog | null): string {
  const grades = new Set<string>();
  for (const student of catalog?.catalogs.students ?? []) {
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

const BOOTH_VIRTUAL_THRESHOLD = 400;
const BOOTH_DAYS_PER_VIEW = 2;

function estimateBoothCellCount(session: BoothGridSession, weekDayCount: number): number {
  return session.settings.boothCount * visiblePeriodNumbers(session.settings).length * weekDayCount * 2;
}

function seatClass(seat: 1 | 2, oneToOne: boolean, attendance?: string): string {
  const parts = [`booth-seat`, `seat-${seat}`];
  if (seat === 2 && oneToOne) parts.push('disabled');
  else if (seat === 2) parts.push('muted-seat');
  const attend = attendanceCssClass(attendance as import('../../lib/booth-attendance').AttendanceStatus);
  if (attend) parts.push(attend);
  return parts.join(' ');
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
  let navState = createInitialCalendarState();
  navState.view = 'week';
  let selected: BoothSlotRef | null = null;
  let selectedSeat: 1 | 2 = 1;
  let bound = false;
  let weekGapReport: ScheduleGapReport | null = null;
  let weekGapLoading = false;
  let virtualDayOffset = 0;
  let slotClipboard: SlotClipboardPayload | null = null;
  let moveSource: BoothSlotRef | null = null;

  const allWeekDates = (): Date[] => visibleWeekDates(navState, session.settings.hideSunday);

  const isVirtualScrollMode = (): boolean =>
    estimateBoothCellCount(session, allWeekDates().length) > BOOTH_VIRTUAL_THRESHOLD;

  const clampVirtualOffset = (): void => {
    if (!isVirtualScrollMode()) {
      virtualDayOffset = 0;
      return;
    }
    const max = Math.max(0, allWeekDates().length - BOOTH_DAYS_PER_VIEW);
    virtualDayOffset = Math.min(Math.max(0, virtualDayOffset), max);
  };

  const visibleGridDates = (): Date[] => {
    const all = allWeekDates();
    if (!isVirtualScrollMode()) return all;
    clampVirtualOffset();
    return all.slice(virtualDayOffset, virtualDayOffset + BOOTH_DAYS_PER_VIEW);
  };

  const persist = debounce(async () => {
    await saveBoothSession(options.hostname, session);
    options.onSessionChange?.();
  }, 300);

  const debouncedRenderGrid = debounce(() => {
    renderGrid();
    renderSlotDetail();
    updatePreview();
  }, 150);

  const saveNow = async () => {
    await saveBoothSession(options.hostname, session);
    options.onSessionChange?.();
  };

  const shell = document.createElement('div');
  shell.className = 'booth-layout';
  shell.innerHTML = `
    <aside class="booth-settings panel-card"></aside>
    <section class="booth-grid-area">
      <div class="grid-toolbar booth-toolbar"></div>
      <div class="booth-grid-host"></div>
    </section>
    <aside class="booth-preview panel-card">
      <div class="booth-slot-detail"></div>
      <div class="booth-attendance-host"></div>
      <h3>PrintSheet</h3>
      <div class="print-preview-host"></div>
    </aside>
  `;
  root.replaceChildren(shell);

  const settingsEl = shell.querySelector('.booth-settings') as HTMLElement;
  const toolbarEl = shell.querySelector('.booth-toolbar') as HTMLElement;
  const gridHost = shell.querySelector('.booth-grid-host') as HTMLElement;
  const slotDetailEl = shell.querySelector('.booth-slot-detail') as HTMLElement;
  const attendanceHost = shell.querySelector('.booth-attendance-host') as HTMLElement;
  const previewHost = shell.querySelector('.print-preview-host') as HTMLElement;

  const attendancePanel = mountAttendancePanel(attendanceHost, {
    getSession: () => session,
    getSelection: () => (selected ? { ref: selected, seat: selectedSeat } : null),
    setSelectedSeat: (seat) => {
      selectedSeat = seat;
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

  const renderSettings = () => {
    const periods = visiblePeriodNumbers(session.settings);
    const periodChecks = Array.from({ length: session.settings.periodCount }, (_, i) => i + 1)
      .map(
        (p) =>
          `<label class="period-filter-item"><input type="checkbox" data-period-filter="${p}" ${
            periods.includes(p) ? 'checked' : ''
          } /> ${p}限</label>`,
      )
      .join('');
    const accountField = catalog?.catalogs.locations.length
      ? `<label>拠点 (Account)
          <select id="booth-account">
            <option value="">— 選択 —</option>
            ${catalog.catalogs.locations
              .map(
                (loc) =>
                  `<option value="${loc.id}" ${session.settings.accountId === loc.id ? 'selected' : ''}>${loc.name}</option>`,
              )
              .join('')}
          </select>
        </label>`
      : `<label>Account ID<input id="booth-account" value="${session.settings.accountId}" placeholder="マスタ同期後に選択可能" /></label>`;
    const studentListId = renderStudentDatalistId();
    settingsEl.innerHTML = `
      <h2>表示設定</h2>
      <label>教室名<input id="booth-classroom" value="${session.settings.classroomName}" /></label>
      <label>年度<input id="booth-fiscal-year" value="${session.settings.fiscalYear}" placeholder="空欄=自動 (${fiscalYearLabel()})" /></label>
      ${accountField}
      <label>ブース数<input id="booth-count" type="number" min="1" max="12" value="${session.settings.boothCount}" /></label>
      <label>時限数<input id="booth-periods" type="number" min="1" max="10" value="${session.settings.periodCount}" /></label>
      <fieldset class="period-filter-fieldset">
        <legend>時限フィルタ</legend>
        <div class="period-filter-list">${periodChecks}</div>
      </fieldset>
      <fieldset class="period-times-fieldset">
        <legend>時限開始時刻（R10）</legend>
        ${Array.from({ length: session.settings.periodCount }, (_, i) => i + 1)
          .map(
            (p) =>
              `<label class="period-time-item">${p}限<input type="time" data-period-time="${p}" value="${(session.settings.periodStartTimes?.[String(p)] ?? '').replace(/"/g, '&quot;')}" /></label>`,
          )
          .join('')}
      </fieldset>
      <label><input id="booth-hide-sunday" type="checkbox" ${session.settings.hideSunday ? 'checked' : ''} /> 日曜を非表示</label>
      <label><input id="booth-one-to-one" type="checkbox" ${session.settings.oneToOneMode ? 'checked' : ''} /> 1:1 モード（席2無効）</label>
      <div class="footer-actions">
        <button type="button" class="btn" data-action="booth-prev">◀ 週</button>
        <button type="button" class="btn" data-action="booth-today">Today</button>
        <button type="button" class="btn" data-action="booth-next">週 ▶</button>
      </div>
      ${renderStudentDatalist(catalog)}
      ${renderGradeDatalist(catalog)}
    `;
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
    const allDays = allWeekDates();
    const virtualMode = isVirtualScrollMode();
    const virtualNav = virtualMode
      ? `<div class="booth-virtual-nav muted">
          <button type="button" class="btn btn-sm" data-action="booth-day-prev" ${virtualDayOffset <= 0 ? 'disabled' : ''}>◀ 日</button>
          <span>${virtualDayOffset + 1}–${Math.min(virtualDayOffset + BOOTH_DAYS_PER_VIEW, allDays.length)} / ${allDays.length} 日（仮想スクロール）</span>
          <button type="button" class="btn btn-sm" data-action="booth-day-next" ${virtualDayOffset + BOOTH_DAYS_PER_VIEW >= allDays.length ? 'disabled' : ''}>日 ▶</button>
        </div>`
      : '';
    const clipHint = slotClipboard
      ? '<span class="muted booth-clip-hint">クリップボード: コマ内容あり</span>'
      : '';
    const moveHint = moveSource
      ? `<span class="muted booth-clip-hint">移動先をクリック (${moveSource.date} B${moveSource.booth} ${moveSource.period}限)</span>`
      : '';
    toolbarEl.innerHTML = `
      ${gapBanner}
      ${virtualNav}
      <div class="booth-toolbar-row">
        <strong>${fiscalYearLabel()}年度 — ${navState.anchor.getFullYear()}年 — ${session.settings.classroomName}</strong>
        <button type="button" class="btn btn-sm" data-action="booth-week-copy">前週→今週コピー</button>
        <button type="button" class="btn btn-sm" data-action="booth-import-manaerp">Manabie 週参照</button>
        <button type="button" class="btn btn-sm" data-action="booth-print-a3">A3 印刷（F12）</button>
        ${clipHint}
        ${moveHint}
      </div>`;
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
      <p class="muted">詳細編集は PrintSheet タブで行います。</p>
      <button type="button" class="btn" data-action="goto-print-tab">PrintSheet タブを開く</button>
    `;
  };

  const renderGrid = () => {
    const dates = visibleGridDates();
    const closed = closedDateSet(closedDates);
    const periods = visiblePeriodNumbers(session.settings);
    const periodHeaders = periods
      .map((p) => {
        const start = session.settings.periodStartTimes?.[String(p)];
        return `<th>${p}限${start ? `<span class="muted period-time-label">${start}</span>` : ''}</th>`;
      })
      .join('');
    const oneToOne = session.settings.oneToOneMode;

    gridHost.innerHTML = dates
      .map((date) => {
        const key = formatDateKey(date);
        const weekday = ['日', '月', '火', '水', '木', '金', '土'][date.getDay()];
        const isClosed = closed.has(key);
        const dayCls = isClosed ? 'booth-day-block closed-day' : 'booth-day-block';
        const bulkBtn = isClosed
          ? ''
          : `<div class="booth-day-actions">
              <button type="button" class="btn btn-sm" data-action="bulk-attend" data-date="${key}">一括出席</button>
              <button type="button" class="btn btn-sm" data-action="mark-closed" data-date="${key}">休校化</button>
              <button type="button" class="btn btn-sm danger" data-action="clear-day" data-date="${key}">全コマ削除</button>
            </div>`;
        const boothBlocks = Array.from({ length: session.settings.boothCount }, (_, boothIdx) => {
          const booth = boothIdx + 1;
          const cells = periods
            .map((period) => {
              const seat1 = getCell(session, key, booth, period, 1);
              const seat2 = getCell(session, key, booth, period, 2);
              const slotMeta = getSlotMeta(session, key, booth, period);
              const sel = selected && slotRefKey(selected) === slotRefKey({ date: key, booth, period });
              const stateCls = periodCellStateClass(key, booth, period, session, weekGapReport, isClosed);
              const cellCls = ['booth-period-cell', sel ? 'selected' : '', isClosed ? 'closed-day' : '', stateCls, slotMeta.highlighted ? 'booth-cell-highlighted' : '']
                .filter(Boolean)
                .join(' ');
              const disabled = isClosed ? 'disabled' : '';
              const seat2Disabled = oneToOne || isClosed ? 'disabled' : '';
              const gradeList = gradeDatalistId();
              return `<td class="${cellCls}" data-action="select-slot" data-date="${key}" data-booth="${booth}" data-period="${period}">
                <input class="booth-teacher-cell" data-teacher data-date="${key}" data-booth="${booth}" data-period="${period}"
                  placeholder="講師" value="${slotMeta.teacherName.replace(/"/g, '&quot;')}" ${disabled} />
                <div class="${seatClass(1, oneToOne, seat1.attendance)}">
                  <input data-date="${key}" data-booth="${booth}" data-period="${period}" data-seat="1"
                    placeholder="生徒" value="${seat1.studentName.replace(/"/g, '&quot;')}" list="${renderStudentDatalistId()}" ${disabled} />
                  <input data-date="${key}" data-booth="${booth}" data-period="${period}" data-seat="1-subject"
                    placeholder="教科" value="${seat1.subject.replace(/"/g, '&quot;')}" class="subject-input" ${disabled} />
                  <input data-date="${key}" data-booth="${booth}" data-period="${period}" data-seat="1-grade"
                    placeholder="学年" value="${(seat1.grade ?? '').replace(/"/g, '&quot;')}" class="booth-grade-input" list="${gradeList}" ${disabled} />
                </div>
                <div class="${seatClass(2, oneToOne, seat2.attendance)}">
                  <input data-date="${key}" data-booth="${booth}" data-period="${period}" data-seat="2"
                    placeholder="生徒(2)" value="${seat2.studentName.replace(/"/g, '&quot;')}" list="${renderStudentDatalistId()}" ${seat2Disabled} />
                  <input data-date="${key}" data-booth="${booth}" data-period="${period}" data-seat="2-subject"
                    placeholder="教科" value="${seat2.subject.replace(/"/g, '&quot;')}" class="subject-input" ${seat2Disabled} />
                  <input data-date="${key}" data-booth="${booth}" data-period="${period}" data-seat="2-grade"
                    placeholder="学年" value="${(seat2.grade ?? '').replace(/"/g, '&quot;')}" class="booth-grade-input" list="${gradeList}" ${seat2Disabled} />
                </div>
              </td>`;
            })
            .join('');
          return `<tr><th class="booth-label">B${booth}</th>${cells}</tr>`;
        }).join('');
        const closedLabel = isClosed
          ? ` <span class="closed-day-label">${closedDates.find((c) => c.date === key)?.title ?? '休校日'}</span>`
          : '';
        return `<div class="${dayCls}">
          <div class="booth-day-header">
            <h3>${key} (${weekday})${closedLabel}</h3>
            ${bulkBtn}
          </div>
          <table class="booth-grid-table"><thead><tr><th>ブース</th>${periodHeaders}</tr></thead><tbody>${boothBlocks}</tbody></table>
        </div>`;
      })
      .join('');
  };

  const renderAll = () => {
    renderSettings();
    renderToolbar();
    renderGrid();
    renderSlotDetail();
    updatePreview();
    void refreshWeekGapReport();
  };

  const importManaerpWeek = async () => {
    if (!session.settings.accountId.trim()) {
      showAlert('Manabie 週参照: コマ組設定の Account / 拠点を選択してください。');
      return;
    }
    const dates = visibleWeekDates(navState, session.settings.hideSunday).map(formatDateKey);
    if (!dates.length) return;
    try {
      const sessions = options.onImportManaerpWeek
        ? await options.onImportManaerpWeek(dates[0]!, dates[dates.length - 1]!)
        : [];
      if (!sessions.length) {
        showToast('Manabie データがありません。PrintSheet の Sync Dock で「Manabie データ更新」を実行してください。', 'error');
        return;
      }
      let overwriteCount = 0;
      let skipSameCount = 0;
      for (const item of sessions) {
        if (!item.attendance) continue;
        for (const cell of session.cells) {
          if (cell.date !== item.date || cell.studentName.trim() !== item.studentName) continue;
          if (cell.attendance === item.attendance) skipSameCount += 1;
          else overwriteCount += 1;
        }
      }
      const proceed = await confirmAction({
        title: 'Manabie 週参照',
        messageHtml:
          `<p>${sessions.length} 件の Student Session を取得しました。</p>` +
          `<ul><li>出欠上書き: ${overwriteCount} 件</li><li>変更なし（スキップ）: ${skipSameCount} 件</li></ul>`,
        confirmLabel: '続行',
      });
      if (!proceed) return;

      let updated = 0;
      for (const item of sessions) {
        if (!item.attendance) continue;
        for (const cell of session.cells) {
          if (cell.date !== item.date || cell.studentName.trim() !== item.studentName) continue;
          if (cell.attendance === item.attendance) continue;
          cell.attendance = item.attendance;
          upsertCell(session, cell);
          updated += 1;
        }
      }
      if (updated) await saveNow();
      showToast(
        `Manabie から ${sessions.length} 件取得。出欠を ${updated} セル更新しました。`,
        'success',
      );
      renderGrid();
      renderSlotDetail();
      updatePreview();
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), 'error');
    }
  };

  const bindEvents = () => {
    if (bound) return;
    bound = true;

    shell.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      if (action === 'goto-print-tab') {
        document.querySelector<HTMLElement>('[data-tab="print"]')?.click();
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
        showToast('移動先のコマをクリックしてください', 'success');
        renderToolbar();
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
      if (action === 'booth-import-manaerp') {
        void importManaerpWeek();
        return;
      }
      if (action === 'booth-day-prev') {
        virtualDayOffset = Math.max(0, virtualDayOffset - BOOTH_DAYS_PER_VIEW);
        renderToolbar();
        renderGrid();
        return;
      }
      if (action === 'booth-day-next') {
        virtualDayOffset = Math.min(
          Math.max(0, allWeekDates().length - BOOTH_DAYS_PER_VIEW),
          virtualDayOffset + BOOTH_DAYS_PER_VIEW,
        );
        renderToolbar();
        renderGrid();
        return;
      }
      if (action === 'booth-prev') {
        navState = navigatePrev(navState);
        virtualDayOffset = 0;
      } else if (action === 'booth-next') {
        navState = navigateNext(navState);
        virtualDayOffset = 0;
      } else if (action === 'booth-today') {
        navState = jumpToToday(navState);
        virtualDayOffset = 0;
      } else if (action === 'select-slot') {
        const next: BoothSlotRef = {
          date: target.dataset.date!,
          booth: Number(target.dataset.booth),
          period: Number(target.dataset.period),
        };
        if (moveSource) {
          const moved = moveSlot(session, moveSource, next, closedDates);
          moveSource = null;
          if (!moved.ok) showToast(moved.error ?? '移動失敗', 'error');
          else {
            void saveNow();
            showToast('コマを移動しました', 'success');
          }
          selected = next;
          renderAll();
          return;
        }
        selected = next;
        const s1 = getCell(session, selected.date, selected.booth, selected.period, 1);
        const s2 = getCell(session, selected.date, selected.booth, selected.period, 2);
        selectedSeat = s1.studentName.trim() ? 1 : s2.studentName.trim() ? 2 : 1;
        renderGrid();
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
      const target = event.target as HTMLInputElement;
      if (target.id === 'booth-classroom') session.settings.classroomName = target.value;
      else if (target.id === 'booth-fiscal-year') session.settings.fiscalYear = target.value;
      else if (target.id === 'booth-account') {
        session.settings.accountId = target.value;
        void saveBoothSession(options.hostname, session);
        options.onAccountChange?.();
        renderAll();
        return;
      }
      else if (target.id === 'booth-count') session.settings.boothCount = Math.max(1, Number(target.value) || 1);
      else if (target.id === 'booth-periods') {
        session.settings.periodCount = Math.max(1, Number(target.value) || 1);
        session.settings = normalizeSettingsAfterPeriodCountChange(session.settings);
      } else if (target.id === 'booth-hide-sunday') session.settings.hideSunday = target.checked;
      else if (target.id === 'booth-one-to-one') session.settings.oneToOneMode = target.checked;
      else if (target.dataset.periodTime) {
        const period = String(target.dataset.periodTime);
        if (!session.settings.periodStartTimes) session.settings.periodStartTimes = {};
        const value = target.value.trim();
        if (value) session.settings.periodStartTimes[period] = value;
        else delete session.settings.periodStartTimes[period];
      } else if (target.dataset.periodFilter) {
        const period = Number(target.dataset.periodFilter);
        const set = new Set(session.settings.visiblePeriods);
        if (target.checked) set.add(period);
        else set.delete(period);
        session.settings.visiblePeriods = [...set].sort((a, b) => a - b);
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
      if (target.dataset.teacher !== undefined && date && booth && period) {
        if (closedDateSet(closedDates).has(date)) return;
        upsertSlotMeta(session, { date, booth, period, teacherName: target.value });
        void persist();
        renderSlotDetail();
        updatePreview();
        return;
      }
      const seatRaw = target.dataset.seat;
      if (!date || !booth || !period || !seatRaw) return;
      if (closedDateSet(closedDates).has(date)) return;
      const seat = seatRaw.startsWith('2') ? 2 : 1;
      if (session.settings.oneToOneMode && seat === 2) return;
      const cell = getCell(session, date, booth, period, seat as 1 | 2);
      if (seatRaw.endsWith('-subject')) cell.subject = target.value;
      else if (seatRaw.endsWith('-grade')) cell.grade = target.value;
      else {
        cell.studentName = target.value;
        if (cell.studentName.trim() && !cell.attendance) {
          cell.attendance = '未確定';
          cell.countTarget = true;
        }
        const autoGrade = gradeForStudentName(catalog, cell.studentName);
        if (autoGrade && !cell.grade?.trim()) cell.grade = autoGrade;
      }
      upsertCell(session, cell);
      void persist();
      debouncedRenderGrid();
    });

    shell.addEventListener('keydown', (event) => {
      if (!selected || !(event.target instanceof HTMLInputElement)) return;
      const dates = visibleGridDates().map(formatDateKey);
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
        renderGrid();
        renderSlotDetail();
      }
    });
  };

  bindEvents();
  renderAll();

  return async (partial) => {
    if (partial?.closedDates) closedDates = partial.closedDates;
    if (partial?.catalog !== undefined) catalog = partial.catalog;
    if (partial?.reloadSession) session = await loadBoothSession(options.hostname);
    if (partial?.refreshGapBanner) {
      renderToolbar();
      return;
    }
    renderAll();
  };
}
