import { describe, expect, it, beforeAll } from 'vitest';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';
import type { BoothGridSettings } from '../../lib/booth-session-state';
import { manaerpAttendanceToTrg } from '../../lib/manaerp-attendance-map';
import { DEFAULT_DISCOVERY_CONFIG } from '../contracts';
import { buildStudentSessionUpdatePlan } from './studentSessionUpdatePlanBuilder';
import { executeImportPlan } from './registrationExecutor';
import { queryManaerpLessonSessions } from './manaerpLessonQueryService';
import { e2eOrgAlias, executeOptions, loadLiveCatalog, tryGetCliSession } from './e2e-live-helpers';

const live = process.env.E2E_LIVE === '1';
const hasCliSession = live && tryGetCliSession() !== null;

const settings: BoothGridSettings = {
  classroomName: 'E2E',
  accountId: '',
  boothCount: 2,
  periodCount: 3,
  hideSunday: true,
  oneToOneMode: false,
  fiscalYear: '2026',
  visiblePeriods: [1, 2, 3],
};

describe.skipIf(!hasCliSession)('e2e student session sandbox live (CLI)', () => {
  beforeAll(() => {
    if (!tryGetCliSession()) {
      throw new Error(
        `SF CLI session not found for alias "${e2eOrgAlias()}". Run: sf org login --alias ${e2eOrgAlias()}`,
      );
    }
  });

  it('updates existing student session attendance and rolls back', async () => {
    const { api, catalog } = await loadLiveCatalog();
    const fixtureLocation = catalog.catalogs.locations[0];
    if (!fixtureLocation) return;

    settings.accountId = fixtureLocation.id;
    const sessions = await queryManaerpLessonSessions(api, {
      accountId: fixtureLocation.id,
      dateFrom: '2026-04-01',
      dateTo: '2026-06-30',
    });
    const target = sessions.find((session) => session.sessionId && session.rawAttendance);
    if (!target) return;

    const originalRaw = target.rawAttendance!;
    const targetBoothAttendance = originalRaw === 'Attend' ? '欠席' : '出席';
    const expectedRaw = targetBoothAttendance === '出席' ? 'Attend' : 'Absent';

    const row: PrintSheetRow = {
      date: target.date,
      dayOfWeek: '月',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: target.studentName,
      grade: '',
      subject: target.subject ?? '',
      teacherName: '',
      lessonKind: target.lessonKind ?? '通常',
      studentType: '在籍',
      note: '',
      capacity: target.capacity,
      slotKey: `${target.date}|B1|P1|S1`,
      attendance: targetBoothAttendance,
      countTarget: true,
    };

    const plan = buildStudentSessionUpdatePlan({
      rows: [row],
      sessions: [target],
      settings,
      catalog,
      accountName: fixtureLocation.name,
    });
    expect(plan.updateCount).toBe(1);

    const log = await executeImportPlan(plan, api, executeOptions());
    expect(log.success).toBe(true);

    const attendanceField =
      DEFAULT_DISCOVERY_CONFIG.fields.studentSession?.attendanceStatus ?? 'MANAERP__Attendance_Status__c';
    const verify = await api.query<{ MANAERP__Attendance_Status__c?: string }>(
      `SELECT ${attendanceField} FROM ${DEFAULT_DISCOVERY_CONFIG.studentSessionObject} WHERE Id = '${target.sessionId}' LIMIT 1`,
    );
    expect(verify.records[0]?.[attendanceField as 'MANAERP__Attendance_Status__c']).toBe(expectedRaw);

    await api.updateRecord(DEFAULT_DISCOVERY_CONFIG.studentSessionObject!, target.sessionId, {
      [attendanceField]: originalRaw,
    });

    const restored = await api.query<{ MANAERP__Attendance_Status__c?: string }>(
      `SELECT ${attendanceField} FROM ${DEFAULT_DISCOVERY_CONFIG.studentSessionObject} WHERE Id = '${target.sessionId}' LIMIT 1`,
    );
    expect(restored.records[0]?.[attendanceField as 'MANAERP__Attendance_Status__c']).toBe(originalRaw);
    expect(manaerpAttendanceToTrg(originalRaw)).toBeTruthy();
  }, 120_000);

  it('writes 休講 as Absent with note and rolls back', async () => {
    const { api, catalog } = await loadLiveCatalog();
    const fixtureLocation = catalog.catalogs.locations[0];
    if (!fixtureLocation) return;

    settings.accountId = fixtureLocation.id;
    const sessions = await queryManaerpLessonSessions(api, {
      accountId: fixtureLocation.id,
      dateFrom: '2026-04-01',
      dateTo: '2026-06-30',
    });
    const target = sessions.find((session) => session.sessionId && session.rawAttendance === 'Attend');
    if (!target) return;

    const row: PrintSheetRow = {
      date: target.date,
      dayOfWeek: '月',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: target.studentName,
      grade: '',
      subject: target.subject ?? '',
      teacherName: '',
      lessonKind: target.lessonKind ?? '通常',
      studentType: '在籍',
      note: '',
      capacity: target.capacity,
      slotKey: `${target.date}|B1|P1|S1`,
      attendance: '休講',
      countTarget: false,
    };

    const plan = buildStudentSessionUpdatePlan({
      rows: [row],
      sessions: [target],
      settings,
      catalog,
      accountName: fixtureLocation.name,
    });
    if (plan.updateCount === 0) return;

    const attendanceField =
      DEFAULT_DISCOVERY_CONFIG.fields.studentSession?.attendanceStatus ?? 'MANAERP__Attendance_Status__c';
    const noteField =
      DEFAULT_DISCOVERY_CONFIG.fields.studentSession?.attendanceNote ?? 'MANAERP__Attendance_Note__c';

    const log = await executeImportPlan(plan, api, executeOptions());
    expect(log.success).toBe(true);

    const verify = await api.query<Record<string, string | undefined>>(
      `SELECT ${attendanceField}, ${noteField} FROM ${DEFAULT_DISCOVERY_CONFIG.studentSessionObject} WHERE Id = '${target.sessionId}' LIMIT 1`,
    );
    expect(verify.records[0]?.[attendanceField]).toBe('Absent');
    expect(verify.records[0]?.[noteField]).toBe('休講');

    await api.updateRecord(DEFAULT_DISCOVERY_CONFIG.studentSessionObject!, target.sessionId, {
      [attendanceField]: target.rawAttendance,
      [noteField]: null,
    });
  }, 120_000);
});
