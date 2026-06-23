import { describe, expect, it } from 'vitest';
import { DEFAULT_BOOTH_SETTINGS, type BoothGridSettings } from './booth-session-state';

describe('booth session collapse settings', () => {
  it('preserves collapse flags when merging stored settings', () => {
    const stored: Partial<BoothGridSettings> = {
      settingsCollapsed: true,
      previewCollapsed: true,
    };
    const merged: BoothGridSettings = { ...DEFAULT_BOOTH_SETTINGS, ...stored };
    expect(merged.settingsCollapsed).toBe(true);
    expect(merged.previewCollapsed).toBe(true);
  });
});
