import type { InvoiceBillingConfig, SalesforceApiClient } from '../contracts';
import type { InvoiceCacheEntry } from '../../lib/invoice-cache-state';
import { normalizeMonth } from '../../lib/invoice-cache-state';

export interface InvoiceSyncOptions {
  targetMonth?: string;
  billing?: InvoiceBillingConfig | null;
}

export interface InvoiceSyncResult {
  entries: InvoiceCacheEntry[];
  recordCount: number;
  syncedAt: string;
  billingConfigured: boolean;
}

export function isInvoiceBillingConfigured(billing?: InvoiceBillingConfig | null): boolean {
  return Boolean(billing?.billItemRelationship?.trim() && billing?.billedKomaField?.trim());
}

function escapeSoql(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function childRows(record: Record<string, unknown>, relationshipName: string): Record<string, unknown>[] {
  const child = record[relationshipName];
  if (!child || typeof child !== 'object') return [];
  const records = (child as { records?: unknown[] }).records;
  if (!Array.isArray(records)) return [];
  return records.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object');
}

function fieldNumeric(value: unknown): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function isFieldPopulated(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  return true;
}

function sumChildField(
  record: Record<string, unknown>,
  relationshipName: string,
  fieldName: string,
): number {
  let total = 0;
  for (const row of childRows(record, relationshipName)) {
    total += fieldNumeric(row[fieldName]);
  }
  return total;
}

function sumChildFieldWhen(
  record: Record<string, unknown>,
  relationshipName: string,
  fieldName: string,
  whenFieldName: string,
): number {
  let total = 0;
  for (const row of childRows(record, relationshipName)) {
    if (!isFieldPopulated(row[whenFieldName])) continue;
    total += fieldNumeric(row[fieldName]);
  }
  return total;
}

export function buildInvoiceSyncSoql(options: InvoiceSyncOptions = {}): string {
  const billing = options.billing;
  const billRel = billing?.billItemRelationship?.trim() ?? '';
  const billKomaField = billing?.billedKomaField?.trim() ?? '';
  const paidKomaField = billing?.paidKomaField?.trim() ?? '';
  const paidKomaWhenField = billing?.paidKomaWhenField?.trim() ?? '';

  let subSelect = '';
  if (billRel && billKomaField) {
    const subFields = new Set<string>([billKomaField]);
    if (paidKomaField) subFields.add(paidKomaField);
    if (paidKomaWhenField) subFields.add(paidKomaWhenField);
    subSelect = `, (SELECT ${[...subFields].join(', ')} FROM ${billRel})`;
  }

  let soql =
    'SELECT MANAERP__Contact__c, MANAERP__Contact__r.Name, ' +
    'TRG_IF_RevenueMonth__c, Name, MANAERP__Total__c, MANAERP__Amount_Paid__c' +
    subSelect +
    ' FROM MANAERP__Invoice__c';

  const month = options.targetMonth?.trim();
  if (month) {
    const normalized = normalizeMonth(month);
    soql += ` WHERE TRG_IF_RevenueMonth__c = '${escapeSoql(normalized)}'`;
  }
  return soql;
}

export function mapInvoiceRecords(
  records: Record<string, unknown>[],
  billing: InvoiceBillingConfig | null | undefined,
  syncedAt: string,
): InvoiceCacheEntry[] {
  const billRel = billing?.billItemRelationship?.trim() ?? '';
  const billKomaField = billing?.billedKomaField?.trim() ?? '';
  const paidKomaField = billing?.paidKomaField?.trim() ?? '';
  const paidKomaWhenField = billing?.paidKomaWhenField?.trim() ?? '';
  const useChild = Boolean(billRel && billKomaField);

  return records.map((record) => {
    const contactRel = record.MANAERP__Contact__r;
    const studentName =
      contactRel && typeof contactRel === 'object'
        ? String((contactRel as Record<string, unknown>).Name ?? '').trim()
        : '';
    let billedKoma = 0;
    let paidKoma = 0;
    if (useChild) {
      billedKoma = sumChildField(record, billRel, billKomaField);
      if (paidKomaField) {
        paidKoma = paidKomaWhenField
          ? sumChildFieldWhen(record, billRel, paidKomaField, paidKomaWhenField)
          : sumChildField(record, billRel, paidKomaField);
      }
    }

    return {
      contactId: String(record.MANAERP__Contact__c ?? ''),
      studentName,
      monthKey: normalizeMonth(String(record.TRG_IF_RevenueMonth__c ?? '')),
      invoiceNo: String(record.Name ?? ''),
      billedKoma,
      paidKoma,
      syncedAt,
    };
  });
}

export async function syncInvoicesFromSalesforce(
  api: SalesforceApiClient,
  options: InvoiceSyncOptions = {},
): Promise<InvoiceSyncResult> {
  const syncedAt = new Date().toISOString();
  const soql = buildInvoiceSyncSoql(options);
  const { records } = await api.query<Record<string, unknown>>(soql);
  const entries = mapInvoiceRecords(records, options.billing, syncedAt);
  return {
    entries,
    recordCount: entries.length,
    syncedAt,
    billingConfigured: isInvoiceBillingConfigured(options.billing),
  };
}
