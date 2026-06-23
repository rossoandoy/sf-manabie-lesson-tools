import { describe, expect, it } from 'vitest';
import {
  closeMiniCalendar,
  createInitialCalendarState,
  jumpToToday,
  navigateNext,
  navigatePrev,
  selectDate,
  setView,
  toggleMiniCalendar,
  visibleDates,
} from './calendar-state';
import { formatDateKey } from '../calendar-utils';

describe('calendar-state', () => {
  it('creates initial state with month view and today selected', () => {
    const state = createInitialCalendarState();
    expect(state.view).toBe('month');
    expect(state.selectedDate).toBe(formatDateKey(new Date()));
    expect(state.miniCalendarOpen).toBe(false);
  });

  it('navigates month anchor on prev/next', () => {
    const state = createInitialCalendarState();
    const prev = navigatePrev(state);
    expect(prev.anchor.getMonth()).not.toBe(state.anchor.getMonth());
    const next = navigateNext(prev);
    expect(next.anchor.getMonth()).toBe(state.anchor.getMonth());
    expect(next.anchor.getFullYear()).toBe(state.anchor.getFullYear());
  });

  it('jumpToToday resets anchor and selectedDate', () => {
    const moved = navigatePrev(createInitialCalendarState());
    const today = jumpToToday(moved);
    expect(today.selectedDate).toBe(formatDateKey(new Date()));
  });

  it('visibleDates returns 42 cells for month view', () => {
    const state = setView(createInitialCalendarState(), 'month');
    expect(visibleDates(state)).toHaveLength(42);
  });

  it('visibleDates returns 7 cells for week view', () => {
    const state = setView(createInitialCalendarState(), 'week');
    expect(visibleDates(state)).toHaveLength(7);
  });

  it('selectDate updates anchor and selectedDate', () => {
    const next = selectDate(createInitialCalendarState(), '2026-06-15');
    expect(next.selectedDate).toBe('2026-06-15');
    expect(next.anchor.getDate()).toBe(15);
  });

  it('toggleMiniCalendar flips open flag', () => {
    const open = toggleMiniCalendar(createInitialCalendarState());
    expect(open.miniCalendarOpen).toBe(true);
    const closed = closeMiniCalendar(open);
    expect(closed.miniCalendarOpen).toBe(false);
  });
});
