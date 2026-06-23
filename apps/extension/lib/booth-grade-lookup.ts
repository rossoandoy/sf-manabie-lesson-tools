import type { CatalogRecord, LessonMasterCatalog } from '../src/contracts';
import type { CenterScopedCatalog } from '../src/services/center-scoped-catalog';
import { studentsForPicker } from '../src/services/center-scoped-catalog';

export type StudentCatalogSource =
  | LessonMasterCatalog
  | CenterScopedCatalog
  | { students?: CatalogRecord[] }
  | null
  | undefined;

export function gradeFromCatalogRecord(record: CatalogRecord | null | undefined): string {
  if (!record?.fields) return '';
  const gradeRel = record.fields.MANAERP__Grade__r as Record<string, unknown> | undefined;
  const grade =
    record.fields.Grade__c ??
    record.fields.grade ??
    gradeRel?.Name;
  return typeof grade === 'string' ? grade.trim() : String(grade ?? '').trim();
}

export function gradeForStudentName(
  catalog: StudentCatalogSource,
  centerCatalog: CenterScopedCatalog | null | undefined,
  studentName: string,
): string {
  const needle = studentName.trim();
  if (!needle) return '';

  const master = catalog && 'catalogs' in catalog ? catalog : null;
  const records = studentRecordsForLookup(master, centerCatalog);

  for (const student of records) {
    const name = String(student.fields?.Name ?? student.name ?? '').trim();
    if (name !== needle) continue;
    return gradeFromCatalogRecord(student);
  }
  return '';
}

export function studentRecordsForLookup(
  catalog: LessonMasterCatalog | null | undefined,
  centerCatalog: CenterScopedCatalog | null | undefined,
): CatalogRecord[] {
  return studentsForPicker(centerCatalog, catalog?.catalogs.students);
}
