import { describe, expect, it } from 'vitest';
import type { InvoiceCacheEntry } from './invoice-cache-state';
import {
  lookupTranBilling,
  mergeInvoiceCacheEntries,
  normalizeMonth,
  priorTranBilling,
} from './invoice-cache-state';

const sampleEntries: InvoiceCacheEntry[] = [
  {
    contactId: '003A',
    studentName: '山田',
    monthKey: '2026/04',
    invoiceNo: 'INV-1',
    billedKoma: 4,
    paidKoma: 2,
    syncedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    contactId: '003A',
    studentName: '山田',
    monthKey: '2026/05',
    invoiceNo: 'INV-2',
    billedKoma: 4,
    paidKoma: 4,
    syncedAt: '2026-06-01T00:00:00.000Z',
  },
  {
    contactId: '003B',
    studentName: '佐藤',
    monthKey: '2025/12',
    invoiceNo: 'INV-3',
    billedKoma: 1,
    paidKoma: 1,
    syncedAt: '2026-06-01T00:00:00.000Z',
  },
];

describe('invoice-cache-state', () => {
  it('normalizeMonth accepts YYYY/MM, YYYY-MM, YYYYMM', () => {
    expect(normalizeMonth('2026/04')).toBe('2026/04');
    expect(normalizeMonth('2026-04')).toBe('2026/04');
    expect(normalizeMonth('202604')).toBe('2026/04');
    expect(normalizeMonth('')).toBe('');
  });

  it('lookupTranBilling sums koma for student and month', () => {
    expect(lookupTranBilling(sampleEntries, '山田', '2026/04')).toEqual({ billing: 4, paid: 2 });
    expect(lookupTranBilling(sampleEntries, '山田', '2026/06')).toEqual({ billing: 0, paid: 0 });
  });

  it('priorTranBilling sums months before fiscal year start', () => {
    expect(priorTranBilling(sampleEntries, '山田', '2026/04')).toEqual({ billing: 0, paid: 0 });
    expect(priorTranBilling(sampleEntries, '佐藤', '2026/04')).toEqual({ billing: 1, paid: 1 });
  });

  it('mergeInvoiceCacheEntries replaces only filtered month', () => {
    const incoming: InvoiceCacheEntry[] = [
      {
        contactId: '003A',
        studentName: '山田',
        monthKey: '2026/04',
        invoiceNo: 'INV-NEW',
        billedKoma: 8,
        paidKoma: 8,
        syncedAt: '2026-06-02T00:00:00.000Z',
      },
    ];
    const merged = mergeInvoiceCacheEntries(sampleEntries, incoming, '2026/04');
    expect(merged).toHaveLength(3);
    expect(lookupTranBilling(merged, '山田', '2026/04')).toEqual({ billing: 8, paid: 8 });
    expect(lookupTranBilling(merged, '山田', '2026/05')).toEqual({ billing: 4, paid: 4 });
  });

  it('lookupTranBilling prefers contactId when provided', () => {
    const cache: InvoiceCacheEntry[] = [
      {
        contactId: '003A',
        studentName: '山田',
        monthKey: '2026/04',
        invoiceNo: 'INV-1',
        billedKoma: 4,
        paidKoma: 2,
        syncedAt: '2026-06-01T00:00:00.000Z',
      },
      {
        contactId: '003B',
        studentName: '山田',
        monthKey: '2026/04',
        invoiceNo: 'INV-2',
        billedKoma: 9,
        paidKoma: 1,
        syncedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    expect(lookupTranBilling(cache, '山田', '2026/04', '003B')).toEqual({ billing: 9, paid: 1 });
  });
});
