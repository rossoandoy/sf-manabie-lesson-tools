import { STORAGE_KEYS, loadScoped, saveScoped } from './lesson-storage';

export interface InvoiceCacheEntry {
  contactId: string;
  studentName: string;
  monthKey: string;
  invoiceNo: string;
  billedKoma: number;
  paidKoma: number;
  syncedAt: string;
}

export interface InvoiceCacheState {
  entries: InvoiceCacheEntry[];
  lastSyncedAt: string | null;
}

/** Normalize revenue month to YYYY/MM (Excel M13 NormalizeMonth). */
export function normalizeMonth(input: string | null | undefined): string {
  const trimmed = (input ?? '').trim();
  if (!trimmed) return '';
  let digits = '';
  for (const ch of trimmed) {
    if (ch >= '0' && ch <= '9') digits += ch;
  }
  if (digits.length >= 6) {
    return `${digits.slice(0, 4)}/${digits.slice(4, 6)}`;
  }
  return trimmed;
}

function entryMatchesStudent(
  entry: InvoiceCacheEntry,
  studentName: string,
  contactId?: string,
): boolean {
  if (contactId?.trim()) return entry.contactId === contactId.trim();
  return entry.studentName === studentName;
}

export function lookupTranBilling(
  cache: InvoiceCacheEntry[],
  studentName: string,
  monthKey: string,
  contactId?: string,
): { billing: number; paid: number } {
  let billing = 0;
  let paid = 0;
  for (const entry of cache) {
    if (!entryMatchesStudent(entry, studentName, contactId)) continue;
    if (entry.monthKey !== monthKey) continue;
    billing += entry.billedKoma;
    paid += entry.paidKoma;
  }
  return { billing, paid };
}

export function priorTranBilling(
  cache: InvoiceCacheEntry[],
  studentName: string,
  fyStartKey: string,
  contactId?: string,
): { billing: number; paid: number } {
  let billing = 0;
  let paid = 0;
  for (const entry of cache) {
    if (!entryMatchesStudent(entry, studentName, contactId)) continue;
    if (entry.monthKey && entry.monthKey < fyStartKey) {
      billing += entry.billedKoma;
      paid += entry.paidKoma;
    }
  }
  return { billing, paid };
}

export function mergeInvoiceCacheEntries(
  existing: InvoiceCacheEntry[],
  incoming: InvoiceCacheEntry[],
  monthFilter?: string,
): InvoiceCacheEntry[] {
  const normalizedFilter = monthFilter ? normalizeMonth(monthFilter) : '';
  if (!normalizedFilter) return incoming;
  const kept = existing.filter((entry) => entry.monthKey !== normalizedFilter);
  return [...kept, ...incoming];
}

export async function loadInvoiceCache(hostname: string): Promise<InvoiceCacheState> {
  return (
    (await loadScoped<InvoiceCacheState>(hostname, STORAGE_KEYS.INVOICE_CACHE)) ?? {
      entries: [],
      lastSyncedAt: null,
    }
  );
}

export async function saveInvoiceCache(hostname: string, state: InvoiceCacheState): Promise<void> {
  await saveScoped(hostname, STORAGE_KEYS.INVOICE_CACHE, state);
}
