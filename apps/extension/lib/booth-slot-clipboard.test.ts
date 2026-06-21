import { describe, expect, it } from 'vitest';
import { captureSlot, moveSlot, pasteSlot } from './booth-slot-clipboard';
import { DEFAULT_BOOTH_SETTINGS, upsertCell, upsertSlotMeta, type BoothGridSession } from './booth-session-state';

const baseSession = (): BoothGridSession => ({
  settings: { ...DEFAULT_BOOTH_SETTINGS },
  cells: [],
  slotMeta: [],
  repeatRecords: [],
});

describe('booth slot clipboard', () => {
  it('captures and pastes slot with teacher and students', () => {
    const session = baseSession();
    upsertSlotMeta(session, { date: '2026-06-16', booth: 1, period: 1, teacherName: '山田' });
    upsertCell(session, {
      id: '2026-06-16|1|1|1',
      date: '2026-06-16',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '田中',
      subject: '数学',
    });

    const payload = captureSlot(session, { date: '2026-06-16', booth: 1, period: 1 });
    expect(payload.teacherName).toBe('山田');
    expect(payload.seats).toHaveLength(1);

    const pasted = pasteSlot(session, { date: '2026-06-17', booth: 2, period: 2 }, payload, []);
    expect(pasted.ok).toBe(true);
    const copied = captureSlot(session, { date: '2026-06-17', booth: 2, period: 2 });
    expect(copied.teacherName).toBe('山田');
    expect(copied.seats[0]?.studentName).toBe('田中');
  });

  it('moveSlot clears source', () => {
    const session = baseSession();
    upsertSlotMeta(session, { date: '2026-06-16', booth: 1, period: 1, teacherName: '佐藤' });
    upsertCell(session, {
      id: '2026-06-16|1|1|1',
      date: '2026-06-16',
      booth: 1,
      period: 1,
      seat: 1,
      studentName: '鈴木',
      subject: '英語',
    });

    const moved = moveSlot(
      session,
      { date: '2026-06-16', booth: 1, period: 1 },
      { date: '2026-06-17', booth: 1, period: 1 },
      [],
    );
    expect(moved.ok).toBe(true);
    expect(captureSlot(session, { date: '2026-06-16', booth: 1, period: 1 }).seats).toHaveLength(0);
    expect(captureSlot(session, { date: '2026-06-17', booth: 1, period: 1 }).seats[0]?.studentName).toBe('鈴木');
  });
});
