import { describe, expect, it } from 'vitest';
import { isProductionWriteAllowed, productionBlockedReason, PRODUCTION_GUARD } from './production-guard';

describe('production-guard', () => {
  it('allows Sandbox writes', () => {
    expect(isProductionWriteAllowed('00Dxxx', true)).toBe(true);
    expect(productionBlockedReason('00Dxxx', true)).toBeNull();
  });

  it('blocks Production by default', () => {
    expect(isProductionWriteAllowed('00Dprod', false)).toBe(false);
    expect(productionBlockedReason('00Dprod', false)).toMatch(/明示承認/);
  });

  it('keeps productionWritesEnabled false in MVP', () => {
    expect(PRODUCTION_GUARD.productionWritesEnabled).toBe(false);
    expect(PRODUCTION_GUARD.allowedOrgIds).toEqual([]);
  });
});
