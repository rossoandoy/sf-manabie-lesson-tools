import { describe, expect, it } from 'vitest';
import {
  BOOTH_FIELD_ORDER,
  fieldHintFromInput,
  isClipboardShortcut,
  nextFieldHint,
  parseSeatNumber,
  selectorForField,
} from './booth-grid-keyboard';

describe('booth-grid-keyboard', () => {
  it('cycles field order forward and backward', () => {
    expect(nextFieldHint('teacher')).toBe('seat1');
    expect(nextFieldHint('seat2-subject')).toBe('teacher');
    expect(nextFieldHint('seat1', true)).toBe('teacher');
    expect(nextFieldHint('teacher', true)).toBe('seat2-subject');
  });

  it('maps input dataset to field hint', () => {
    const teacher = document.createElement('input');
    teacher.dataset.teacher = '';
    teacher.dataset.date = '2026-06-16';
    expect(fieldHintFromInput(teacher)).toBe('teacher');

    const grade = document.createElement('input');
    grade.dataset.seat = '2-grade';
    expect(fieldHintFromInput(grade)).toBe('seat2-grade');
  });

  it('parseSeatNumber distinguishes seat 1 and 2 field keys', () => {
    expect(parseSeatNumber('1')).toBe(1);
    expect(parseSeatNumber('1-grade')).toBe(1);
    expect(parseSeatNumber('1-subject')).toBe(1);
    expect(parseSeatNumber('2')).toBe(2);
    expect(parseSeatNumber('2-subject')).toBe(2);
  });

  it('builds selectors for focus', () => {
    const ref = { date: '2026-06-16', booth: 2, period: 3 };
    expect(selectorForField(ref, 'teacher')).toContain('booth-teacher-input');
    expect(selectorForField(ref, 'seat1-subject')).toContain('data-seat="1-subject"');
  });

  it('detects clipboard shortcuts', () => {
    expect(isClipboardShortcut(new KeyboardEvent('keydown', { ctrlKey: true, key: 'c' }))).toBe('copy');
    expect(isClipboardShortcut(new KeyboardEvent('keydown', { metaKey: true, key: 'v' }))).toBe('paste');
    expect(isClipboardShortcut(new KeyboardEvent('keydown', { key: 'c' }))).toBeNull();
  });

  it('exports stable field order length', () => {
    expect(BOOTH_FIELD_ORDER.length).toBe(7);
  });
});
