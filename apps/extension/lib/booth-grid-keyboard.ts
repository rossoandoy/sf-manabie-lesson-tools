import type { BoothSlotRef } from './booth-session-state';

export type BoothFieldHint =
  | 'teacher'
  | 'seat1'
  | 'seat1-grade'
  | 'seat1-subject'
  | 'seat2'
  | 'seat2-grade'
  | 'seat2-subject';

export const BOOTH_FIELD_ORDER: BoothFieldHint[] = [
  'teacher',
  'seat1',
  'seat1-grade',
  'seat1-subject',
  'seat2',
  'seat2-grade',
  'seat2-subject',
];

export function nextFieldHint(current: BoothFieldHint, reverse = false): BoothFieldHint {
  const idx = BOOTH_FIELD_ORDER.indexOf(current);
  const safeIdx = idx >= 0 ? idx : 0;
  if (reverse) {
    return BOOTH_FIELD_ORDER[safeIdx <= 0 ? BOOTH_FIELD_ORDER.length - 1 : safeIdx - 1]!;
  }
  return BOOTH_FIELD_ORDER[safeIdx >= BOOTH_FIELD_ORDER.length - 1 ? 0 : safeIdx + 1]!;
}

export function parseSeatNumber(seatRaw: string | undefined): 1 | 2 {
  if (!seatRaw) return 1;
  if (seatRaw === '2' || seatRaw.startsWith('2-')) return 2;
  return 1;
}

export function fieldHintFromInput(input: HTMLElement): BoothFieldHint | null {
  if (input.dataset.teacher !== undefined) return 'teacher';
  const seat = input.dataset.seat;
  if (seat === '1') return 'seat1';
  if (seat === '2') return 'seat2';
  if (seat === '1-grade') return 'seat1-grade';
  if (seat === '2-grade') return 'seat2-grade';
  if (seat === '1-subject') return 'seat1-subject';
  if (seat === '2-subject') return 'seat2-subject';
  return null;
}

export function selectorForField(ref: BoothSlotRef, hint: BoothFieldHint): string {
  const base = `[data-date="${ref.date}"][data-booth="${ref.booth}"][data-period="${ref.period}"]`;
  switch (hint) {
    case 'teacher':
      return `.booth-teacher-input${base}`;
    case 'seat1':
      return `[data-picker="student"][data-seat="1"]${base}`;
    case 'seat2':
      return `[data-picker="student"][data-seat="2"]${base}`;
    case 'seat1-grade':
      return `input[data-seat="1-grade"]${base}`;
    case 'seat2-grade':
      return `input[data-seat="2-grade"]${base}`;
    case 'seat1-subject':
      return `select[data-seat="1-subject"]${base}`;
    case 'seat2-subject':
      return `select[data-seat="2-subject"]${base}`;
  }
}

export function isClipboardShortcut(event: KeyboardEvent): 'copy' | 'paste' | 'cut' | null {
  if (!(event.ctrlKey || event.metaKey)) return null;
  const key = event.key.toLowerCase();
  if (key === 'c') return 'copy';
  if (key === 'v') return 'paste';
  if (key === 'x') return 'cut';
  return null;
}
