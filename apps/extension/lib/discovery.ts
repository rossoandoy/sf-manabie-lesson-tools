import type { ImportBatch, ImportPlan, ProductDefinition } from '../src/contracts';
import type { SalesforceDiscoveryResult } from './types';
import {
  BATCH_ID_TO_ROLE,
  pickLookupField,
  type DiscoveryFieldMeta,
} from './discovery-roles';

export { discoveryConfigFromResult } from './discovery-config';

export function containsPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return /<[^>]+>/.test(value);
  if (Array.isArray(value)) return value.some(containsPlaceholder);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => /<[^>]+>/.test(key) || containsPlaceholder(nested),
    );
  }
  return false;
}

export function applyDiscoveryToProductDefinition(
  definition: ProductDefinition,
  discovery: SalesforceDiscoveryResult,
): ProductDefinition {
  const productFields = discovery.productObject.fields ?? [];
  const labelToApi = new Map(
    productFields.filter((f) => f.label).map((f) => [f.label!, f.apiName]),
  );

  const customOverrides = definition.customOverrides.map((override) => {
    if (!override.fieldApiName.startsWith('<')) return override;
    const byLabel = override.label ? labelToApi.get(override.label) : undefined;
    if (byLabel) return { ...override, fieldApiName: byLabel };
    return override;
  });

  return { ...definition, customOverrides };
}

export function applyDiscoveryToImportPlan(
  plan: ImportPlan,
  discovery: SalesforceDiscoveryResult,
): ImportPlan {
  const roleMap = new Map(discovery.relatedObjectCandidates.map((c) => [c.role, c]));
  const productApiName = discovery.productObject.apiName;
  const droppedFields: string[] = [];

  const batches = plan.batches.map((batch) => {
    const baseBatchId = batch.batchId.replace(/-delete$/, '');
    const role = BATCH_ID_TO_ROLE[batch.batchId] ?? BATCH_ID_TO_ROLE[baseBatchId];
    const candidate = role ? roleMap.get(role) : undefined;
    const candidateFields = (candidate?.fields ?? []) as DiscoveryFieldMeta[];

    const sobjectApiName =
      batch.sobjectApiName.startsWith('<') && candidate?.apiName ? candidate.apiName : batch.sobjectApiName;

    const records = batch.records.map((record) => {
      const { resolved, dropped } = resolveRecordFieldsWithAudit(
        record.fields,
        candidateFields,
        discovery,
        productApiName,
        batch.batchId,
        record.localRef,
      );
      droppedFields.push(...dropped);
      return { ...record, fields: resolved };
    });

    return { ...batch, sobjectApiName, records };
  });

  const warnings = [...(plan.warnings ?? [])];
  if (droppedFields.length) {
    warnings.push(
      `Unresolved or dropped field placeholders (${droppedFields.length}): ${[...new Set(droppedFields)].slice(0, 8).join(', ')}${droppedFields.length > 8 ? '…' : ''}`,
    );
  }

  return { ...plan, batches, warnings };
}

function resolveRecordFieldsWithAudit(
  fields: Record<string, unknown>,
  candidateFields: DiscoveryFieldMeta[],
  discovery: SalesforceDiscoveryResult,
  productApiName: string,
  batchId: string,
  localRef: string,
): { resolved: Record<string, unknown>; dropped: string[] } {
  const resolved: Record<string, unknown> = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key.startsWith('<') && key.endsWith('>')) {
      const apiKey = resolvePlaceholderKey(key, candidateFields, discovery, productApiName);
      if (apiKey) resolved[apiKey] = value;
      else dropped.push(`${batchId}/${localRef}:${key}`);
      continue;
    }
    if (typeof value === 'string' && value.startsWith('<') && value.endsWith('>')) {
      continue;
    }
    if (value !== undefined && value !== null && value !== '') {
      resolved[key] = value;
    }
  }
  return { resolved, dropped };
}

