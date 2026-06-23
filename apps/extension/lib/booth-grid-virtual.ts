import type { BoothGridSettings } from './booth-session-state';
import { visiblePeriodNumbers } from './booth-session-state';

export const BOOTH_VIRTUAL_THRESHOLD = 400;
export const BOOTH_VIRTUAL_WINDOW_DAYS = 2;

export interface BoothVirtualState {
  enabled: boolean;
  dayOffset: number;
  visibleDates: string[];
  totalDays: number;
  maxOffset: number;
}

export function countBoothGridCells(settings: BoothGridSettings, weekDayCount: number): number {
  return settings.boothCount * visiblePeriodNumbers(settings).length * weekDayCount * 2;
}

export function computeBoothVirtualState(
  settings: BoothGridSettings,
  weekDateKeys: string[],
  dayOffset: number,
): BoothVirtualState {
  const totalDays = weekDateKeys.length;
  const cellCount = countBoothGridCells(settings, totalDays);
  const enabled = cellCount > BOOTH_VIRTUAL_THRESHOLD && totalDays > 7;

  if (!enabled || totalDays === 0) {
    return {
      enabled: false,
      dayOffset: 0,
      visibleDates: weekDateKeys,
      totalDays,
      maxOffset: 0,
    };
  }

  const maxOffset = Math.max(0, totalDays - BOOTH_VIRTUAL_WINDOW_DAYS);
  const clampedOffset = Math.min(Math.max(0, dayOffset), maxOffset);
  const visibleDates = weekDateKeys.slice(clampedOffset, clampedOffset + BOOTH_VIRTUAL_WINDOW_DAYS);

  return {
    enabled: true,
    dayOffset: clampedOffset,
    visibleDates,
    totalDays,
    maxOffset,
  };
}

export function resetDayOffsetForWeek(): number {
  return 0;
}

export function navigateDayOffset(current: number, delta: number, maxOffset: number): number {
  return Math.min(Math.max(0, current + delta), maxOffset);
}

export function formatVirtualDayRange(visibleDates: string[]): string {
  if (!visibleDates.length) return '—';
  if (visibleDates.length === 1) return visibleDates[0]!;
  return `${visibleDates[0]} 〜 ${visibleDates[visibleDates.length - 1]}`;
}
