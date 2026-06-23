import type { ClosedDateDefinition } from '../src/contracts';
import { buildSlotKey } from './booth-print-sheet';
import type { TeacherRepeatRecord } from './booth-teacher-repeat';
import { formatDateKey, schoolYearFromDate } from './calendar-utils';
import type { BoothCell, BoothGridSession, RepeatRecord } from './booth-session-state';

export interface FiscalRolloverCellRef {
  date: string;
  booth: number;
  period: number;
  seat: 1 | 2;
  slotKey: string;
}

export interface RepeatCleanupSummary {
  studentEnded: number;
  studentClipped: number;
  teacherEnded: number;
  teacherClipped: number;
}

export const EMPTY_REPEAT_CLEANUP: RepeatCleanupSummary = {
  studentEnded: 0,
  studentClipped: 0,
  teacherEnded: 0,
  teacherClipped: 0,
};

export interface FiscalRolloverPreview {
  currentYear: number;
  nextYear: number;
  deleteYear: number;
  deleteFrom: string;
  deleteTo: string;
  token: string;
  deletableCells: FiscalRolloverCellRef[];
  protectedCells: FiscalRolloverCellRef[];
  transferProtectedCount: number;
  deletableSlotMetaCount: number;
  repeatCleanup: RepeatCleanupSummary;
}

export function fiscalYearBounds(year: number): { from: string; to: string } {
  return { from: `${year}-04-01`, to: `${year + 1}-03-31` };
}

export function resolveCurrentFiscalYear(session: BoothGridSession): number {
  const raw = session.settings.fiscalYear.trim();
  if (raw && !Number.isNaN(Number(raw))) return Number(raw);
  const today = formatDateKey(new Date());
  const anchor = session.cells.find((cell) => cell.studentName.trim())?.date ?? today;
  return schoolYearFromDate(anchor);
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to;
}

function isTransferProtected(cell: BoothCell): boolean {
  return Boolean(cell.transferFrom?.trim() || cell.transferTo?.trim());
}

function cellRef(cell: BoothCell): FiscalRolloverCellRef {
  return {
    date: cell.date,
    booth: cell.booth,
    period: cell.period,
    seat: cell.seat,
    slotKey: buildSlotKey(cell.date, cell.booth, cell.period, cell.seat),
  };
}

type DateRangedRepeat = Pick<RepeatRecord, 'startDate' | 'endDate' | 'status'> | Pick<TeacherRepeatRecord, 'startDate' | 'endDate' | 'status'>;

function classifyRepeatCleanup(
  record: DateRangedRepeat,
  newYearStart: string,
): 'ended' | 'clipped' | 'unchanged' {
  if (record.status !== 'active') return 'unchanged';
  if (record.endDate < newYearStart) return 'ended';
  if (record.startDate < newYearStart) return 'clipped';
  return 'unchanged';
}

export function formatRepeatCleanupSummary(cleanup: RepeatCleanupSummary): string {
  return `定期整理: 生徒 終了${cleanup.studentEnded} / 更新${cleanup.studentClipped}、講師 終了${cleanup.teacherEnded} / 更新${cleanup.teacherClipped}`;
}

export function planRepeatCleanup(
  session: BoothGridSession,
  preview: Pick<FiscalRolloverPreview, 'nextYear'>,
): RepeatCleanupSummary {
  const newYearStart = fiscalYearBounds(preview.nextYear).from;
  const summary: RepeatCleanupSummary = { ...EMPTY_REPEAT_CLEANUP };

  for (const record of session.repeatRecords) {
    const action = classifyRepeatCleanup(record, newYearStart);
    if (action === 'ended') summary.studentEnded += 1;
    else if (action === 'clipped') summary.studentClipped += 1;
  }

  for (const record of session.teacherRepeatRecords ?? []) {
    const action = classifyRepeatCleanup(record, newYearStart);
    if (action === 'ended') summary.teacherEnded += 1;
    else if (action === 'clipped') summary.teacherClipped += 1;
  }

  return summary;
}