function resolvePlaceholderKey(
  key: string,
  candidateFields: DiscoveryFieldMeta[],
  discovery: SalesforceDiscoveryResult,
  productApiName: string,
): string | null {
  const inner = key.slice(1, -1).replace(/_if_required$/i, '');

  if (/ProductLookupField/i.test(inner)) {
    return pickLookupField(candidateFields, productApiName);
  }
  if (/ProductTagLookupField/i.test(inner)) {
    const tagApi = discovery.relatedObjectCandidates.find((c) => c.role === 'productTag')?.apiName;
    return tagApi ? pickLookupField(candidateFields, tagApi) : null;
  }
  if (/CourseProductLookupField/i.test(inner)) {
    const cpApi = discovery.relatedObjectCandidates.find((c) => c.role === 'courseProduct')?.apiName;
    return cpApi ? pickLookupField(candidateFields, cpApi) : null;
  }
  if (/FeeProductLookupField/i.test(inner)) {
    const fpApi = discovery.relatedObjectCandidates.find((c) => c.role === 'feeProduct')?.apiName;
    return fpApi ? pickLookupField(candidateFields, fpApi) : null;
  }
  if (/MaterialProductLookupField/i.test(inner)) {
    const mpApi = discovery.relatedObjectCandidates.find((c) => c.role === 'materialProduct')?.apiName;
    return mpApi ? pickLookupField(candidateFields, mpApi) : null;
  }
  if (/CourseOfferingLookupField/i.test(inner)) {
    return pickLookupField(candidateFields, 'MANAERP__Course_Offering__c');
  }
  if (/LocationLookupField/i.test(inner)) {
    return (
      pickLookupField(candidateFields, 'Account') ??
      candidateFields.find((f) => /account__c$/i.test(f.apiName))?.apiName ??
      null
    );
  }
  if (/GradeLookupField/i.test(inner)) {
    return pickLookupField(candidateFields, 'MANAERP__Grade__c');
  }
  if (/TaxLookupField/i.test(inner)) {
    return pickLookupField(candidateFields, 'MANAERP__Tax__c');
  }
  if (/PriceTypeField/i.test(inner)) {
    return candidateFields.find((f) => /price.*type/i.test(f.apiName))?.apiName ?? null;
  }
  if (/AmountField/i.test(inner)) {
    return (
      candidateFields.find((f) => /amount/i.test(f.apiName))?.apiName ??
      candidateFields.find((f) => /price__c$/i.test(f.apiName))?.apiName ??
      null
    );
  }
  if (/WeightOrUnitCountField|CourseWeightField/i.test(inner)) {
    return (
      candidateFields.find((f) => /weight/i.test(f.apiName))?.apiName ??
      candidateFields.find((f) => /quantity/i.test(f.apiName))?.apiName ??
      null
    );
  }
  if (/MaxSlotsPerCourseField/i.test(inner)) {
    return candidateFields.find((f) => /max.*slot/i.test(f.apiName))?.apiName ?? null;
  }
  if (/RequiredFlagField|MandatoryFlagField/i.test(inner)) {
    return (
      candidateFields.find((f) => /mandatory.*flag/i.test(f.apiName))?.apiName ??
      candidateFields.find((f) => /required/i.test(f.apiName) && f.type === 'boolean')?.apiName ??
      null
    );
  }
  if (/PlacementRequiredField|RequireAllocationField/i.test(inner)) {
    return (
      candidateFields.find((f) => /require.*allocation/i.test(f.apiName))?.apiName ??
      candidateFields.find((f) => /placement/i.test(f.apiName))?.apiName ??
      null
    );
  }
  if (/AssociatedCourseField/i.test(inner)) {
    return (
      pickLookupField(candidateFields, 'MANAERP__Package_Course__c') ??
      pickLookupField(candidateFields, 'MANAERP__Course_Product_Course__c') ??
      candidateFields.find((f) => /associated.*course/i.test(f.apiName))?.apiName ??
      null
    );
  }
  if (/AssociatedFeeOfferingField/i.test(inner)) {
    return (
      candidateFields.find((f) => /associated_fee_offering/i.test(f.apiName))?.apiName ??
      pickLookupField(candidateFields, productApiName)
    );
  }
  if (/AssociatedMaterialOfferingField/i.test(inner)) {
    return (
      candidateFields.find((f) => /associated_material_offering/i.test(f.apiName))?.apiName ??
      pickLookupField(candidateFields, productApiName)
    );
  }
  if (/AcademicYearField/i.test(inner)) {
    return pickLookupField(candidateFields, 'MANAERP__Academic_Year__c');
  }
  if (/CourseTypeField/i.test(inner)) {
    return candidateFields.find((f) => /course_type/i.test(f.apiName))?.apiName ?? null;
  }
  if (/IsAddedByDefaultField/i.test(inner)) {
    return candidateFields.find((f) => /is_added_by_default/i.test(f.apiName) && f.type === 'boolean')?.apiName ?? null;
  }
  if (/ScopeField/i.test(inner)) {
    return candidateFields.find((f) => /scope/i.test(f.apiName))?.apiName ?? null;
  }
  if (/BillingPeriodField/i.test(inner)) {
    return candidateFields.find((f) => /billing.*period/i.test(f.apiName))?.apiName ?? null;
  }
  if (/StartDateOrMonthField/i.test(inner)) {
    return candidateFields.find((f) => /start/i.test(f.apiName))?.apiName ?? null;
  }
  if (/EndDateOrMonthField/i.test(inner)) {
    return candidateFields.find((f) => /end/i.test(f.apiName))?.apiName ?? null;
  }
  if (/CurrencyIsoCodeField/i.test(inner)) {
    return candidateFields.find((f) => f.apiName === 'CurrencyIsoCode')?.apiName ?? null;
  }

  return null;
}

export function exportBatchToCsv(batch: ImportBatch): string {
  if (!batch.records.length) return '';
  const headers = new Set<string>();
  for (const record of batch.records) {
    Object.keys(record.fields).forEach((k) => headers.add(k));
  }
  const cols = ['localRef', ...headers];
  const lines = [cols.join(',')];
  for (const record of batch.records) {
    const row = cols.map((col) => {
      if (col === 'localRef') return escapeCsv(record.localRef);
      const val = record.fields[col];
      return escapeCsv(val == null ? '' : String(val));
    });
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadAllArtifactCsvs(plan: ImportPlan, baseName: string): number {
  let count = 0;
  const safeBase = baseName.replace(/[^\w\-]/g, '_') || 'import-plan';
  for (const batch of plan.batches.filter((b) => b.artifactKind)) {
    const csv = exportBatchToCsv(batch);
    if (!csv) continue;
    downloadCsv(`${safeBase}_${batch.batchId}.csv`, csv);
    count += 1;
  }
  return count;
}
