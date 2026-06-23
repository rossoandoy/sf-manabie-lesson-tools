import type { AttendanceStatus } from './booth-attendance';

/** TRG booth attendance → MANAERP Student_Session picklist API values */
const TRG_TO_MANAERP: Record<string, string> = {
  出席: 'Attend',
  欠席: 'Absent',
  休講: 'Absent',
};

/** MANAERP API values / labels → TRG booth attendance */
const MANAERP_TO_TRG: Record<string, AttendanceStatus | ''> = {
  Attend: '出席',
  Absent: '欠席',
  Late: '出席',
  'Leave Early': '欠席',
  'Late, Leave Early': '欠席',
  出席: '出席',
  欠席: '欠席',
};

export interface ManaerpAttendanceWrite {
  attendanceStatus: string;
  attendanceNote?: string;
}

export function trgAttendanceToManaerpWrite(
  status: AttendanceStatus | '' | undefined,
): ManaerpAttendanceWrite | undefined {
  if (!status || status === '未確定' || status === '振替') return undefined;
  const attendanceStatus = TRG_TO_MANAERP[status];
  if (!attendanceStatus) return undefined;
  if (status === '休講') {
    return { attendanceStatus, attendanceNote: '休講' };
  }
  return { attendanceStatus };
}

export function trgAttendanceToManaerp(status: AttendanceStatus | '' | undefined): string | undefined {
  return trgAttendanceToManaerpWrite(status)?.attendanceStatus;
}

export function manaerpAttendanceToTrg(value: string | null | undefined): AttendanceStatus | '' {
  if (!value?.trim()) return '';
  const trimmed = value.trim();
  return MANAERP_TO_TRG[trimmed] ?? '';
}

export function isKnownManaerpAttendance(value: string | null | undefined): boolean {
  if (!value?.trim()) return true;
  return Boolean(manaerpAttendanceToTrg(value));
}
