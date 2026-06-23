import {
  createCliConnection,
  createCliSalesforceApi,
  getCliSfSession,
  type CliSfSession,
} from '../../lib/cli-sf-session';
import { formatDateKey } from '../../lib/calendar-utils';
import {
  academicCalendarIdForLocation,
  filterClassesForCourse,
  filterClassroomsForLocation,
  filterLocationCoursesForLocation,
} from '../../lib/session-state';
import type {
  ClosedDateDefinition,
  ExecutionLog,
  LessonDiscoveryConfig,
  LessonMasterCatalog,
  LessonScheduleDefinition,
  SalesforceApiClient,
} from '../contracts';
import { DEFAULT_DISCOVERY_CONFIG, SANDBOX_CONFIRMATION_PHRASE } from '../contracts';
import { syncMasterCatalog } from './lessonMasterCatalog';

export interface ScheduleFixture {
  locationId: string;
  locationName: string;
  academicYearId: string;
  academicYearName: string;
  locationCourseId: string;
  locationCourseName: string;
  classId: string;
  className: string;
  classroomId: string;
  classroomName: string;
  teacherId: string;
  teacherName: string;
  academicCalendarId: string;
}

export interface LiveE2eContext {
  session: CliSfSession;
  catalog: LessonMasterCatalog;
  api: SalesforceApiClient;
  fixture: ScheduleFixture;
  runId: string;
}

export function e2eOrgAlias(): string {
  return process.env.E2E_ORG ?? 'trg2--extuat';
}

export function isDryRun(): boolean {
  return process.env.E2E_DRY_RUN === '1';
}

export function skipCleanup(): boolean {
  return process.env.E2E_SKIP_CLEANUP === '1';
}

export function tryGetCliSession(orgAlias = e2eOrgAlias()): CliSfSession | null {
  try {
    return getCliSfSession(orgAlias);
  } catch {
    return null;
  }
}

export function assertSandboxOnly(session: CliSfSession): void {
  if (!session.isSandbox) {
    throw new Error(`E2E refused: org ${session.username} is not a sandbox (${session.instanceUrl})`);
  }
}

export async function loadLiveCatalog(orgAlias = e2eOrgAlias()): Promise<{
  session: CliSfSession;
  catalog: LessonMasterCatalog;
  api: SalesforceApiClient;
}> {
  const session = getCliSfSession(orgAlias);
  assertSandboxOnly(session);
  const conn = createCliConnection(session);
  const catalog = await syncMasterCatalog(conn);
  const api = createCliSalesforceApi(session) as SalesforceApiClient;
  return { session, catalog, api };
}

export function pickScheduleFixture(catalog: LessonMasterCatalog): ScheduleFixture {
  const academicYear = catalog.catalogs.academicYears[0];
  if (!academicYear) throw new Error('E2E fixture: no academic years in master catalog');

  const teacher = catalog.catalogs.teachers[0];
  if (!teacher) throw new Error('E2E fixture: no teachers in master catalog');

  for (const location of catalog.catalogs.locations) {
    const academicCalendarId = academicCalendarIdForLocation(catalog, location.id);
    if (!academicCalendarId) continue;

    const locationCourses = filterLocationCoursesForLocation(catalog, location.id).filter(
      (course) => !course.name.includes('廃止'),
    );
    const classrooms = filterClassroomsForLocation(catalog, location.id);
    const classroom = classrooms[0];
    if (!classroom) continue;

    for (const locationCourse of locationCourses) {
      const classes = filterClassesForCourse(catalog, locationCourse.id);
      const klass = classes[0];

      return {
        locationId: location.id,
        locationName: location.name,
        academicYearId: academicYear.id,
        academicYearName: academicYear.name,
        locationCourseId: locationCourse.id,
        locationCourseName: locationCourse.name,
        classId: klass?.id ?? '',
        className: klass?.name ?? '',
        classroomId: classroom.id,
        classroomName: classroom.name,
        teacherId: teacher.id,
        teacherName: teacher.name,
        academicCalendarId,
      };
    }
  }

  throw new Error(
    'E2E fixture: no location with academic calendar, location course, and classroom found in master catalog',
  );
}

