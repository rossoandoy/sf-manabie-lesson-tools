import { describe, expect, it } from 'vitest';
import {
  BOOTH_VIRTUAL_THRESHOLD,
  BOOTH_VIRTUAL_WINDOW_DAYS,
  computeBoothVirtualState,
  countBoothGridCells,
  navigateDayOffset,
  resetDayOffsetForWeek,
} from './booth-grid-virtual';
import { DEFAULT_BOOTH_SETTINGS } from './booth-session-state';

const weekKeys = ['2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21'];

describe('booth-grid-virtual', () => {
  it('counts cells as booth × periods × days × 2 seats', () => {
    const settings = { ...DEFAULT_BOOTH_SETTINGS, boothCount: 4, periodCount: 6, visiblePeriods: [1, 2, 3, 4, 5, 6] };
    expect(countBoothGridCells(settings, 6)).toBe(4 * 6 * 6 * 2);
  });

  it('disables virtual scroll below threshold', () => {
    const settings = { ...DEFAULT_BOOTH_SETTINGS, boothCount: 4, periodCount: 6 };
    const state = computeBoothVirtualState(settings, weekKeys, 0);
    expect(state.enabled).toBe(false);
    expect(state.visibleDates).toEqual(weekKeys);
    expect(countBoothGridCells(settings, weekKeys.length)).toBeLessThanOrEqual(BOOTH_VIRTUAL_THRESHOLD);
  });

  it('enables 2-day window above threshold for multi-week ranges', () => {
    const multiWeekKeys = [
      '2026-06-16', '2026-06-17', '2026-06-18', '2026-06-19', '2026-06-20', '2026-06-21',
      '2026-06-22', '2026-06-23', '2026-06-24', '2026-06-25', '2026-06-26', '2026-06-27',
    ];
    const settings = {
      ...DEFAULT_BOOTH_SETTINGS,
      boothCount: 8,
      periodCount: 8,
      visiblePeriods: [1, 2, 3, 4, 5, 6, 7, 8],
    };
    expect(countBoothGridCells(settings, multiWeekKeys.length)).toBeGreaterThan(BOOTH_VIRTUAL_THRESHOLD);
    const state = computeBoothVirtualState(settings, multiWeekKeys, 0);
    expect(state.enabled).toBe(true);
    expect(state.visibleDates).toHaveLength(BOOTH_VIRTUAL_WINDOW_DAYS);
    expect(state.visibleDates[0]).toBe('2026-06-16');
    expect(state.maxOffset).toBe(multiWeekKeys.length - BOOTH_VIRTUAL_WINDOW_DAYS);
  });

  it('keeps full week visible when period count exceeds threshold', () => {
    const settings = {
      ...DEFAULT_BOOTH_SETTINGS,
      boothCount: 8,
      periodCount: 8,
      visiblePeriods: [1, 2, 3, 4, 5, 6, 7, 8],
    };
    expect(countBoothGridCells(settings, weekKeys.length)).toBeGreaterThan(BOOTH_VIRTUAL_THRESHOLD);
    const state = computeBoothVirtualState(settings, weekKeys, 0);
    expect(state.enabled).toBe(false);
    expect(state.visibleDates).toEqual(weekKeys);
  });

  it('clamps day offset at max', () => {
    const settings = {
      ...DEFAULT_BOOTH_SETTINGS,
      boothCount: 8,
      periodCount: 8,
      visiblePeriods: [1, 2, 3, 4, 5, 6, 7, 8],
    };
    const state = computeBoothVirtualState(settings, weekKeys, 99);
    expect(state.dayOffset).toBe(state.maxOffset);
    expect(state.visibleDates.at(-1)).toBe('2026-06-21');
  });

  it('navigateDayOffset respects bounds', () => {
    expect(navigateDayOffset(2, 1, 4)).toBe(3);
    expect(navigateDayOffset(0, -1, 4)).toBe(0);
    expect(navigateDayOffset(4, 1, 4)).toBe(4);
    expect(resetDayOffsetForWeek()).toBe(0);
  });
});
