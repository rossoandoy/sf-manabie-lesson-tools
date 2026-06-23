import type { LessonScheduleDefinition } from '../../src/contracts';

export function sortLessons(lessons: LessonScheduleDefinition[]): LessonScheduleDefinition[] {
  return [...lessons].sort((a, b) => {
    if (a.lessonDate !== b.lessonDate) return a.lessonDate.localeCompare(b.lessonDate);
    if (a.startTime !== b.startTime) return a.startTime.localeCompare(b.startTime);
    if (a.endTime !== b.endTime) return a.endTime.localeCompare(b.endTime);
    return a.lessonName.localeCompare(b.lessonName);
  });
}

export function lessonsForDate(lessons: LessonScheduleDefinition[], dateKey: string): LessonScheduleDefinition[] {
  return sortLessons(lessons.filter((lesson) => lesson.lessonDate === dateKey));
}

export function moveLessonToDate(
  lessons: LessonScheduleDefinition[],
  lessonId: string,
  newDate: string,
): LessonScheduleDefinition[] {
  return lessons.map((lesson) =>
    lesson.id === lessonId ? { ...lesson, lessonDate: newDate, repeatEndDate: newDate } : lesson,
  );
}

export function copyLesson(lesson: LessonScheduleDefinition, targetDate: string): LessonScheduleDefinition {
  return {
    ...lesson,
    id: `lesson-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    lessonName: `${lesson.lessonName} コピー`,
    lessonDate: targetDate,
    repeatEndDate: targetDate,
  };
}
