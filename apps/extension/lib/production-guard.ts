/** Production write gating — disabled until explicit org approval (Phase N scaffold). */

export interface ProductionGuardConfig {
  /** Org IDs allowed for production writes when explicitly enabled. Empty = none. */
  allowedOrgIds: string[];
  /** Must be true in addition to allowlist match. Never set true in MVP builds. */
  productionWritesEnabled: boolean;
}

/** Default: no production writes. */
export const PRODUCTION_GUARD: ProductionGuardConfig = {
  allowedOrgIds: [],
  productionWritesEnabled: false,
};

export function isProductionWriteAllowed(orgId: string, isSandbox: boolean): boolean {
  if (isSandbox) return true;
  if (!PRODUCTION_GUARD.productionWritesEnabled) return false;
  return PRODUCTION_GUARD.allowedOrgIds.includes(orgId);
}

export function productionBlockedReason(orgId: string, isSandbox: boolean): string | null {
  if (isSandbox) return null;
  if (!PRODUCTION_GUARD.productionWritesEnabled) {
    return 'Production 書き込みは明示承認まで無効です（Phase N）。Sandbox のみ Execute 可能。';
  }
  if (!PRODUCTION_GUARD.allowedOrgIds.includes(orgId)) {
    return `Org ${orgId} は Production allowlist に含まれていません。`;
  }
  return null;
}
