import type { AttendanceStatus } from './booth-attendance';
import { boothCellsToPrintRows, type PrintSheetRow } from './booth-print-sheet';
import type { BoothCell, BoothGridSettings, BoothSlotMeta, LessonKind } from './booth-session-state';
import type { SeatCapacity } from './booth-print-sheet';
import type { NormalizedLessonSession } from '../src/services/manaerpLessonQueryService';

export interface LessonActivityRecord {
  date: string;
  studentName: string;
  attendance: AttendanceStatus | '';
  countTarget: boolean;
  capacity: SeatCapacity;
  lessonKind?: LessonKind;
  subject?: string;
}

export interface LessonActivityFilters {
  studentName?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface LessonActivitySource {
  listActivities(filters?: LessonActivityFilters): LessonActivityRecord[];
}

function inDateRange(date: string, from?: string, to?: string): boolean {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

function rowToActivity(row: PrintSheetRow): LessonActivityRecord | null {
  if (!row.studentName.trim()) return null;
  return {
    date: row.date,
    studentName: row.studentName.trim(),
    attendance: row.attendance ?? '',
    countTarget: row.countTarget !== false,
    capacity: row.capacity,
    lessonKind: row.lessonKind,
    subject: row.subject,
  };
}

/** Phase 2E/2G: booth / PrintSheet 由来。 */
export class BoothActivitySource implements LessonActivitySource {
  constructor(
    private readonly cells: BoothCell[],
    private readonly settings: BoothGridSettings,
    private readonly slotMeta: BoothSlotMeta[] = [],
  ) {}

  listActivities(filters: LessonActivityFilters = {}): LessonActivityRecord[] {
    const rows = boothCellsToPrintRows(this.cells, this.settings, undefined, this.slotMeta);
    const needle = filters.studentName?.trim();
    const activities: LessonActivityRecord[] = [];
    for (const row of rows) {
      const activity = rowToActivity(row);
      if (!activity) continue;
      if (needle && activity.studentName !== needle) continue;
      if (!inDateRange(activity.date, filters.dateFrom, filters.dateTo)) continue;
      activities.push(activity);
    }
    return activities;
  }
}

/** Phase 3A: MANAERP Lesson + Student_Session 読み取り由来 */
export class ManaerpStudentSessionSource implements LessonActivitySource {
  constructor(private readonly sessions: NormalizedLessonSession[]) {}

  listActivities(filters: LessonActivityFilters = {}): LessonActivityRecord[] {
    const needle = filters.studentName?.trim();
    const activities: LessonActivityRecord[] = [];
    for (const session of this.sessions) {
      if (!session.studentName.trim()) continue;
      if (needle && session.studentName !== needle) continue;
      if (!inDateRange(session.date, filters.dateFrom, filters.dateTo)) continue;
      activities.push({
        date: session.date,
        studentName: session.studentName,
        attendance: session.attendance,
        countTarget: session.countTarget,
        capacity: session.capacity,
        lessonKind: session.lessonKind,
        subject: session.subject,
      });
    }
    return activities;
  }
}

export function uniqueStudentNames(source: LessonActivitySource): string[] {
  const names = new Set<string>();
  for (const activity of source.listActivities()) {
    if (activity.studentName) names.add(activity.studentName);
  }
  return [...names].sort((a, b) => a.localeCompare(b, 'ja'));
}
