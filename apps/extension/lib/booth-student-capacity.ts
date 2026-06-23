import type { CatalogRecord, LessonMasterCatalog } from '../src/contracts';
import type { CenterScopedCatalog } from '../src/services/center-scoped-catalog';
import { studentsForPicker } from '../src/services/center-scoped-catalog';
import type { BoothGridSession } from './booth-session-state';
import { getCell } from './booth-session-state';

export type StudentCapacity = '1:1' | '1:2';

export type StudentCatalogSource =
  | LessonMasterCatalog
  | CenterScopedCatalog
  | { catalogs?: { students?: CatalogRecord[] } }
  | null
  | undefined;

export const ONE_ON_ONE_PLACEHOLDER = '(1:1枠)';

export function isOneOnOnePlaceholder(value: string | undefined): boolean {
  const text = (value ?? '').trim();
  return !text || text === ONE_ON_ONE_PLACEHOLDER;
}

function studentRecords(
  catalog: StudentCatalogSource,
  centerCatalog: CenterScopedCatalog | null | undefined,
): CatalogRecord[] {
  if (catalog && 'catalogs' in catalog) {
    return studentsForPicker(centerCatalog, catalog.catalogs?.students);
  }
  if (centerCatalog?.accountId && !centerCatalog.studentLoadError) return centerCatalog.students;
  if (catalog && 'students' in catalog && Array.isArray(catalog.students)) return catalog.students;
  return [];
}

export function studentCapacityFromCatalog(
  catalog: StudentCatalogSource,
  centerCatalog: CenterScopedCatalog | null | undefined,
  studentName: string,
): StudentCapacity | null {
  const needle = studentName.trim();
  if (!needle) return null;

  for (const student of studentRecords(catalog, centerCatalog)) {
    const name = String(student.fields?.Name ?? student.name ?? '').trim();
    if (name !== needle) continue;
    const raw = student.fields?.MANAERP__Lesson_Capacity__c ?? student.fields?.lessonCapacity;
    if (raw === null || raw === undefined || raw === '') return '1:2';
    if (typeof raw === 'number') return raw <= 1 ? '1:1' : '1:2';
    const text = String(raw).trim();
    if (text === '1' || text.includes('1:1')) return '1:1';
    return '1:2';
  }
  return null;
}

export function shouldBlockSeat2(
  session: BoothGridSession,
  date: string,
  booth: number,
  period: number,
  catalog: StudentCatalogSource,
  centerCatalog: CenterScopedCatalog | null | undefined,
): boolean {
  const seat1 = getCell(session, date, booth, period, 1);
  const seat2 = getCell(session, date, booth, period, 2);
  const seat2Name = seat2.studentName.trim();
  if (seat2Name && !isOneOnOnePlaceholder(seat2Name)) return false;

  const seat1Name = seat1.studentName.trim();
  if (!seat1Name || isOneOnOnePlaceholder(seat1Name)) return false;

  const contract = studentCapacityFromCatalog(catalog, centerCatalog, seat1Name);
  if (contract === '1:1') return true;
  if (session.settings.oneToOneMode) return true;
  return false;
}