export function applyRepeatCleanup(
  session: BoothGridSession,
  preview: Pick<FiscalRolloverPreview, 'nextYear'>,
): RepeatCleanupSummary {
  const newYearStart = fiscalYearBounds(preview.nextYear).from;
  const now = new Date().toISOString();
  const summary: RepeatCleanupSummary = { ...EMPTY_REPEAT_CLEANUP };

  for (const record of session.repeatRecords) {
    const action = classifyRepeatCleanup(record, newYearStart);
    if (action === 'ended') {
      record.status = 'ended';
      record.updatedAt = now;
      summary.studentEnded += 1;
    } else if (action === 'clipped') {
      record.startDate = newYearStart;
      record.updatedAt = now;
      summary.studentClipped += 1;
    }
  }

  for (const record of session.teacherRepeatRecords ?? []) {
    const action = classifyRepeatCleanup(record, newYearStart);
    if (action === 'ended') {
      record.status = 'ended';
      record.updatedAt = now;
      summary.teacherEnded += 1;
    } else if (action === 'clipped') {
      record.startDate = newYearStart;
      record.updatedAt = now;
      summary.teacherClipped += 1;
    }
  }

  return summary;
}

export function previewFiscalRollover(
  session: BoothGridSession,
  _closedDates: ClosedDateDefinition[],
): FiscalRolloverPreview {
  const currentYear = resolveCurrentFiscalYear(session);
  const nextYear = currentYear + 1;
  const deleteYear = currentYear - 1;
  const { from: deleteFrom, to: deleteTo } = fiscalYearBounds(deleteYear);
  const token = `FY${deleteYear}`;

  const deletableCells: FiscalRolloverCellRef[] = [];
  const protectedCells: FiscalRolloverCellRef[] = [];

  for (const cell of session.cells) {
    if (!inRange(cell.date, deleteFrom, deleteTo)) continue;
    const ref = cellRef(cell);
    if (isTransferProtected(cell)) protectedCells.push(ref);
    else deletableCells.push(ref);
  }

  const deletableSlotMetaCount = session.slotMeta.filter((meta) =>
    inRange(meta.date, deleteFrom, deleteTo),
  ).length;

  const previewBase = {
    currentYear,
    nextYear,
    deleteYear,
    deleteFrom,
    deleteTo,
    token,
    deletableCells,
    protectedCells,
    transferProtectedCount: protectedCells.length,
    deletableSlotMetaCount,
  };

  return {
    ...previewBase,
    repeatCleanup: planRepeatCleanup(session, previewBase),
  };
}

export function buildRolloverBackupJson(
  session: BoothGridSession,
  preview: FiscalRolloverPreview,
): string {
  const refs = [...preview.deletableCells, ...preview.protectedCells];
  const archivedDeleteYearCells = refs
    .map((ref) =>
      session.cells.find(
        (cell) =>
          cell.date === ref.date &&
          cell.booth === ref.booth &&
          cell.period === ref.period &&
          cell.seat === ref.seat,
      ),
    )
    .filter((cell): cell is BoothCell => Boolean(cell));

  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      fiscalRollover: {
        currentYear: preview.currentYear,
        nextYear: preview.nextYear,
        deleteYear: preview.deleteYear,
        deleteFrom: preview.deleteFrom,
        deleteTo: preview.deleteTo,
        repeatCleanup: preview.repeatCleanup,
      },
      session,
      archivedDeleteYearCells,
    },
    null,
    2,
  );
}

export function applyFiscalRollover(
  session: BoothGridSession,
  preview: FiscalRolloverPreview,
): BoothGridSession {
  const deleteKeys = new Set(preview.deletableCells.map((cell) => cell.slotKey));
  const deleteMetaKeys = new Set(
    session.slotMeta
      .filter((meta) => inRange(meta.date, preview.deleteFrom, preview.deleteTo))
      .map((meta) => `${meta.date}|${meta.booth}|${meta.period}`),
  );

  const cells = session.cells.filter((cell) => {
    const key = buildSlotKey(cell.date, cell.booth, cell.period, cell.seat);
    return !deleteKeys.has(key);
  });

  const slotMeta = session.slotMeta.filter(
    (meta) => !deleteMetaKeys.has(`${meta.date}|${meta.booth}|${meta.period}`),
  );

  let syncManifest = session.syncManifest;
  if (syncManifest && deleteKeys.size) {
    const nextManifest = { ...syncManifest };
    for (const key of deleteKeys) {
      delete nextManifest[key];
    }
    syncManifest = nextManifest;
  }

  const nextSession: BoothGridSession = {
    ...session,
    settings: {
      ...session.settings,
      fiscalYear: String(preview.nextYear),
    },
    cells,
    slotMeta,
    syncManifest,
    repeatRecords: [...session.repeatRecords],
    teacherRepeatRecords: session.teacherRepeatRecords ? [...session.teacherRepeatRecords] : undefined,
  };

  applyRepeatCleanup(nextSession, preview);

  return nextSession;
}
