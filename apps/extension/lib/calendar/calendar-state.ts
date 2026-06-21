import { addDays, addMonths, formatDateKey, monthMatrix, parseDateKey, weekRow } from '../calendar-utils';

export type CalendarViewMode = 'month' | 'week' | 'day';

export interface CalendarUIState {
  anchor: Date;
  view: CalendarViewMode;
  selectedDate: string;
  miniCalendarOpen: boolean;
}

export function createInitialCalendarState(): CalendarUIState {
  const today = new Date();
  return {
    anchor: today,
    view: 'month',
    selectedDate: formatDateKey(today),
    miniCalendarOpen: false,
  };
}

export function navigatePrev(state: CalendarUIState): CalendarUIState {
  const anchor =
    state.view === 'month'
      ? addMonths(state.anchor, -1)
      : state.view === 'week'
        ? addDays(state.anchor, -7)
        : addDays(parseDateKey(state.selectedDate), -1);
  return { ...state, anchor, selectedDate: formatDateKey(anchor) };
}

export function navigateNext(state: CalendarUIState): CalendarUIState {
  const anchor =
    state.view === 'month'
      ? addMonths(state.anchor, 1)
      : state.view === 'week'
        ? addDays(state.anchor, 7)
        : addDays(parseDateKey(state.selectedDate), 1);
  return { ...state, anchor, selectedDate: formatDateKey(anchor) };
}

export function jumpToToday(state: CalendarUIState): CalendarUIState {
  const today = new Date();
  return {
    ...state,
    anchor: today,
    selectedDate: formatDateKey(today),
  };
}

export function setView(state: CalendarUIState, view: CalendarViewMode): CalendarUIState {
  return { ...state, view };
}

export function selectDate(state: CalendarUIState, dateKey: string): CalendarUIState {
  return {
    ...state,
    selectedDate: dateKey,
    anchor: parseDateKey(dateKey),
  };
}

export function toggleMiniCalendar(state: CalendarUIState): CalendarUIState {
  return { ...state, miniCalendarOpen: !state.miniCalendarOpen };
}

export function closeMiniCalendar(state: CalendarUIState): CalendarUIState {
  return { ...state, miniCalendarOpen: false };
}

export function visibleDates(state: CalendarUIState): Date[] {
  if (state.view === 'month') return monthMatrix(state.anchor).flat();
  if (state.view === 'week') return weekRow(state.anchor);
  return [parseDateKey(state.selectedDate)];
}

export function periodLabel(state: CalendarUIState): string {
  if (state.view === 'day') {
    const d = parseDateKey(state.selectedDate);
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return `${state.anchor.getFullYear()}年${state.anchor.getMonth() + 1}月`;
}

export const WEEKDAY_LABELS = ['月', '火', '水', '木', '金', '土', '日'];
