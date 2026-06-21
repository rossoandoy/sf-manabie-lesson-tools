import { describe, expect, it } from 'vitest';
import {
  buildManabieCacheKey,
  cacheRangeCovers,
  mergeManabieCacheEntries,
  recomputeScheduleGapFromCache,
  type ManabieQueryCacheEntry,
} from './manabie-query-cache';

describe('manabie-query-cache', () => {
  it('builds stable cache keys', () => {
    expect(buildManabieCacheKey('001', '2026-04-01', '2026-04-30')).toBe('001|2026-04-01|2026-04-30');
  });

  it('recomputes gap report from cached lesson dates without extra SOQL fields', () => {
    const entry: ManabieQueryCacheEntry = {
      cacheKey: '001|2026-04-01|2026-04-30',
      sessions: [],
      lessonDayIndex: new Map(),
      lessonDates: ['2026-04-10'],
      scheduleCountInRange: 1,
      lessonCountInRange: 1,
      scheduleGapReport: null,
    };
    const report = recomputeScheduleGapFromCache(entry, {
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      daysWithBoothStudents: ['2026-04-10', '2026-04-11'],
      studentSessionPlan: null,
    });
    expect(report.daysMissingLessons).toEqual(['2026-04-11']);
  });

  it('mergeManabieCacheEntries keeps wider fiscal range', () => {
    const wide: ManabieQueryCacheEntry = {
      cacheKey: '001|2026-04-01|2026-06-30',
      sessions: [],
      lessonDayIndex: new Map(),
      lessonDates: [],
      scheduleCountInRange: 1,
      lessonCountInRange: 1,
      scheduleGapReport: {
        dateFrom: '2026-04-01',
        dateTo: '2026-06-30',
        daysMissingLessons: [],
        daysWithBoothStudents: [],
      },
    };
    const narrow: ManabieQueryCacheEntry = {
      ...wide,
      cacheKey: '001|2026-04-01|2026-04-07',
      scheduleGapReport: {
        dateFrom: '2026-04-01',
        dateTo: '2026-04-07',
        daysMissingLessons: [],
        daysWithBoothStudents: [],
      },
    };
    expect(mergeManabieCacheEntries(wide, narrow)).toBe(wide);
    expect(cacheRangeCovers(wide, '2026-04-01', '2026-04-07')).toBe(true);
  });
});
