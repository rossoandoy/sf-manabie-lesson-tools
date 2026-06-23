import { describe, expect, it } from 'vitest';
import type { BoothGridSession } from './booth-session-state';
import {
  applyFiscalRollover,
  buildRolloverBackupJson,
  fiscalYearBounds,
  planRepeatCleanup,
  previewFiscalRollover,
  resolveCurrentFiscalYear,
} from './booth-fiscal-rollover';

const baseSession = (): BoothGridSession => ({
  settings: {
    classroomName: '0801',
    accountId: 'acc',
    boothCount: 2,
    periodCount: 4,
    hideSunday: true,
    oneToOneMode: false,
    fiscalYear: '2026',
    visiblePeriods: [1, 2, 3, 4],
  },
  cells: [
    {
      id: 'delete-target',
      date: '2025-04-10',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '山田太郎',
      subject: '算数',
    },
    {
      id: 'old-transfer',
      date: '2025-05-01',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '鈴木花子',
      subject: '英語',
      transferFrom: '2025-04-03',
      transferTo: '2026-06-01',
    },
    {
      id: 'current',
      date: '2026-04-10',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '山田太郎',
      subject: '算数',
    },
  ],
  slotMeta: [
    { date: '2025-04-10', booth: 1, period: 1, teacherName: '佐藤先生' },
    { date: '2026-04-10', booth: 1, period: 1, teacherName: '佐藤先生' },
  ],
  repeatRecords: [],
  syncManifest: {
    '2025-04-10|B1|P1|S1': { slot: { status: 'synced', syncedAt: '2026-01-01', contentHash: 'h1' } },
    '2026-04-10|B1|P1|S1': { slot: { status: 'synced', syncedAt: '2026-01-01', contentHash: 'h2' } },
  },
});

describe('booth-fiscal-rollover', () => {
  it('resolves fiscal year bounds', () => {
    expect(fiscalYearBounds(2026)).toEqual({ from: '2026-04-01', to: '2027-03-31' });
  });

  it('resolves current fiscal year from settings', () => {
    expect(resolveCurrentFiscalYear(baseSession())).toBe(2026);
  });

  it('previews delete year cells with transfer protection', () => {
    const preview = previewFiscalRollover(baseSession(), []);
    expect(preview.currentYear).toBe(2026);
    expect(preview.nextYear).toBe(2027);
    expect(preview.deleteYear).toBe(2025);
    expect(preview.token).toBe('FY2025');
    expect(preview.deleteFrom).toBe('2025-04-01');
    expect(preview.deleteTo).toBe('2026-03-31');
    expect(preview.deletableCells).toHaveLength(1);
    expect(preview.protectedCells).toHaveLength(1);
    expect(preview.transferProtectedCount).toBe(1);
    expect(preview.deletableSlotMetaCount).toBe(1);
  });

  it('applies rollover by deleting cells, slotMeta, manifest and bumping fiscal year', () => {
    const session = baseSession();
    const preview = previewFiscalRollover(session, []);
    const updated = applyFiscalRollover(session, preview);

    expect(updated.settings.fiscalYear).toBe('2027');
    expect(updated.cells.some((cell) => cell.date === '2025-04-10' && !cell.transferFrom)).toBe(false);
    expect(updated.cells.some((cell) => cell.transferFrom)).toBe(true);
    expect(updated.cells.some((cell) => cell.date === '2026-04-10')).toBe(true);
    expect(updated.slotMeta.some((meta) => meta.date === '2025-04-10')).toBe(false);
    expect(updated.syncManifest?.['2025-04-10|B1|P1|S1']).toBeUndefined();
    expect(updated.syncManifest?.['2026-04-10|B1|P1|S1']).toBeTruthy();
  });

  it('builds backup json with archived cells', () => {
    const session = baseSession();
    const preview = previewFiscalRollover(session, []);
    const json = buildRolloverBackupJson(session, preview);
    const parsed = JSON.parse(json) as {
      archivedDeleteYearCells: unknown[];
      session: BoothGridSession;
      fiscalRollover: { repeatCleanup: { studentEnded: number } };
    };
    expect(parsed.archivedDeleteYearCells.length).toBe(2);
    expect(parsed.session.settings.fiscalYear).toBe('2026');
    expect(parsed.fiscalRollover.repeatCleanup.studentEnded).toBe(0);
  });

  it('plans repeat cleanup for ended and clipped student records', () => {
    const session = baseSession();
    session.repeatRecords = [
      {
        id: 'r-ended',
        type: 'student',
        name: 'A',
        subject: '算数',
        dow: 1,
        period: 1,
        booth: 1,
        homeSeat: 1,
        capacity: '1:2',
        interval: 'weekly',
        startDate: '2026-04-01',
        endDate: '2027-03-31',
        status: 'active',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'r-clip',
        type: 'student',
        name: 'B',
        subject: '英語',
        dow: 2,
        period: 2,
        booth: 1,
        homeSeat: 1,
        capacity: '1:2',
        interval: 'weekly',
        startDate: '2026-04-01',
        endDate: '2028-03-31',
        status: 'active',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];
    const preview = previewFiscalRollover(session, []);
    expect(preview.repeatCleanup).toEqual({
      studentEnded: 1,
      studentClipped: 1,
      teacherEnded: 0,
      teacherClipped: 0,
    });
    expect(planRepeatCleanup(session, preview)).toEqual(preview.repeatCleanup);
  });

  it('plans teacher repeat cleanup', () => {
    const session = baseSession();
    session.teacherRepeatRecords = [
      {
        id: 't-ended',
        teacherName: '佐藤',
        dow: 1,
        period: 1,
        booth: 1,
        interval: 'weekly',
        startDate: '2025-04-01',
        endDate: '2027-03-31',
        status: 'active',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];
    const preview = previewFiscalRollover(session, []);
    expect(preview.repeatCleanup.teacherEnded).toBe(1);
  });

  it('applies repeat cleanup during fiscal rollover', () => {
    const session = baseSession();
    session.repeatRecords = [
      {
        id: 'r-ended',
        type: 'student',
        name: 'A',
        subject: '算数',
        dow: 1,
        period: 1,
        booth: 1,
        homeSeat: 1,
        capacity: '1:2',
        interval: 'weekly',
        startDate: '2026-04-01',
        endDate: '2027-03-31',
        status: 'active',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'r-clip',
        type: 'student',
        name: 'B',
        subject: '英語',
        dow: 2,
        period: 2,
        booth: 1,
        homeSeat: 1,
        capacity: '1:2',
        interval: 'weekly',
        startDate: '2026-04-01',
        endDate: '2028-03-31',
        status: 'active',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];
    session.teacherRepeatRecords = [
      {
        id: 't-clip',
        teacherName: '田中',
        dow: 3,
        period: 1,
        booth: 2,
        interval: 'weekly',
        startDate: '2026-04-01',
        endDate: '2028-03-31',
        status: 'active',
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];
    const preview = previewFiscalRollover(session, []);
    const updated = applyFiscalRollover(session, preview);

    expect(updated.settings.fiscalYear).toBe('2027');
    expect(updated.repeatRecords.find((r) => r.id === 'r-ended')?.status).toBe('ended');
    expect(updated.repeatRecords.find((r) => r.id === 'r-clip')?.startDate).toBe('2027-04-01');
    expect(updated.repeatRecords.find((r) => r.id === 'r-clip')?.status).toBe('active');
    expect(updated.teacherRepeatRecords?.[0]?.startDate).toBe('2027-04-01');
  });
});
