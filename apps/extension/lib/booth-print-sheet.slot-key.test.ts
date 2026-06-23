import { describe, expect, it } from 'vitest';
import {
  attendanceForSf,
  buildSfSlotKey,
  buildSlotKey,
  capacityLabelForSf,
} from './booth-print-sheet';

describe('booth-print-sheet slot keys', () => {
  it('builds local slot keys for UI matching', () => {
    expect(buildSlotKey('2026-06-10', 1, 2, 1)).toBe('2026-06-10|B1|P2|S1');
  });

  it('builds Salesforce external slot keys like Excel F19', () => {
    expect(buildSfSlotKey('001ABC', '2026-06-10', 3, 1, '山田')).toBe('001ABC_20260610_P3_B1_山田');
  });

  it('maps capacity labels for SF picklist', () => {
    expect(capacityLabelForSf(false)).toBe('1：2');
    expect(capacityLabelForSf(true)).toBe('1：1');
  });

  it('filters attendance values to SF picklist', () => {
    expect(attendanceForSf('出席')).toBe('出席');
    expect(attendanceForSf('未確定')).toBeUndefined();
    expect(attendanceForSf('休講')).toBeUndefined();
  });
});
