import type { StudentSessionUpdatePlan } from '../src/contracts';
import type { NormalizedLessonSession } from '../src/services/manaerpLessonQueryService';
import {
  computeScheduleGapReport,
  type ScheduleGapReport,
} from '../src/services/lessonScheduleGapService';
import type { LessonDayIndex } from '../src/services/manaerpLessonQueryService';

export interface ManabieQueryCacheEntry {
  cacheKey: string;
  sessions: NormalizedLessonSession[];
  lessonDayIndex: LessonDayIndex;
  lessonDates: string[];
  scheduleCountInRange: number;
  lessonCountInRange: number;
  scheduleGapReport: ScheduleGapReport | null;
}

export function buildManabieCacheKey(accountId: string, dateFrom: string, dateTo: string): string {
  return `${accountId}|${dateFrom}|${dateTo}`;
}

export function cacheRangeCovers(
  entry: ManabieQueryCacheEntry | null | undefined,
  dateFrom: string,
  dateTo: string,
): boolean {
  const gap = entry?.scheduleGapReport;
  if (!gap) return false;
  return dateFrom >= gap.dateFrom && dateTo <= gap.dateTo;
}

/** Prefer the wider date span; never replace fiscal cache with a narrower week fetch. */
export function mergeManabieCacheEntries(
  current: ManabieQueryCacheEntry | null,
  incoming: ManabieQueryCacheEntry,
): ManabieQueryCacheEntry {
  if (!current?.scheduleGapReport) return incoming;
  const cur = current.scheduleGapReport;
  const inc = incoming.scheduleGapReport;
  if (!inc) return current;
  const curSpan = cur.dateTo.localeCompare(cur.dateFrom);
  const incSpan = inc.dateTo.localeCompare(inc.dateFrom);
  if (inc.dateFrom <= cur.dateFrom && inc.dateTo >= cur.dateTo) return incoming;
  if (cur.dateFrom <= inc.dateFrom && cur.dateTo >= inc.dateTo) return current;
  return incSpan > curSpan ? incoming : current;
}

export function sessionsInDateRange(
  sessions: NormalizedLessonSession[],
  dateFrom: string,
  dateTo: string,
): NormalizedLessonSession[] {
  return sessions.filter((session) => session.date >= dateFrom && session.date <= dateTo);
}

export function recomputeScheduleGapFromCache(
  entry: ManabieQueryCacheEntry,
  options: {
    dateFrom: string;
    dateTo: string;
    daysWithBoothStudents: string[];
    studentSessionPlan?: StudentSessionUpdatePlan | null;
  },
): ScheduleGapReport {
  return computeScheduleGapReport({
    dateFrom: options.dateFrom,
    dateTo: options.dateTo,
    daysWithBoothStudents: options.daysWithBoothStudents,
    lessonDates: entry.lessonDates,
    scheduleCountInRange: entry.scheduleCountInRange,
    lessonCountInRange: entry.lessonCountInRange,
    studentSessionPlan: options.studentSessionPlan,
  });
}

export function weekGapFromFiscalCache(
  fiscalEntry: ManabieQueryCacheEntry,
  week: { dateFrom: string; dateTo: string; daysWithBoothStudents: string[] },
  studentSessionPlan?: StudentSessionUpdatePlan | null,
): ScheduleGapReport {
  return recomputeScheduleGapFromCache(fiscalEntry, {
    ...week,
    studentSessionPlan,
  });
}
