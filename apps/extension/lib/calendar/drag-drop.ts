import type { LessonScheduleDefinition } from '../../src/contracts';
import { moveLessonToDate } from './lesson-sort';

export const DRAG_LESSON_MIME = 'application/x-manabie-lesson-id';

export function setLessonDragData(event: DragEvent, lessonId: string): void {
  if (!event.dataTransfer) return;
  event.dataTransfer.setData(DRAG_LESSON_MIME, lessonId);
  event.dataTransfer.effectAllowed = 'move';
}

export function getLessonDragId(event: DragEvent): string | null {
  return event.dataTransfer?.getData(DRAG_LESSON_MIME) || null;
}

export function applyLessonDrop(
  lessons: LessonScheduleDefinition[],
  lessonId: string,
  targetDate: string,
  closedDates: Set<string>,
): { lessons: LessonScheduleDefinition[]; blocked: boolean } {
  if (closedDates.has(targetDate)) {
    return { lessons, blocked: true };
  }
  return { lessons: moveLessonToDate(lessons, lessonId, targetDate), blocked: false };
}
