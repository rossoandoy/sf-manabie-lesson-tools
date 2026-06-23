/** Account.Booth__c — 一部 org（Lesson_Slot 等と同名の別オブジェクトフィールドあり） */
export const ACCOUNT_BOOTH_COUNT_FIELD = 'Booth__c';

/** TRG 系 org の Account ブース数（trg2--extuat 実測） */
export const ACCOUNT_BOOTH_COUNT_FIELD_LEGACY = 'TRG_BoothCount__c';

const BOOTH_COUNT_FIELDS = [ACCOUNT_BOOTH_COUNT_FIELD, ACCOUNT_BOOTH_COUNT_FIELD_LEGACY] as const;

export const ACCOUNT_CAPACITY_FIELD = 'Capacity__c';

export interface AccountLocationFieldConfig {
  boothCountField: string;
  capacityField: string | null;
}

const TRG2_EXTUAT_HOST = 'trg2--extuat.sandbox.my.salesforce.com';

/** org ごとに describe 実測済みの Account フィールドを返す */
export function accountLocationFieldConfig(hostname?: string | null): AccountLocationFieldConfig {
  if (
    hostname === TRG2_EXTUAT_HOST ||
    (hostname != null && hostname.includes('trg2--extuat'))
  ) {
    return { boothCountField: ACCOUNT_BOOTH_COUNT_FIELD_LEGACY, capacityField: null };
  }
  return { boothCountField: ACCOUNT_BOOTH_COUNT_FIELD, capacityField: ACCOUNT_CAPACITY_FIELD };
}

/** Account 拠点マスタ同期用 SOQL（org ごとに存在するフィールドのみ SELECT） */
export function buildLocationAccountsSoql(hostname?: string | null): string {
  const { boothCountField, capacityField } = accountLocationFieldConfig(hostname);
  const capacityClause = capacityField ? `, ${capacityField}` : '';
  return (
    `SELECT Id, Name, MANAERP__Location_Type__c, MANAERP__Status__c, ` +
    `MANAERP__Academic_Calendar__c, ${boothCountField}${capacityClause} ` +
    `FROM Account WHERE MANAERP__Location_Type__c = 'Center' AND MANAERP__Status__c = 'Operating' ` +
    `ORDER BY Name LIMIT 2000`
  );
}

export function boothCountFromAccountFields(
  fields: Record<string, unknown> | undefined | null,
): number | null {
  if (!fields) return null;
  for (const key of BOOTH_COUNT_FIELDS) {
    const n = Number(fields[key]);
    if (Number.isFinite(n) && n >= 1) return Math.min(20, Math.floor(n));
  }
  return null;
}

export function boothCountFieldUsed(
  fields: Record<string, unknown> | undefined | null,
): string | null {
  if (!fields) return null;
  for (const key of BOOTH_COUNT_FIELDS) {
    const n = Number(fields[key]);
    if (Number.isFinite(n) && n >= 1) return key;
  }
  return null;
}
