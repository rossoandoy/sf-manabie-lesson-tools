import { describe, expect, it } from 'vitest';
import type { LessonScheduleDefinition } from '../../src/contracts';
import { applyLessonDrop } from './drag-drop';
import { moveLessonToDate } from './lesson-sort';

const sample: LessonScheduleDefinition = {
  id: 'lesson-1',
  lessonName: '数学',
  lessonDate: '2026-06-10',
  startTime: '10:00',
  endTime: '11:00',
  teachingMethod: 'Group',
  teachingMedium: 'Offline',
  locationId: 'loc-1',
  locationName: '本校',
  academicYearId: 'ay-1',
  academicYearName: '2026',
  locationCourseId: 'lc-1',
  locationCourseName: '中1',
  classId: 'cls-1',
  className: 'A',
  classroomId: 'room-1',
  classroomName: '101',
  teacherId: 't-1',
  teacherName: '田中',
  capacity: '20',
  repeatEndDate: '2026-06-10',
};

describe('drag-drop', () => {
  it('moves lesson to new date and updates repeatEndDate', () => {
    const moved = moveLessonToDate([sample], 'lesson-1', '2026-06-20');
    expect(moved[0]?.lessonDate).toBe('2026-06-20');
    expect(moved[0]?.repeatEndDate).toBe('2026-06-20');
  });

  it('blocks drop onto closed dates', () => {
    const closed = new Set(['2026-06-15']);
    const result = applyLessonDrop([sample], 'lesson-1', '2026-06-15', closed);
    expect(result.blocked).toBe(true);
    expect(result.lessons[0]?.lessonDate).toBe('2026-06-10');
  });

  it('allows drop onto open dates', () => {
    const result = applyLessonDrop([sample], 'lesson-1', '2026-06-18', new Set());
    expect(result.blocked).toBe(false);
    expect(result.lessons[0]?.lessonDate).toBe('2026-06-18');
  });
});
