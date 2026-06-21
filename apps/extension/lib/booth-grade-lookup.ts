import type { LessonMasterCatalog } from '../src/contracts';

export function gradeForStudentName(catalog: LessonMasterCatalog | null | undefined, studentName: string): string {
  const needle = studentName.trim();
  if (!needle || !catalog?.students?.length) return '';

  for (const student of catalog.students) {
    const name = String(student.fields?.Name ?? student.fields?.name ?? '').trim();
    if (name === needle) {
      const grade = student.fields?.Grade__c ?? student.fields?.grade;
      return typeof grade === 'string' ? grade.trim() : '';
    }
  }
  return '';
}
