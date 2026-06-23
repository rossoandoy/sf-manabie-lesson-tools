import { describe, expect, it } from 'vitest';
import {
  trgAttendanceToManaerp,
  trgAttendanceToManaerpWrite,
  manaerpAttendanceToTrg,
} from '../../lib/manaerp-attendance-map';

describe('manaerp-attendance-map', () => {
  it('maps TRG attend/absent to Manabie picklist values', () => {
    expect(trgAttendanceToManaerp('出席')).toBe('Attend');
    expect(trgAttendanceToManaerp('欠席')).toBe('Absent');
  });

  it('maps 休講 to Absent with note', () => {
    expect(trgAttendanceToManaerpWrite('休講')).toEqual({
      attendanceStatus: 'Absent',
      attendanceNote: '休講',
    });
  });

  it('returns undefined for unsupported TRG statuses', () => {
    expect(trgAttendanceToManaerp('振替')).toBeUndefined();
    expect(trgAttendanceToManaerp('未確定')).toBeUndefined();
  });

  it('maps Manabie values back to TRG booth attendance', () => {
    expect(manaerpAttendanceToTrg('Attend')).toBe('出席');
    expect(manaerpAttendanceToTrg('Absent')).toBe('欠席');
    expect(manaerpAttendanceToTrg('Late')).toBe('出席');
    expect(manaerpAttendanceToTrg('Leave Early')).toBe('欠席');
  });
});
