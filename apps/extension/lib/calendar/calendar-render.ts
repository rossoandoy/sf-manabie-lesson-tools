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

function renderGrid(options: CalendarRenderOptions): string {
  if (options.state.view === 'day') return renderDayTimeline(options);
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
  const viewBtns = (['month', 'week', 'day'] as const)
    .map((v) => {
      const labels = { month: '月', week: '週', day: '日' };
      return `<button type="button" class="btn ${state.view === v ? 'active-view' : ''}" data-action="view-${v}">${labels[v]}</button>`;
    })
    .join('');

  const extra =
    mode === 'lesson'
      ? `<button type="button" class="btn primary" data-action="add-lesson">+ 授業追加</button>
         <button type="button" class="btn" data-action="export-csv">CSV（監査）</button>
         <button type="button" class="btn danger" data-action="clear-all">すべてクリア</button>`
      : `<button type="button" class="btn" data-action="export-csv">CSV（監査）</button>
         <button type="button" class="btn danger" data-action="clear-all">すべてクリア</button>`;

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
  </div>`;
}

export function renderCalendarBody(options: CalendarRenderOptions): string {
  return renderGrid(options);
}
