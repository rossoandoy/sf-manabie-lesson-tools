import { describe, expect, it } from 'vitest';
import { buildInvoiceSyncSoql, isInvoiceBillingConfigured, mapInvoiceRecords } from './invoiceSyncService';

describe('invoiceSyncService', () => {
  it('builds base SOQL without bill_item config', () => {
    const soql = buildInvoiceSyncSoql();
    expect(soql).toContain('FROM MANAERP__Invoice__c');
    expect(soql).not.toMatch(/FROM MANAERP__\w+__r\)/);
  });

  it('builds SOQL with bill_item subquery when configured', () => {
    const soql = buildInvoiceSyncSoql({
      targetMonth: '2026/04',
      billing: {
        billItemRelationship: 'MANAERP__Bill_Items__r',
        billedKomaField: 'MANAERP__Quantity__c',
        paidKomaField: 'MANAERP__Paid_Quantity__c',
      },
    });
    expect(soql).toContain("WHERE TRG_IF_RevenueMonth__c = '2026/04'");
    expect(soql).toContain(
      '(SELECT MANAERP__Quantity__c, MANAERP__Paid_Quantity__c FROM MANAERP__Bill_Items__r)',
    );
  });

  it('includes paidKomaWhenField in subquery when configured', () => {
    const soql = buildInvoiceSyncSoql({
      billing: {
        billItemRelationship: 'MANAERP__Invoice_Bill_Items__r',
        billedKomaField: 'TRG_Purchased_Slot__c',
        paidKomaField: 'TRG_Purchased_Slot__c',
        paidKomaWhenField: 'TRG_IF_PaidAmount__c',
      },
    });
    expect(soql).toContain('TRG_IF_PaidAmount__c');
  });

  it('normalizes month filter in WHERE clause', () => {
    const soql = buildInvoiceSyncSoql({ targetMonth: '202604' });
    expect(soql).toContain("WHERE TRG_IF_RevenueMonth__c = '2026/04'");
  });

  it('detects billing configuration', () => {
    expect(isInvoiceBillingConfigured(null)).toBe(false);
    expect(
      isInvoiceBillingConfigured({
        billItemRelationship: 'MANAERP__Invoice_Bill_Items__r',
        billedKomaField: 'MANAERP__Quantity__c',
      }),
    ).toBe(true);
  });

  it('maps invoice records and sums child koma fields', () => {
    const syncedAt = '2026-06-20T00:00:00.000Z';
    const entries = mapInvoiceRecords(
      [
        {
          MANAERP__Contact__c: '003X',
          MANAERP__Contact__r: { Name: '山田' },
          TRG_IF_RevenueMonth__c: '202604',
          Name: 'INV-100',
          MANAERP__Bill_Items__r: {
            records: [{ MANAERP__Quantity__c: 2 }, { MANAERP__Quantity__c: 3 }],
          },
        },
      ],
      {
        billItemRelationship: 'MANAERP__Bill_Items__r',
        billedKomaField: 'MANAERP__Quantity__c',
        paidKomaField: null,
      },
      syncedAt,
    );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.studentName).toBe('山田');
    expect(entries[0]?.monthKey).toBe('2026/04');
    expect(entries[0]?.billedKoma).toBe(5);
    expect(entries[0]?.paidKoma).toBe(0);
  });

  it('sums paid koma only when indicator field is populated', () => {
    const syncedAt = '2026-06-20T00:00:00.000Z';
    const entries = mapInvoiceRecords(
      [
        {
          MANAERP__Contact__c: '003X',
          MANAERP__Contact__r: { Name: '山田' },
          TRG_IF_RevenueMonth__c: '202604',
          Name: 'INV-200',
          MANAERP__Invoice_Bill_Items__r: {
            records: [
              { TRG_Purchased_Slot__c: 8, TRG_IF_PaidAmount__c: '21600' },
              { TRG_Purchased_Slot__c: 4, TRG_IF_PaidAmount__c: null },
              { TRG_Purchased_Slot__c: 2 },
            ],
          },
        },
      ],
      {
        billItemRelationship: 'MANAERP__Invoice_Bill_Items__r',
        billedKomaField: 'TRG_Purchased_Slot__c',
        paidKomaField: 'TRG_Purchased_Slot__c',
        paidKomaWhenField: 'TRG_IF_PaidAmount__c',
      },
      syncedAt,
    );
    expect(entries[0]?.billedKoma).toBe(14);
    expect(entries[0]?.paidKoma).toBe(8);
  });
});
