import type { CatalogRecord, LessonMasterCatalog } from '../src/contracts';
import {
  centerCatalogLoadedOk,
  studentsForPicker,
  teachersForPicker,
  type CenterScopedCatalog,
} from '../src/services/center-scoped-catalog';

export interface BoothPickerCatalog {
  students: CatalogRecord[];
  teachers: CatalogRecord[];
  scoped: boolean;
}

export function buildBoothPickerCatalog(
  master: LessonMasterCatalog | null | undefined,
  scoped: CenterScopedCatalog | null | undefined,
): BoothPickerCatalog {
  const scopedActive = centerCatalogLoadedOk(scoped);
  return {
    students: studentsForPicker(scoped, master?.catalogs.students),
    teachers: teachersForPicker(scoped, master?.catalogs.teachers),
    scoped: scopedActive && (Boolean(scoped?.students.length) || Boolean(scoped?.teachers.length)),
  };
}
