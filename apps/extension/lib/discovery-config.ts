import type { SalesforceDiscoveryResult } from './types';

const CODE_FIELD_CANDIDATES = [
  'MANAERP__accounting_category_id__c',
  'MANAERP__Tag_Code__c',
  'MANAERP__tag_code__c',
];

export function discoveryConfigFromResult(result: SalesforceDiscoveryResult | null) {
  if (!result) return {};

  const master = result.masterCatalog;
  const catalogExtras = {
    queries: master?.queries,
    locationFilterFields: master?.locationFilterFields,
    locationFilterLabels: master?.locationFilterLabels,
    locationSyncFilter: master?.locationSyncFilter,
  };

  if (master?.productTagObjectApiName) {
    const codeFields = master.productTagCodeFields ?? [];
    return {
      productTagObjectApiName: master.productTagObjectApiName,
      productTagNameField: master.productTagNameField ?? 'Name',
      productTagCodeField: codeFields[0],
      productTagExtraFields: codeFields.slice(1),
      productTagArchivedField: master.productTagArchivedField,
      productTagArchivedFilterValue: master.productTagArchivedFilterValue,
      ...catalogExtras,
    };
  }

  const tag = result.relatedObjectCandidates.find((c) => c.role === 'productTag');
  const codeFromFields =
    tag?.fields?.find((f) =>
      CODE_FIELD_CANDIDATES.some((c) => c.toLowerCase() === f.apiName.toLowerCase()),
    )?.apiName ??
    tag?.fields?.find(
      (f) =>
        f.apiName.toLowerCase().includes('code') ||
        f.apiName.toLowerCase().includes('accounting_category_id'),
    )?.apiName;

  return {
    productTagObjectApiName: tag?.apiName,
    productTagNameField: 'Name',
    productTagCodeField: codeFromFields,
    productTagExtraFields: tag?.fields
      ?.map((f) => f.apiName)
      .filter(
        (api) =>
          api !== 'Name' &&
          api !== 'Id' &&
          (api.toLowerCase().includes('code') ||
            api.toLowerCase().includes('accounting') ||
            api.toLowerCase().includes('number')),
      ),
    productTagArchivedField: 'MANAERP__Is_Archived__c',
    productTagArchivedFilterValue: false,
    ...catalogExtras,
  };
}
