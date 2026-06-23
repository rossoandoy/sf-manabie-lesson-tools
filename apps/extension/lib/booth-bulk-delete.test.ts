import { describe, expect, it } from 'vitest';
import type { BoothGridSession } from './booth-session-state';
import { applyBulkDelete, previewBulkDelete } from './booth-bulk-delete';

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
      id: 'c1',
      date: '2026-04-10',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '山田太郎',
      subject: '算数',
    },
    {
      id: 'c2',
      date: '2026-04-11',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '山田太郎',
      subject: '算数',
    },
  ],
  slotMeta: [
    { date: '2026-04-10', booth: 1, period: 1, teacherName: '佐藤先生' },
    { date: '2026-04-11', booth: 1, period: 1, teacherName: '佐藤先生' },
  ],
  repeatRecords: [],
});

describe('booth-bulk-delete', () => {
  it('previews student matches in date range', () => {
    const preview = previewBulkDelete(
      baseSession(),
      'student',
      '山田太郎',
      '2026-04-10',
      '2026-04-10',
      [],
    );
    expect(preview.matches).toHaveLength(1);
  });

  it('previews teacher matches in date range', () => {
    const preview = previewBulkDelete(
      baseSession(),
      'teacher',
      '佐藤先生',
      '2026-04-01',
      '2026-04-30',
      [],
    );
    expect(preview.matches).toHaveLength(2);
  });

  it('applies student bulk delete', () => {
    const session = baseSession();
    const preview = previewBulkDelete(session, 'student', '山田太郎', '2026-04-01', '2026-04-30', []);
    const removed = applyBulkDelete(session, preview);
    expect(removed).toBe(2);
    expect(session.cells).toHaveLength(0);
  });

  it('applies teacher bulk delete', () => {
    const session = baseSession();
    const preview = previewBulkDelete(session, 'teacher', '佐藤先生', '2026-04-01', '2026-04-30', []);
    const updated = applyBulkDelete(session, preview);
    expect(updated).toBe(2);
    expect(session.slotMeta.every((meta) => !meta.teacherName.trim())).toBe(true);
  });
});
