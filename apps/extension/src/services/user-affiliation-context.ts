import type { CatalogRecord } from '../contracts';
import { getOrgIdentity, SfApiError, soqlQuery } from '../../lib/sf-api';
import type { BoothGridSession } from '../../lib/booth-session-state';
import {
  ACCOUNT_BOOTH_COUNT_FIELD,
  ACCOUNT_BOOTH_COUNT_FIELD_LEGACY,
  ACCOUNT_CAPACITY_FIELD,
  accountLocationFieldConfig,
  boothCountFromAccountFields,
} from '../../lib/booth-count-from-account';

export interface UserAffiliationContext {
  accountId: string;
  classroomName: string;
  boothCount: number;
  capacityLabel: string;
  source: 'affiliation' | 'manual';
}

export type AffiliationResolveReason = 'no_contact' | 'no_affiliation' | 'no_valid_center' | 'api_error';

export interface AffiliationResolveResult {
  context: UserAffiliationContext | null;
  reason?: AffiliationResolveReason;
  detail?: string;
}

export interface ResolveUserAffiliationOptions {
  /** Master-synced locations — avoids relationship SOQL on Affiliation → Account */
  locations?: CatalogRecord[];
}

/** sf-directvisit CLOSED_CENTER_NAMES — invalid default locations */
export const CLOSED_CENTER_NAMES = [
  '【使用不可】個別教室のトライ 多治見駅前校',
  '【閉校】トライプラス あけぼの町校',
  '【閉校】トライプラス 東仙台駅前校',
  '×トライプラス 蒔田校',
  '×トライプラス 日野駅前校',
] as const;

const AFFILIATION_OBJECT = 'MANAERP__Affiliation__c';

interface AffiliationAccountRow {
  Id?: string;
  Name?: string;
  Booth__c?: unknown;
  TRG_BoothCount__c?: unknown;
  Capacity__c?: unknown;
  MANAERP__Location_Type__c?: string;
  MANAERP__Status__c?: string;
}

interface AffiliationRow {
  MANAERP__Account__c?: string;
  MANAERP__Account__r?: AffiliationAccountRow;
}

function parseBoothCount(account: AffiliationAccountRow | undefined): number | null {
  return boothCountFromAccountFields(account as Record<string, unknown> | undefined);
}

function parseCapacityLabel(value: unknown): string {
  if (value === null || value === undefined) return '1:2';
  const text = String(value).trim();
  if (!text) return '1:2';
  if (text.includes('1:1') || text === '1') return '1:1';
  return '1:2';
}

