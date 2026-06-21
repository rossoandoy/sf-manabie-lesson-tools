import type { SalesforceDiscoveryResult } from './types';
import {
  pickLookupField,
  type DiscoveryFieldMeta,
} from './discovery-roles';

export type SoqlFieldHint =
  | 'productTagLookup'
  | 'gradeLookup'
  | 'locationLookup'
  | 'priceType'
  | 'amount'
  | 'quantity'
  | 'billingPeriod'
  | 'packageType'
  | 'maxSlot'
  | 'maxCourse'
  | 'packageStartDate'
  | 'packageEndDate'
  | 'lmsStartOffset'
  | 'lmsEndOffset'
  | 'feeType'
  | 'customBillingDate'
  | 'materialType'
  | 'courseOfferingLookup'
  | 'weight'
  | 'maxSlots'
  | 'mandatory'
  | 'requireAllocation'
  | 'academicYearLookup'
  | 'courseType'
  | 'sessionPerWeek'
  | 'sequenceNumber'
  | 'associatedCourseLookup'
  | 'associatedFeeOfferingLookup'
  | 'associatedMaterialOfferingLookup'
  | 'isAddedByDefault'
  | 'isAddedByDefaultInParentOrder'
  | 'isMandatoryInParentOrder'
  | 'availableFrom'
  | 'availableUntil';

const ROLE_FALLBACK_FIELDS: Record<string, Partial<Record<SoqlFieldHint, string>>> = {
  productProductTagJunction: { productTagLookup: 'MANAERP__Product_Tag__c' },
  productGrade: { gradeLookup: 'MANAERP__Grade__c' },
  productLocation: { locationLookup: 'MANAERP__Account__c' },
  productPrice: {
    priceType: 'MANAERP__Price_Type__c',
    amount: 'MANAERP__price__c',
    quantity: 'MANAERP__quantity__c',
    billingPeriod: 'MANAERP__Billing_Period__c',
  },
  courseProduct: {
    packageType: 'MANAERP__Package_Type__c',
    maxSlot: 'MANAERP__Max_Slot__c',
    maxCourse: 'MANAERP__Max_Course__c',
    packageStartDate: 'MANAERP__Package_Start_Date__c',
    packageEndDate: 'MANAERP__Package_End_Date__c',
    lmsStartOffset: 'MANAERP__LMS_Start_Date_Offset__c',
    lmsEndOffset: 'MANAERP__LMS_End_Date_Offset__c',
  },
  feeProduct: {
    feeType: 'MANAERP__Fee_Type__c',
    customBillingDate: 'MANAERP__Custom_Billing_Date__c',
  },
  materialProduct: {
    materialType: 'MANAERP__Material_Type__c',
    customBillingDate: 'MANAERP__Custom_Billing_Date__c',
  },
  courseProductCourse: {
    courseOfferingLookup: 'MANAERP__Course_Offering__c',
    weight: 'MANAERP__Course_Weight__c',
    maxSlots: 'MANAERP__Max_Slots_Per_Course__c',
    mandatory: 'MANAERP__Mandatory_Flag__c',
    requireAllocation: 'MANAERP__Require_Allocation__c',
    academicYearLookup: 'MANAERP__Academic_Year__c',
    courseType: 'MANAERP__Course_Type__c',
    sessionPerWeek: 'MANAERP__Session_Per_Week__c',
    sequenceNumber: 'MANAERP__Sequence_Number__c',
  },
  packageCourseFee: {
    associatedCourseLookup: 'MANAERP__Associated_Course__c',
    associatedFeeOfferingLookup: 'MANAERP__Associated_Fee_Offering__c',
    isAddedByDefault: 'MANAERP__Is_Added_By_Default__c',
    availableFrom: 'MANAERP__Available_From__c',
    availableUntil: 'MANAERP__Available_Until__c',
  },
  packageCourseMaterial: {
    associatedCourseLookup: 'MANAERP__Associated_Course__c',
    associatedMaterialOfferingLookup: 'MANAERP__Associated_Material_Offering__c',
    isAddedByDefault: 'MANAERP__Is_Added_By_Default__c',
    isAddedByDefaultInParentOrder: 'MANAERP__Is_Added_By_Default_In_Parent_Order__c',
    isMandatoryInParentOrder: 'MANAERP__Is_Mandatory_In_Parent_Order__c',
    availableFrom: 'MANAERP__Available_From__c',
    availableUntil: 'MANAERP__Available_Until__c',
  },
};

export function getCandidateFields(
  discovery: SalesforceDiscoveryResult | null | undefined,
  role: string,
): DiscoveryFieldMeta[] {
  if (!discovery) return [];
  const candidate = discovery.relatedObjectCandidates.find((c) => c.role === role);
  return (candidate?.fields ?? []) as DiscoveryFieldMeta[];
}

export function resolveSoqlFieldApi(
  discovery: SalesforceDiscoveryResult | null | undefined,
  role: string,
  hint: SoqlFieldHint,
): string | null {
  const fallback = ROLE_FALLBACK_FIELDS[role]?.[hint];
  const fields = getCandidateFields(discovery, role);
  const productApiName = discovery?.productObject?.apiName ?? 'MANAERP__Product__c';

  const fromDiscovery = resolveHintToApi(fields, hint, productApiName);
  return fromDiscovery ?? fallback ?? null;
}

