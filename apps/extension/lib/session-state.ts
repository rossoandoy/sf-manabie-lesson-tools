import type { LessonMasterCatalog, TimeSlotTemplate } from '../src/contracts';
import { STORAGE_KEYS, loadScoped, saveScoped } from '../lib/lesson-storage';

export interface LessonEditorDefaults {
  locationId?: string;
  locationCourseId?: string;
  classId?: string;
  classroomId?: string;
  teacherId?: string;
}

export interface LessonSessionState {
  lessons: import('../src/contracts').LessonScheduleDefinition[];
  fiscalYearOverride: string;
  timeSlots: TimeSlotTemplate[];
  defaults?: LessonEditorDefaults;
}

export interface ClosedDateSessionState {
  closedDates: import('../src/contracts').ClosedDateDefinition[];
}

const DEFAULT_TIME_SLOTS: TimeSlotTemplate[] = [
  { id: 'ts-1', name: '1限', startTime: '10:00', endTime: '11:00', isDefault: true },
  { id: 'ts-2', name: '2限', startTime: '11:00', endTime: '12:00' },
];

export async function loadLessonSession(hostname: string): Promise<LessonSessionState> {
  return (
    (await loadScoped<LessonSessionState>(hostname, STORAGE_KEYS.LESSON_SESSION)) ?? {
      lessons: [],
      fiscalYearOverride: '',
      timeSlots: DEFAULT_TIME_SLOTS,
    }
  );
}

export async function saveLessonSession(hostname: string, state: LessonSessionState): Promise<void> {
  await saveScoped(hostname, STORAGE_KEYS.LESSON_SESSION, state);
}

export async function loadClosedDateSession(hostname: string): Promise<ClosedDateSessionState> {
  return (
    (await loadScoped<ClosedDateSessionState>(hostname, STORAGE_KEYS.CLOSED_DATE_SESSION)) ?? {
      closedDates: [],
    }
  );
}

export async function saveClosedDateSession(hostname: string, state: ClosedDateSessionState): Promise<void> {
  await saveScoped(hostname, STORAGE_KEYS.CLOSED_DATE_SESSION, state);
}

export function filterClassesForCourse(
  catalog: LessonMasterCatalog | null,
  locationCourseId: string,
): LessonMasterCatalog['catalogs']['classes'] {
  if (!catalog || !locationCourseId) return [];
  return catalog.catalogs.classes.filter((item) => item.fields?.MANAERP__Location_Course__c === locationCourseId);
}

export function filterClassroomsForLocation(
  catalog: LessonMasterCatalog | null,
  locationId: string,
): LessonMasterCatalog['catalogs']['classrooms'] {
  if (!catalog || !locationId) return [];
  return catalog.catalogs.classrooms.filter((item) => item.fields?.MANAERP__Account__c === locationId);
}

export function filterLocationCoursesForLocation(
  catalog: LessonMasterCatalog | null,
  locationId: string,
): LessonMasterCatalog['catalogs']['locationCourses'] {
  if (!catalog || !locationId) return [];
  return catalog.catalogs.locationCourses.filter((item) => item.fields?.MANAERP__Account__c === locationId);
}

export function academicCalendarIdForLocation(
  catalog: LessonMasterCatalog | null,
  locationId: string,
): string {
  const location = catalog?.catalogs.locations.find((item) => item.id === locationId);
  return String(location?.fields?.MANAERP__Academic_Calendar__c ?? '');
}