function escapeSoql(value: string): string {
  return value.replace(/'/g, "\\'");
}

export function formatApiErrorDetail(error: unknown): string {
  if (!(error instanceof SfApiError)) {
    return error instanceof Error ? error.message : String(error);
  }
  const base = error.message;
  if (!error.body) return base;
  try {
    const parsed = JSON.parse(error.body) as { message?: string; errorCode?: string }[];
    if (Array.isArray(parsed) && parsed.length) {
      const parts = parsed.map((item) => item.message || item.errorCode).filter(Boolean);
      if (parts.length) return `${base} — ${parts.join('; ')}`;
    }
    const single = JSON.parse(error.body) as { message?: string };
    if (single.message) return `${base} — ${single.message}`;
  } catch {
    const trimmed = error.body.trim().slice(0, 200);
    if (trimmed) return `${base} — ${trimmed}`;
  }
  return base;
}

export function isValidCenterAccount(account: AffiliationAccountRow | undefined): boolean {
  if (!account?.Id) return false;
  const locationType = String(account.MANAERP__Location_Type__c ?? '');
  const status = String(account.MANAERP__Status__c ?? '');
  const name = String(account.Name ?? '');
  if (locationType !== 'Center' || status !== 'Operating') return false;
  if (CLOSED_CENTER_NAMES.includes(name as (typeof CLOSED_CENTER_NAMES)[number])) return false;
  return true;
}

export function catalogRecordToAccountRow(record: CatalogRecord): AffiliationAccountRow {
  const fields = record.fields ?? {};
  return {
    Id: record.id,
    Name: record.name,
    TRG_BoothCount__c: fields[ACCOUNT_BOOTH_COUNT_FIELD_LEGACY] ?? fields.TRG_BoothCount__c,
    Booth__c: fields[ACCOUNT_BOOTH_COUNT_FIELD] ?? fields.Booth__c,
    Capacity__c: fields[ACCOUNT_CAPACITY_FIELD] ?? fields.Capacity__c,
    MANAERP__Location_Type__c: String(fields.MANAERP__Location_Type__c ?? 'Center'),
    MANAERP__Status__c: String(fields.MANAERP__Status__c ?? 'Operating'),
  };
}

export function contextFromAccount(account: AffiliationAccountRow | undefined): UserAffiliationContext | null {
  if (!isValidCenterAccount(account)) return null;
  const accountId = String(account!.Id ?? '').trim();
  if (!accountId) return null;
  return {
    accountId,
    classroomName: String(account!.Name ?? ''),
    boothCount: parseBoothCount(account!) ?? DEFAULT_BOOTH_SETTINGS_FALLBACK.boothCount,
    capacityLabel: parseCapacityLabel(account![ACCOUNT_CAPACITY_FIELD] ?? account!.Capacity__c),
    source: 'affiliation',
  };
}

export function contextFromAffiliationRow(row: AffiliationRow): UserAffiliationContext | null {
  const account = row.MANAERP__Account__r;
  if (account?.Id) return contextFromAccount(account);
  const accountId = String(row.MANAERP__Account__c ?? '').trim();
  if (!accountId) return null;
  return null;
}

export function affiliationFailureMessage(result: AffiliationResolveResult): string {
  switch (result.reason) {
    case 'no_contact':
      return 'User に Contact が紐づいていません（MANAERP__ContactId__c または ContactId を確認）';
    case 'no_affiliation':
      return 'MANAERP__Affiliation__c に所属校舎がありません';
    case 'no_valid_center':
      return 'Affiliation の Account が有効な Center（Operating）ではありません';
    case 'api_error':
      return result.detail ? `Affiliation 取得エラー: ${result.detail}` : 'Affiliation 取得エラー';
    default:
      return '所属校舎を手動で選択してください';
  }
}

export function applyAffiliationToBoothSession(
  session: BoothGridSession,
  ctx: UserAffiliationContext,
): BoothGridSession {
  return {
    ...session,
    settings: {
      ...session.settings,
      accountId: ctx.accountId,
      classroomName: ctx.classroomName,
      boothCount: ctx.boothCount,
      oneToOneMode: ctx.capacityLabel === '1:1',
      accountSource: ctx.source,
    },
  };
}

async function fetchAccountsByIds(
  accountIds: string[],
  hostname: string,
): Promise<Map<string, AffiliationAccountRow>> {
  const unique = [...new Set(accountIds.filter(Boolean))];
  if (!unique.length) return new Map();
  const { boothCountField, capacityField } = accountLocationFieldConfig(hostname);
  const capacityClause = capacityField ? `, ${capacityField}` : '';
  const inClause = unique.map((id) => `'${escapeSoql(id)}'`).join(', ');
  const rows = await soqlQuery<AffiliationAccountRow>(
    `SELECT Id, Name, ${boothCountField}${capacityClause}, ` +
      `MANAERP__Location_Type__c, MANAERP__Status__c ` +
      `FROM Account WHERE Id IN (${inClause})`,
  );
  return new Map(rows.map((row) => [String(row.Id), row]));
}

async function resolveAccountForAffiliation(
  accountId: string,
  locations: CatalogRecord[] | undefined,
  accountCache: Map<string, AffiliationAccountRow>,
): Promise<AffiliationAccountRow | undefined> {
  const fromCatalog = locations?.find((loc) => loc.id === accountId);
  if (fromCatalog) return catalogRecordToAccountRow(fromCatalog);
  if (accountCache.has(accountId)) return accountCache.get(accountId);
  return undefined;
}

export async function resolveUserAffiliation(
  hostname: string,
  options: ResolveUserAffiliationOptions = {},
): Promise<AffiliationResolveResult> {
  try {
    const org = await getOrgIdentity(hostname);
    if (!org.userId) {
      return { context: null, reason: 'no_contact', detail: 'userId missing' };
    }

    const userRows = await soqlQuery<{ ContactId?: string; MANAERP__ContactId__c?: string }>(
      `SELECT ContactId, MANAERP__ContactId__c FROM User WHERE Id = '${escapeSoql(org.userId)}' LIMIT 1`,
    );
    const user = userRows[0];
    const contactId = String(user?.MANAERP__ContactId__c ?? user?.ContactId ?? '').trim();
    if (!contactId) {
      return { context: null, reason: 'no_contact' };
    }

    const affiliationRows = await soqlQuery<{ MANAERP__Account__c?: string }>(
      `SELECT MANAERP__Account__c FROM ${AFFILIATION_OBJECT} ` +
        `WHERE MANAERP__Contact__c = '${escapeSoql(contactId)}' ` +
        `ORDER BY CreatedDate ASC`,
    );
    if (!affiliationRows.length) {
      return { context: null, reason: 'no_affiliation' };
    }

    const accountIds = affiliationRows
      .map((row) => String(row.MANAERP__Account__c ?? '').trim())
      .filter(Boolean);
    const missingFromCatalog = accountIds.filter(
      (id) => !options.locations?.some((loc) => loc.id === id),
    );
    const accountCache = missingFromCatalog.length
      ? await fetchAccountsByIds(missingFromCatalog, hostname)
      : new Map<string, AffiliationAccountRow>();

    for (const accountId of accountIds) {
      const account = await resolveAccountForAffiliation(accountId, options.locations, accountCache);
      const ctx = contextFromAccount(account);
      if (ctx) return { context: ctx };
    }

    return { context: null, reason: 'no_valid_center' };
  } catch (error) {
    return { context: null, reason: 'api_error', detail: formatApiErrorDetail(error) };
  }
}

/** @deprecated Prefer resolveUserAffiliation for diagnostics */
export async function resolveUserAffiliationContext(
  hostname: string,
  options?: ResolveUserAffiliationOptions,
): Promise<UserAffiliationContext | null> {
  const result = await resolveUserAffiliation(hostname, options);
  return result.context;
}

const DEFAULT_BOOTH_SETTINGS_FALLBACK = { boothCount: 4 };
