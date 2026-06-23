import type { LessonMasterCatalog, LessonDiscoveryConfig, LessonDiscoveryResult } from '../contracts';
import { DEFAULT_DISCOVERY_CONFIG } from '../contracts';
import {
  buildLocationAccountsSoql,
} from '../../lib/booth-count-from-account';
import { getOrgIdentity, soqlQuery } from '../../lib/sf-api';
import type { OrgIdentity } from '../../lib/types';

interface QueryConnection {
  org: OrgIdentity;
  query: (soql: string) => Promise<{ records: Record<string, unknown>[] }>;
}

function toCatalogRecord(record: Record<string, unknown>, nameField = 'Name'): {
  id: string;
  name: string;
  fields: Record<string, unknown>;
} {
  const id = String(record.Id ?? '');
  const name = String(record[nameField] ?? record.Name ?? id);
  return { id, name, fields: record };
}

export function buildSubjectMasterSoql(): string {
  return `SELECT Id, Name FROM MANAERP__Subject_Master__c ORDER BY Name LIMIT 5000`;
}

export async function fetchSubjectMasterCatalog(
  query: (soql: string) => Promise<{ records: Record<string, unknown>[] }>,
): Promise<Array<{ id: string; name: string; fields: Record<string, unknown> }>> {
  const result = await query(buildSubjectMasterSoql());
  return result.records.map((r) => toCatalogRecord(r));
}

export function buildMasterCatalogQueries(
  config: LessonDiscoveryConfig = DEFAULT_DISCOVERY_CONFIG,
  hostname?: string | null,
): Record<string, string> {
  return {
    locations: buildLocationAccountsSoql(hostname),
    academicYears: `SELECT Id, Name FROM ${config.academicYearObject} ORDER BY Name DESC LIMIT 500`,
    locationCourses: `SELECT Id, Name, MANAERP__Account__c, MANAERP__Course_Offering__c FROM ${config.locationCourseObject} ORDER BY Name LIMIT 5000`,
    classes: `SELECT Id, Name, MANAERP__Location_Course__c FROM ${config.classObject} ORDER BY Name LIMIT 5000`,
    classrooms: `SELECT Id, Name, MANAERP__Account__c FROM ${config.classroomObject} ORDER BY Name LIMIT 5000`,
    teachers: `SELECT Id, Name FROM Contact WHERE RecordType.Name = 'Staff' ORDER BY Name LIMIT 5000`,
    students: `SELECT Id, Name, MANAERP__Grade__r.Name FROM Contact WHERE RecordType.Name = 'Student' ORDER BY Name LIMIT 5000`,
    subjects: buildSubjectMasterSoql(),
    academicCalendars: `SELECT Id, Name FROM ${config.academicCalendarObject} ORDER BY Name LIMIT 500`,
  };
}

function hostnameFromOrg(org: OrgIdentity): string {
  try {
    return new URL(org.instanceUrl).hostname;
  } catch {
    return '';
  }
}

export async function syncMasterCatalog(
  conn: QueryConnection,
  config: LessonDiscoveryConfig = DEFAULT_DISCOVERY_CONFIG,
): Promise<LessonMasterCatalog> {
  const hostname = hostnameFromOrg(conn.org);
  const queries = buildMasterCatalogQueries(config, hostname);
  const [locations, academicYears, locationCourses, classes, classrooms, teachers, students, subjects, academicCalendars] =
    await Promise.all([
      conn.query(queries.locations),
      conn.query(queries.academicYears),
      conn.query(queries.locationCourses),
      conn.query(queries.classes),
      conn.query(queries.classrooms),
      conn.query(queries.teachers).catch(() => ({ records: [] as Record<string, unknown>[] })),
      conn.query(queries.students).catch(() => ({ records: [] as Record<string, unknown>[] })),
      conn.query(queries.subjects).catch(() => ({ records: [] as Record<string, unknown>[] })),
      conn.query(queries.academicCalendars).catch(() => ({ records: [] as Record<string, unknown>[] })),
    ]);

  return {
    org: {
      orgId: conn.org.orgId,
      username: conn.org.username,
      instanceUrl: conn.org.instanceUrl,
      isSandbox: conn.org.isSandbox,
    },
    syncedAt: new Date().toISOString(),
    catalogs: {
      locations: locations.records.map((r) => toCatalogRecord(r)),
      academicYears: academicYears.records.map((r) => toCatalogRecord(r)),
      locationCourses: locationCourses.records.map((r) => toCatalogRecord(r)),
      classes: classes.records.map((r) => toCatalogRecord(r)),
      classrooms: classrooms.records.map((r) => toCatalogRecord(r)),
      teachers: teachers.records.map((r) => toCatalogRecord(r)),
      students: students.records.map((r) => toCatalogRecord(r)),
      subjects: subjects.records.map((r) => toCatalogRecord(r)),
      academicCalendars: academicCalendars.records.map((r) => toCatalogRecord(r)),
    },
  };
}

export async function createMasterSyncConnection(hostname: string): Promise<QueryConnection> {
  const org = await getOrgIdentity(hostname);
  return {
    org,
    query: async (soql) => ({ records: await soqlQuery(soql) }),
  };
}

export function discoveryResultFromConfig(
  org: OrgIdentity,
  config: LessonDiscoveryConfig = DEFAULT_DISCOVERY_CONFIG,
): LessonDiscoveryResult {
  return {
    org: { orgId: org.orgId, username: org.username, instanceUrl: org.instanceUrl },
    generatedAt: new Date().toISOString(),
    config,
  };
}