function dateFromRunId(runId: string, dayOffset: number): string {
  const hash = [...runId].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);
  const date = new Date();
  date.setDate(date.getDate() + 90 + (hash % 30) + dayOffset);
  return formatDateKey(date);
}

export function buildE2eRunId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function buildE2eLessonDefinition(
  fixture: ScheduleFixture,
  runId: string,
): LessonScheduleDefinition {
  const lessonDate = dateFromRunId(runId, 0);
  return {
    id: `e2e-lesson-${runId}`,
    lessonName: `E2E-LT-${runId}`,
    lessonDate,
    startTime: '10:00',
    endTime: '11:00',
    teachingMethod: 'Group',
    teachingMedium: 'Offline',
    locationId: fixture.locationId,
    locationName: fixture.locationName,
    academicYearId: fixture.academicYearId,
    academicYearName: fixture.academicYearName,
    locationCourseId: fixture.locationCourseId,
    locationCourseName: fixture.locationCourseName,
    classId: fixture.classId,
    className: fixture.className,
    classroomId: fixture.classroomId,
    classroomName: fixture.classroomName,
    teacherId: fixture.teacherId,
    teacherName: fixture.teacherName,
    capacity: '10',
    repeatEndDate: lessonDate,
  };
}

export function buildE2eClosedDateDefinition(
  fixture: ScheduleFixture,
  runId: string,
): ClosedDateDefinition {
  const date = dateFromRunId(runId, 1);
  return {
    id: `e2e-closed-${runId}`,
    title: `E2E-Closed-${runId}`,
    date,
    academicYearId: fixture.academicYearId,
    academicYearName: fixture.academicYearName,
  };
}

export async function loadLiveE2eContext(orgAlias = e2eOrgAlias()): Promise<LiveE2eContext> {
  const runId = buildE2eRunId();
  const { session, catalog, api } = await loadLiveCatalog(orgAlias);
  const fixture = pickScheduleFixture(catalog);
  return { session, catalog, api, fixture, runId };
}

export function executeOptions(): {
  confirmed: boolean;
  confirmationPhrase: string;
  dryRun?: boolean;
} {
  return {
    confirmed: true,
    confirmationPhrase: SANDBOX_CONFIRMATION_PHRASE,
    dryRun: isDryRun() || undefined,
  };
}

export async function verifyRecordExists(
  api: SalesforceApiClient,
  sobjectApiName: string,
  id: string,
): Promise<void> {
  if (isDryRun() || id.startsWith('DRY_RUN_')) return;
  const { records } = await api.query(`SELECT Id FROM ${sobjectApiName} WHERE Id = '${id}' LIMIT 1`);
  if (!records.length) {
    throw new Error(`Expected ${sobjectApiName} record ${id} to exist after execute`);
  }
}

export async function cleanupExecutionLog(
  api: SalesforceApiClient,
  log: ExecutionLog,
  _config: LessonDiscoveryConfig = DEFAULT_DISCOVERY_CONFIG,
): Promise<void> {
  if (skipCleanup() || isDryRun()) return;

  const batches = [...log.batchLogs].reverse();
  for (const batch of batches) {
    for (const row of batch.rowResults) {
      if (!row.success || !row.salesforceId || row.salesforceId.startsWith('DRY_RUN_')) continue;
      try {
        await api.deleteRecord(batch.sobjectApiName, row.salesforceId);
      } catch (error) {
        console.warn(
          `Cleanup failed for ${batch.sobjectApiName}/${row.salesforceId}:`,
          error instanceof Error ? error.message : error,
        );
      }
    }
  }
}

export function assertCatalogReadyForPlans(catalog: LessonMasterCatalog): void {
  expectNonEmpty(catalog.catalogs.locations, 'locations');
  expectNonEmpty(catalog.catalogs.academicYears, 'academicYears');
  pickScheduleFixture(catalog);
}

function expectNonEmpty<T>(items: T[], label: string): void {
  if (!items.length) throw new Error(`E2E: catalog.${label} is empty`);
}

export async function isClosedDateObjectAvailable(
  api: SalesforceApiClient,
  objectName = DEFAULT_DISCOVERY_CONFIG.closedDateObject,
): Promise<boolean> {
  try {
    await api.query(`SELECT Id FROM ${objectName} LIMIT 1`);
    return true;
  } catch {
    return false;
  }
}
