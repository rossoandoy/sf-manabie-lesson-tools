import type { ClosedDateDefinition, LessonScheduleDefinition } from '../../src/contracts';
import { formatDateKey, monthMatrix, parseDateKey, weekRow } from '../calendar-utils';
import type { CalendarUIState } from './calendar-state';
import { WEEKDAY_LABELS, visibleDates } from './calendar-state';
import { lessonsForDate } from './lesson-sort';

export interface CalendarRenderOptions {
  state: CalendarUIState;
  lessons: LessonScheduleDefinition[];
  closedDates: ClosedDateDefinition[];
  mode: 'lesson' | 'closed';
  showLessonChips?: boolean;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function closedForDate(closedDates: ClosedDateDefinition[], dateKey: string): ClosedDateDefinition[] {
  return closedDates.filter((item) => item.date === dateKey);
}

function renderLessonChip(lesson: LessonScheduleDefinition, detailed = false): string {
  const label = detailed
    ? `${escapeHtml(lesson.lessonName)}<br><span class="chip-meta">${escapeHtml(lesson.teacherName)} / ${escapeHtml(lesson.locationCourseName || lesson.locationName)}</span>`
    : `${escapeHtml(lesson.lessonName)} (${lesson.startTime}-${lesson.endTime})`;
  return `<div class="lesson-chip" draggable="true" data-lesson-id="${lesson.id}">
    <span class="chip-body" data-action="edit-lesson" data-lesson-id="${lesson.id}">${label}</span>
    <button type="button" class="chip-copy" data-action="copy-lesson" data-lesson-id="${lesson.id}" title="コピー">⎘</button>
    <button type="button" class="chip-delete" data-action="delete-lesson" data-lesson-id="${lesson.id}" title="削除">×</button>
  </div>`;
}

function renderClosedChip(item: ClosedDateDefinition, editable: boolean): string {
  const deleteBtn = editable
    ? `<button type="button" class="chip-delete" data-action="delete-closed" data-closed-id="${item.id}">×</button>`
    : '';
  const body = editable
    ? `<span class="chip-body" data-action="edit-closed" data-closed-id="${item.id}">${escapeHtml(item.title)}</span>`
    : escapeHtml(item.title);
  return `<div class="closed-chip" data-closed-id="${item.id}">${body}${deleteBtn}</div>`;
}

function renderCell(date: Date, anchor: Date, options: CalendarRenderOptions): string {
  const key = formatDateKey(date);
  const todayKey = formatDateKey(new Date());
  const closed = closedForDate(options.closedDates, key);
  const lessons = options.showLessonChips !== false ? lessonsForDate(options.lessons, key) : [];
  const otherMonth = options.state.view === 'month' && date.getMonth() !== anchor.getMonth() ? 'other-month' : '';
  const today = key === todayKey ? 'today' : '';
  const selected = key === options.state.selectedDate ? 'selected' : '';
  const closedDay = closed.length ? 'closed-day' : '';

  const chips =
    options.mode === 'closed'
      ? closed.map((c) => renderClosedChip(c, true)).join('')
      : [
          ...closed.map((c) => renderClosedChip(c, false)),
          ...lessons.map((l) => renderLessonChip(l, options.state.view === 'day')),
        ].join('');

  return `<div class="calendar-cell ${otherMonth} ${today} ${selected} ${closedDay}" data-date="${key}">
    <div class="cell-date">${date.getMonth() + 1}/${date.getDate()}</div>
    <div class="cell-chips">${chips}</div>
  </div>`;
}

function renderWeekdayHeader(): string {
  return `<div class="calendar-weekday-row">${WEEKDAY_LABELS.map((d) => `<div class="weekday-label">${d}</div>`).join('')}</div>`;
}

function renderDayTimeline(options: CalendarRenderOptions): string {
  const key = options.state.selectedDate;
  const lessons = lessonsForDate(options.lessons, key);
  const closed = closedForDate(options.closedDates, key);
  const closedHtml = closed.map((c) => `<div class="closed-banner">${escapeHtml(c.title)}</div>`).join('');
  const blocks = lessons
    .map(
      (lesson) => `<div class="time-block">
        <div class="time-block-head">${lesson.startTime} - ${lesson.endTime}</div>
        ${renderLessonChip(lesson, true)}
      </div>`,
    )
    .join('');
  const strip = weekRow(parseDateKey(key))
    .map((d) => {
      const dk = formatDateKey(d);
      return `<button type="button" class="day-strip-btn ${dk === key ? 'active' : ''}" data-action="select-date" data-date="${dk}">${d.getDate()}</button>`;
    })
    .join('');
  return `<div class="day-view-layout">
    <div class="day-view-strip">${strip}</div>
    <div class="day-view-timeline">${closedHtml}${blocks || '<p class="muted">授業がありません。</p>'}</div>
  </div>`;
}

function lessonsForPeriod(
  lessons: LessonScheduleDefinition[],
  dateKey: string,
  period: number,
): LessonScheduleDefinition[] {
  const dayLessons = lessonsForDate(lessons, dateKey);
  const times = [...new Set(dayLessons.map((l) => l.startTime))].sort();
  const slotTime = times[period - 1];
  if (!slotTime) return [];
  return dayLessons.filter((l) => l.startTime === slotTime);
}

function periodTimeLabel(
  lessons: LessonScheduleDefinition[],
  dateKeys: string[],
  period: number,
): string {
  const times = new Set<string>();
  for (const key of dateKeys) {
    for (const lesson of lessonsForPeriod(lessons, key, period)) {
      times.add(lesson.startTime);
    }
  }
  const sorted = [...times].sort();
  if (sorted.length === 1) return sorted[0]!;
  if (sorted.length > 1) return sorted[0]!;
  return '';
}

function renderWeekPeriodGrid(options: CalendarRenderOptions): string {
  const dates = visibleDates(options.state);
  const dateKeys = dates.map(formatDateKey);
  const todayKey = formatDateKey(new Date());
  const weekdayShort = ['日', '月', '火', '水', '木', '金', '土'];
  const headerCells = dates
    .map((date) => {
      const key = formatDateKey(date);
      const cls = [
        key === options.state.selectedDate ? 'selected-col' : '',
        key === todayKey ? 'today-col' : '',
      ]
        .filter(Boolean)
        .join(' ');
      return `<th class="week-col-head ${cls}"><button type="button" class="week-col-btn" data-action="select-date" data-date="${key}">${weekdayShort[date.getDay()]}<br>${date.getMonth() + 1}/${date.getDate()}</button></th>`;
    })
    .join('');

  const periodCount = 6;
  const bodyRows = Array.from({ length: periodCount }, (_, idx) => {
    const period = idx + 1;
    const timeHint = periodTimeLabel(options.lessons, dateKeys, period);
    const periodHead = timeHint
      ? `${period}限<br><span class="muted period-time-hint">${escapeHtml(timeHint)}</span>`
      : `${period}限`;
    const cells = dates
      .map((date) => {
        const key = formatDateKey(date);
        const closed = closedForDate(options.closedDates, key);
        const selected = key === options.state.selectedDate ? 'selected' : '';
        const today = key === todayKey ? 'today' : '';
        const closedCls = closed.length ? 'closed-day' : '';

        if (options.mode === 'closed') {
          const content = closed.length
            ? closed.map((c) => renderClosedChip(c, true)).join('')
            : '<span class="week-cell-hint muted">＋</span>';
          return `<td class="week-period-cell ${closedCls} ${selected} ${today}" data-date="${key}" data-period="${period}">${content}</td>`;
        }

        const chips = [
          ...closed.map((c) => renderClosedChip(c, false)),
          ...lessonsForPeriod(options.lessons, key, period).map((l) => renderLessonChip(l, true)),
        ].join('');
        return `<td class="week-period-cell ${closedCls} ${selected} ${today}" data-date="${key}" data-period="${period}">${chips || '<span class="week-cell-hint muted">＋</span>'}</td>`;
      })
      .join('');
    return `<tr><th class="period-row-head">${periodHead}</th>${cells}</tr>`;
  }).join('');

  const hint =
    options.mode === 'closed'
      ? '時限セルをクリックして休校日を登録・編集します。'
      : '時限セルをクリックして授業を追加・編集します。列ヘッダーで日付を選択します。';

  return `<div class="week-period-grid-wrap">
    <table class="week-period-grid">
      <thead><tr><th class="period-corner"></th>${headerCells}</tr></thead>
      <tbody>${bodyRows}</tbody>
    </table>
    <p class="muted calendar-week-hint">${hint}</p>
  </div>`;
}

function renderGrid(options: CalendarRenderOptions): string {
  if (options.state.view === 'day') return renderDayTimeline(options);
  if (options.state.view === 'week') return renderWeekPeriodGrid(options);
  const dates = visibleDates(options.state);
  const cells = dates.map((date) => renderCell(date, options.state.anchor, options)).join('');
  return `${renderWeekdayHeader()}<div class="calendar-grid">${cells}</div>`;
}

function periodLabel(state: CalendarUIState): string {
  if (state.view === 'day') {
    const d = parseDateKey(state.selectedDate);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${state.anchor.getFullYear()}年${state.anchor.getMonth() + 1}月`;
}

export function renderMiniCalendar(state: CalendarUIState): string {
  const matrix = monthMatrix(state.anchor);
  const rows = matrix
    .map((week) =>
      week
        .map((date) => {
          const key = formatDateKey(date);
          const cls = [
            'mini-day',
            date.getMonth() !== state.anchor.getMonth() ? 'other-month' : '',
            key === state.selectedDate ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ');
          return `<button type="button" class="${cls}" data-action="select-date" data-date="${key}">${date.getDate()}</button>`;
        })
        .join(''),
    )
    .join('');
  return `<div class="mini-cal-header">${state.anchor.getFullYear()}年${state.anchor.getMonth() + 1}月</div><div class="mini-cal-grid">${rows}</div>`;
}

export function renderToolbar(state: CalendarUIState, mode: 'lesson' | 'closed'): string {
  const viewBtns =
    mode === 'closed'
      ? `<button type="button" class="btn active-view" data-action="view-month">月</button>`
      : (['month', 'week', 'day'] as const)
          .map((v) => {
            const labels = { month: '月', week: '週', day: '日' };
            return `<button type="button" class="btn ${state.view === v ? 'active-view' : ''}" data-action="view-${v}">${labels[v]}</button>`;
          })
          .join('');

  const extra =
    mode === 'lesson'
      ? `<button type="button" class="btn primary" data-action="add-lesson">+ 授業追加</button>
         <button type="button" class="btn" data-action="open-side-drawer">授業タイムスロット</button>
         <button type="button" class="btn" data-action="export-csv">エクスポート（任意）</button>
         <button type="button" class="btn danger" data-action="clear-all">すべてクリア</button>`
      : `<button type="button" class="btn" data-action="export-csv">エクスポート（任意）</button>
         <button type="button" class="btn danger" data-action="clear-all">すべてクリア</button>`;

  const legend =
    mode === 'closed'
      ? `<div class="calendar-legend">
          <span class="calendar-legend-item calendar-legend-selected">選択中</span>
          <span class="calendar-legend-item calendar-legend-today">今日</span>
          <span class="calendar-legend-item calendar-legend-closed">休校日登録済</span>
        </div>`
      : '';

  return `<div class="grid-toolbar">
    <button type="button" class="btn" data-action="prev">◀</button>
    <strong class="period-label">${periodLabel(state)}</strong>
    <button type="button" class="btn" data-action="next">▶</button>
    <button type="button" class="btn" data-action="today">Today</button>
    <div class="mini-cal-wrap">
      <button type="button" class="btn" data-action="toggle-mini">📅</button>
      <div class="mini-calendar ${state.miniCalendarOpen ? 'open' : ''}" data-mini-calendar>
        ${state.miniCalendarOpen ? renderMiniCalendar(state) : ''}
      </div>
    </div>
    ${viewBtns}
    ${extra}
  </div>${legend}`;
}

export function renderCalendarBody(options: CalendarRenderOptions): string {
  return renderGrid(options);
}
