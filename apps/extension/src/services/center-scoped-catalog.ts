import type { CatalogRecord } from '../contracts';
import { soqlQuery } from '../../lib/sf-api';
import { formatApiErrorDetail } from './user-affiliation-context';

export interface CenterScopedCatalog {
  accountId: string;
  classroomName: string;
  students: CatalogRecord[];
  teachers: CatalogRecord[];
  loadedAt: string;
  studentLoadError?: string;
  teacherLoadError?: string;
  enrollmentFilterWarning?: string;
}

const ENROLLED_STATUSES = new Set(['Enrolled', 'Temporary']);
const ENROLLMENT_OBJECT = 'MANAERP__Enrollment_Status__c';

function escapeSoql(value: string): string {
  return value.replace(/'/g, "\\'");
}

function toContactRecord(
  row: Record<string, unknown>,
  enrollmentStatus?: string,
): CatalogRecord {
  const id = String(row.Id ?? '');
  const name = String(row.Name ?? id);
  const gradeRel = row.MANAERP__Grade__r as Record<string, unknown> | undefined;
  const enrollmentRel = row.MANAERP__Enrollment_Status__r as Record<string, unknown> | undefined;
  const gradeFromRel = gradeRel?.Name;
  const status =
    enrollmentStatus ??
    (enrollmentRel?.MANAERP__Current_Status__c as string | undefined);
  return {
    id,
    name,
    fields: {
      ...row,
      Name: name,
      Grade__c: row.Grade__c ?? gradeFromRel,
      enrollmentStatus: status,
    },
  };
}

function toTeacherRecord(row: Record<string, unknown>): CatalogRecord {
  const contact = row.MANAERP__Contact__r as Record<string, unknown> | undefined;
  const id = String(contact?.Id ?? row.MANAERP__Contact__c ?? '');
  const name = String(contact?.Name ?? id);
  return { id, name, fields: { Name: name, ...(contact ?? {}) } };
}

/** Step 1: Main_Location only — Grade via MANAERP__Grade__r (Contact has no Grade__c in extuat) */
export function buildCenterStudentBaseSoql(accountId: string): string {
  const id = escapeSoql(accountId);
  return (
    `SELECT Id, Name, MANAERP__Enrollment_Status__c, MANAERP__Grade__r.Name ` +
    `FROM Contact WHERE RecordType.Name = 'Student' ` +
    `AND MANAERP__Main_Location__c = '${id}' ` +
    `ORDER BY Name LIMIT 5000`
  );
}

/** @deprecated Use buildCenterStudentBaseSoql — kept for test compatibility */
export function buildCenterStudentSoql(accountId: string): string {
  return buildCenterStudentBaseSoql(accountId);
}

export function buildCenterEnrollmentStatusSoql(enrollmentIds: string[]): string {
  const inClause = enrollmentIds.map((id) => `'${escapeSoql(id)}'`).join(', ');
  return (
    `SELECT Id, MANAERP__Current_Status__c FROM ${ENROLLMENT_OBJECT} ` +
    `WHERE Id IN (${inClause})`
  );
}

export function buildCenterTeacherSoql(accountId: string): string {
  const id = escapeSoql(accountId);
  return (
    `SELECT MANAERP__Contact__c, MANAERP__Contact__r.Id, MANAERP__Contact__r.Name ` +
    `FROM MANAERP__Affiliation__c WHERE MANAERP__Account__c = '${id}' ` +
    `AND MANAERP__Contact__r.RecordType.Name = 'Staff' ORDER BY MANAERP__Contact__r.Name LIMIT 2000`
  );
}

function chunkIds(ids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

async function loadEnrollmentStatusMap(
  enrollmentIds: string[],
): Promise<{ map: Map<string, string>; warning?: string }> {
  const unique = [...new Set(enrollmentIds.filter(Boolean))];
  if (!unique.length) return { map: new Map() };

  const map = new Map<string, string>();
  try {
    for (const chunk of chunkIds(unique, 200)) {
      const rows = await soqlQuery<{ Id?: string; MANAERP__Current_Status__c?: string }>(
        buildCenterEnrollmentStatusSoql(chunk),
      );
      for (const row of rows) {
        const id = String(row.Id ?? '');
        if (id) map.set(id, String(row.MANAERP__Current_Status__c ?? ''));
      }
    }
  } catch (error) {
    return {
      map: new Map(),
      warning: `Enrollment 絞り込み未適用: ${formatApiErrorDetail(error)}`,
    };
  }
  return { map };
}

function filterStudentsByEnrollment(
  rows: Record<string, unknown>[],
  statusMap: Map<string, string>,
  skipFilter: boolean,
): CatalogRecord[] {
  const students: CatalogRecord[] = [];
  for (const row of rows) {
    const enrollmentId = String(row.MANAERP__Enrollment_Status__c ?? '').trim();
    if (skipFilter) {
      students.push(toContactRecord(row));
      continue;
    }
    if (!enrollmentId) continue;
    const status = statusMap.get(enrollmentId);
    if (!status || !ENROLLED_STATUSES.has(status)) continue;
    students.push(toContactRecord(row, status));
  }
  return students.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
}

async function loadCenterStudents(
  accountId: string,
): Promise<{ students: CatalogRecord[]; studentLoadError?: string; enrollmentFilterWarning?: string }> {
  try {
    const soql = buildCenterStudentBaseSoql(accountId);
    const rows = await soqlQuery<Record<string, unknown>>(soql);
    const enrollmentIds = rows
      .map((row) => String(row.MANAERP__Enrollment_Status__c ?? '').trim())
      .filter(Boolean);
    const { map, warning } = await loadEnrollmentStatusMap(enrollmentIds);
    const skipFilter = Boolean(warning);
    const students = filterStudentsByEnrollment(rows, map, skipFilter);
    return { students, enrollmentFilterWarning: warning };
  } catch (error) {
    const detail = formatApiErrorDetail(error);
    return { students: [], studentLoadError: detail };
  }
}

async function loadCenterTeachers(
  accountId: string,
): Promise<{ teachers: CatalogRecord[]; teacherLoadError?: string }> {
  try {
    const teacherRows = await soqlQuery<Record<string, unknown>>(buildCenterTeacherSoql(accountId));
    const teacherMap = new Map<string, CatalogRecord>();
    for (const row of teacherRows) {
      const rec = toTeacherRecord(row);
      if (rec.id) teacherMap.set(rec.id, rec);
    }
    return {
      teachers: [...teacherMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'ja')),
    };
  } catch (error) {
    return { teachers: [], teacherLoadError: formatApiErrorDetail(error) };
  }
}

export async function loadCenterScopedCatalog(
  accountId: string,
  classroomName: string,
): Promise<CenterScopedCatalog> {
  const trimmedAccount = accountId.trim();
  if (!trimmedAccount) {
    return { accountId: '', classroomName, students: [], teachers: [], loadedAt: new Date().toISOString() };
  }

  const [studentResult, teacherResult] = await Promise.all([
    loadCenterStudents(trimmedAccount),
    loadCenterTeachers(trimmedAccount),
  ]);

  return {
    accountId: trimmedAccount,
    classroomName,
    students: studentResult.students,
    teachers: teacherResult.teachers,
    loadedAt: new Date().toISOString(),
    studentLoadError: studentResult.studentLoadError,
    teacherLoadError: teacherResult.teacherLoadError,
    enrollmentFilterWarning: studentResult.enrollmentFilterWarning,
  };
}

export function centerCatalogLoadedOk(catalog: CenterScopedCatalog | null | undefined): boolean {
  if (!catalog?.accountId) return false;
  return !catalog.studentLoadError;
}

export function studentsForPicker(
  centerCatalog: CenterScopedCatalog | null | undefined,
  globalStudents: CatalogRecord[] | undefined,
): CatalogRecord[] {
  if (centerCatalog?.accountId) {
    if (centerCatalog.studentLoadError) return [];
    return centerCatalog.students;
  }
  return globalStudents ?? [];
}

/** 回数報告の生徒選択 — 在籍/Temporary の CatalogRecord 一覧 */
export function enrolledStudentsForReport(
  centerCatalog: CenterScopedCatalog | null | undefined,
  globalStudents: CatalogRecord[] | undefined,
  boothStudentNames: string[] = [],
): CatalogRecord[] {
  if (centerCatalog?.accountId && !centerCatalog.studentLoadError) {
    return studentsForPicker(centerCatalog, globalStudents);
  }
  return [...new Set(boothStudentNames.map((n) => n.trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'ja'))
    .map((name) => ({ id: name, name }));
}

/** 回数報告の生徒プルダウン — 在籍/Temporary のみ（global マスタは混ぜない） */
export function enrolledStudentNamesForReport(
  centerCatalog: CenterScopedCatalog | null | undefined,
  globalStudents: CatalogRecord[] | undefined,
  boothStudentNames: string[] = [],
): string[] {
  return enrolledStudentsForReport(centerCatalog, globalStudents, boothStudentNames).map((s) => s.name);
}

export function teachersForPicker(
  centerCatalog: CenterScopedCatalog | null | undefined,
  globalTeachers: CatalogRecord[] | undefined,
): CatalogRecord[] {
  if (centerCatalog?.accountId) {
    if (centerCatalog.teacherLoadError) return [];
    return centerCatalog.teachers;
  }
  return globalTeachers ?? [];
}