function resolveHintToApi(
  fields: DiscoveryFieldMeta[],
  hint: SoqlFieldHint,
  productApiName: string,
): string | null {
  switch (hint) {
    case 'productTagLookup':
      return pickLookupField(fields, 'MANAERP__Accounting_Category__c') ?? fields.find((f) => /product_tag/i.test(f.apiName))?.apiName ?? null;
    case 'gradeLookup':
      return pickLookupField(fields, 'MANAERP__Grade__c');
    case 'locationLookup':
      return pickLookupField(fields, 'Account') ?? pickLookupField(fields, 'MANAERP__Account__c');
    case 'priceType':
      return fields.find((f) => /price.*type/i.test(f.apiName))?.apiName ?? null;
    case 'amount':
      return fields.find((f) => /price__c$/i.test(f.apiName))?.apiName ?? fields.find((f) => /amount/i.test(f.apiName))?.apiName ?? null;
    case 'quantity':
      return fields.find((f) => /quantity/i.test(f.apiName))?.apiName ?? null;
    case 'billingPeriod':
      return fields.find((f) => /billing.*period/i.test(f.apiName))?.apiName ?? null;
    case 'packageType':
      return fields.find((f) => /package_type/i.test(f.apiName))?.apiName ?? null;
    case 'maxSlot':
      return fields.find((f) => /max_slot__c$/i.test(f.apiName))?.apiName ?? null;
    case 'maxCourse':
      return fields.find((f) => /max_course/i.test(f.apiName))?.apiName ?? null;
    case 'packageStartDate':
      return fields.find((f) => /package_start/i.test(f.apiName))?.apiName ?? null;
    case 'packageEndDate':
      return fields.find((f) => /package_end/i.test(f.apiName))?.apiName ?? null;
    case 'lmsStartOffset':
      return fields.find((f) => /lms_start/i.test(f.apiName))?.apiName ?? null;
    case 'lmsEndOffset':
      return fields.find((f) => /lms_end/i.test(f.apiName))?.apiName ?? null;
    case 'feeType':
      return fields.find((f) => /fee_type/i.test(f.apiName))?.apiName ?? null;
    case 'materialType':
      return fields.find((f) => /material_type/i.test(f.apiName))?.apiName ?? null;
    case 'customBillingDate':
      return fields.find((f) => /custom_billing/i.test(f.apiName))?.apiName ?? null;
    case 'courseOfferingLookup':
      return pickLookupField(fields, 'MANAERP__Course_Offering__c');
    case 'weight':
      return fields.find((f) => /course_weight/i.test(f.apiName))?.apiName ?? fields.find((f) => /weight/i.test(f.apiName))?.apiName ?? null;
    case 'maxSlots':
      return fields.find((f) => /max.*slot/i.test(f.apiName))?.apiName ?? null;
    case 'mandatory':
      return fields.find((f) => /mandatory.*flag/i.test(f.apiName))?.apiName ?? null;
    case 'requireAllocation':
      return fields.find((f) => /require.*allocation/i.test(f.apiName))?.apiName ?? null;
    case 'academicYearLookup':
      return pickLookupField(fields, 'MANAERP__Academic_Year__c');
    case 'courseType':
      return fields.find((f) => /course_type/i.test(f.apiName))?.apiName ?? null;
    case 'sessionPerWeek':
      return fields.find((f) => /session_per_week/i.test(f.apiName))?.apiName ?? null;
    case 'sequenceNumber':
      return fields.find((f) => /sequence_number/i.test(f.apiName))?.apiName ?? null;
    case 'associatedCourseLookup':
      return (
        pickLookupField(fields, 'MANAERP__Package_Course__c') ??
        fields.find((f) => /associated.*course/i.test(f.apiName))?.apiName ??
        null
      );
    case 'associatedFeeOfferingLookup':
      return fields.find((f) => /associated_fee_offering/i.test(f.apiName))?.apiName ?? null;
    case 'associatedMaterialOfferingLookup':
      return fields.find((f) => /associated_material_offering/i.test(f.apiName))?.apiName ?? null;
    case 'isAddedByDefault':
      return fields.find((f) => /is_added_by_default/i.test(f.apiName) && f.type === 'boolean')?.apiName ?? null;
    case 'isAddedByDefaultInParentOrder':
      return fields.find((f) => /added_by_default_in_parent/i.test(f.apiName))?.apiName ?? null;
    case 'isMandatoryInParentOrder':
      return fields.find((f) => /mandatory_in_parent/i.test(f.apiName))?.apiName ?? null;
    case 'availableFrom':
      return fields.find((f) => /available_from/i.test(f.apiName))?.apiName ?? null;
    case 'availableUntil':
      return fields.find((f) => /available_until/i.test(f.apiName))?.apiName ?? null;
    default:
      return null;
  }
}

export function getObjectApiName(
  discovery: SalesforceDiscoveryResult | null | undefined,
  role: string,
  fallback: string,
): string {
  if (!discovery) return fallback;
  const candidate = discovery.relatedObjectCandidates.find((c) => c.role === role);
  return candidate?.apiName ?? fallback;
}

export function buildChildSelectSoql(params: {
  discovery: SalesforceDiscoveryResult | null | undefined;
  role: string;
  objectFallback: string;
  hints: SoqlFieldHint[];
  whereClause: string;
  limit?: number;
}): string {
  const { discovery, role, objectFallback, hints, whereClause, limit = 50 } = params;
  const objectApi = getObjectApiName(discovery, role, objectFallback);
  const selectParts = ['Id'];
  for (const hint of hints) {
    const api = resolveSoqlFieldApi(discovery, role, hint);
    if (api && !selectParts.includes(api)) selectParts.push(api);
  }
  return `SELECT ${selectParts.join(', ')} FROM ${objectApi} WHERE ${whereClause} LIMIT ${limit}`;
}

export function fieldFromRow(row: Record<string, unknown>, apiName: string | null): unknown {
  if (!apiName) return undefined;
  return row[apiName];
}
