import { describe, expect, it, beforeAll } from 'vitest';
import bundledTrg2 from '../../data/discovery-trg2-extuat.json';
import { syncInvoicesFromSalesforce, isInvoiceBillingConfigured } from './invoiceSyncService';
import { e2eOrgAlias, loadLiveCatalog, tryGetCliSession } from './e2e-live-helpers';
import type { LessonDiscoveryResult } from '../contracts';

const live = process.env.E2E_LIVE === '1';
const hasCliSession = live && tryGetCliSession() !== null;

function discoveryBilling() {
  const discovery = bundledTrg2 as LessonDiscoveryResult;
  return discovery.config.invoiceBilling ?? null;
}

describe.skipIf(!hasCliSession)('e2e invoice sandbox live (CLI)', () => {
  beforeAll(() => {
    if (!tryGetCliSession()) {
      throw new Error(
        `SF CLI session not found for alias "${e2eOrgAlias()}". Run: sf org login --alias ${e2eOrgAlias()}`,
      );
    }
  });

  it('queries MANAERP__Invoice__c without error', async () => {
    const billing = discoveryBilling();
    expect(isInvoiceBillingConfigured(billing)).toBe(true);

    const { api } = await loadLiveCatalog();
    const result = await syncInvoicesFromSalesforce(api, { billing });
    expect(result.recordCount).toBeGreaterThanOrEqual(0);
    expect(result.syncedAt).toBeTruthy();
    expect(result.billingConfigured).toBe(true);
  });

  it('uses bill_item subquery when billing fields are configured', async () => {
    const billing = discoveryBilling();
    expect(isInvoiceBillingConfigured(billing)).toBe(true);

    const { api } = await loadLiveCatalog();
    const result = await syncInvoicesFromSalesforce(api, {
      targetMonth: process.env.E2E_INVOICE_MONTH ?? '2026/04',
      billing,
    });
    expect(result.billingConfigured).toBe(true);
    if (result.entries.length > 0) {
      expect(result.entries.some((entry) => entry.billedKoma > 0)).toBe(true);
      expect(result.entries.some((entry) => entry.paidKoma > 0)).toBe(true);
    }
  }, 120_000);
});
