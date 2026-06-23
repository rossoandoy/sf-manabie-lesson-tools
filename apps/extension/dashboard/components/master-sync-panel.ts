import type { LessonMasterCatalog } from '../../src/contracts';
import { createMasterSyncConnection, syncMasterCatalog } from '../../src/services/lessonMasterCatalog';
import { STORAGE_KEYS, saveJson } from '../../lib/lesson-storage';
import { setCurrentHost } from '../../lib/sf-api';

export async function runMasterSync(hostname: string): Promise<LessonMasterCatalog> {
  setCurrentHost(hostname);
  const conn = await createMasterSyncConnection(hostname);
  const catalog = await syncMasterCatalog(conn);
  await saveJson(STORAGE_KEYS.MASTER_CATALOG, catalog);
  return catalog;
}

export function renderMasterSyncSummary(root: HTMLElement, catalog: LessonMasterCatalog | null): void {
  if (!catalog) {
    root.innerHTML = '<p class="muted">前提マスタ未同期です。「前提マスタ同期」を実行してください。</p>';
    return;
  }
  const { locations, academicYears, locationCourses, classes, classrooms, teachers, students } = catalog.catalogs;
  root.innerHTML = `
    <p class="muted">最終同期: ${new Date(catalog.syncedAt).toLocaleString('ja-JP')}</p>
    <ul>
      <li>拠点: ${locations.length}</li>
      <li>年度: ${academicYears.length}</li>
      <li>拠点コース: ${locationCourses.length}</li>
      <li>クラス: ${classes.length}</li>
      <li>教室: ${classrooms.length}</li>
      <li>講師: ${teachers.length}</li>
      <li>生徒: ${students.length}</li>
    </ul>
  `;
}
