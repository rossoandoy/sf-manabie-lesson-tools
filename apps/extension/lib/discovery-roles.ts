/** Maps discovery roles to ImportPlan batchIds and field placeholder resolution. */

export interface DiscoveryRoleConfig {
  role: string;
  batchId: string | null;
  label: string;
  childNamePatterns: RegExp[];
}

export const DISCOVERY_ROLES: DiscoveryRoleConfig[] = [
  {
    role: 'productTag',
    batchId: null,
    label: '商品タグマスタ',
    childNamePatterns: [/Accounting_Category__c$/i, /Product_Tag__c$/i, /ProductTag__c$/i],
  },
  {
    role: 'productProductTagJunction',
    batchId: 'product-product-tag',
    label: '商品-商品タグ',
    childNamePatterns: [/Product_Offering_Product_Tags__c$/i, /Product_Product_Tag__c$/i],
  },
  {
    role: 'productLocation',
    batchId: 'product-location',
    label: '商品の拠点',
    childNamePatterns: [/Product_Location__c$/i],
  },
  {
    role: 'productGrade',
    batchId: 'product-grade',
    label: '商品の学年',
    childNamePatterns: [/Product_Grade__c$/i],
  },
  {
    role: 'productPrice',
    batchId: 'product-price',
    label: '商品価格',
    childNamePatterns: [/Product_Price__c$/i],
  },
  {
    role: 'courseProduct',
    batchId: 'course-product-detail',
    label: 'コース商品',
    childNamePatterns: [/Package__c$/i, /Course_Product__c$/i],
  },
  {
    role: 'courseProductCourse',
    batchId: 'course-product-course',
    label: 'コース商品コース',
    childNamePatterns: [/Package_Course__c$/i, /Course_Product_Course__c$/i],
  },
  {
    role: 'feeProduct',
    batchId: 'fee-product-detail',
    label: '料金商品',
    childNamePatterns: [/Fee__c$/i],
  },
  {
    role: 'materialProduct',
    batchId: 'material-product-detail',
    label: '教材商品',
    childNamePatterns: [/Material__c$/i],
  },
  {
    role: 'packageCourseFee',
    batchId: 'package-course-fee',
    label: 'コース商品料金',
    childNamePatterns: [/Package_Course_Fee__c$/i],
  },
  {
    role: 'packageCourseMaterial',
    batchId: 'package-course-material',
    label: 'コース商品教材',
    childNamePatterns: [/Package_Course_Material__c$/i],
  },
];

export const ROLE_TO_BATCH_ID = Object.fromEntries(
  DISCOVERY_ROLES.filter((r) => r.batchId).map((r) => [r.role, r.batchId!]),
);

export const BATCH_ID_TO_ROLE = Object.fromEntries(
  DISCOVERY_ROLES.filter((r) => r.batchId).map((r) => [r.batchId!, r.role]),
);

/** Placeholder key substrings -> field resolution hint */
export const PLACEHOLDER_FIELD_HINTS: Array<{ pattern: RegExp; hint: string }> = [
  { pattern: /ProductLookupField/i, hint: 'productLookup' },
  { pattern: /ProductTagLookupField/i, hint: 'productTagLookup' },
  { pattern: /CourseProductLookupField/i, hint: 'courseProductLookup' },
  { pattern: /FeeProductLookupField/i, hint: 'feeProductLookup' },
  { pattern: /MaterialProductLookupField/i, hint: 'materialProductLookup' },
  { pattern: /CourseOfferingLookupField/i, hint: 'courseOfferingLookup' },
  { pattern: /LocationLookupField/i, hint: 'locationLookup' },
  { pattern: /GradeLookupField/i, hint: 'gradeLookup' },
  { pattern: /PriceTypeField/i, hint: 'priceType' },
  { pattern: /AmountField/i, hint: 'amount' },
  { pattern: /WeightOrUnitCountField/i, hint: 'weight' },
  { pattern: /TaxLookupField/i, hint: 'taxLookup' },
  { pattern: /StartDateOrMonthField/i, hint: 'startDate' },
  { pattern: /EndDateOrMonthField/i, hint: 'endDate' },
  { pattern: /BillingPeriodField/i, hint: 'billingPeriod' },
  { pattern: /ScopeField/i, hint: 'scope' },
  { pattern: /RequiredFlagField/i, hint: 'required' },
  { pattern: /PlacementRequiredField/i, hint: 'placement' },
  { pattern: /MaxSlotsPerCourseField/i, hint: 'maxSlots' },
  { pattern: /CourseWeightField/i, hint: 'weight' },
  { pattern: /AssociatedCourseField/i, hint: 'associatedCourseLookup' },
  { pattern: /AssociatedFeeOfferingField/i, hint: 'associatedFeeOfferingLookup' },
  { pattern: /AssociatedMaterialOfferingField/i, hint: 'associatedMaterialOfferingLookup' },
  { pattern: /AcademicYearField/i, hint: 'academicYearLookup' },
  { pattern: /CourseTypeField/i, hint: 'courseType' },
  { pattern: /IsAddedByDefaultField/i, hint: 'isAddedByDefault' },
];

export interface DiscoveryFieldMeta {
  apiName: string;
  label?: string;
  type?: string;
  referenceTo?: string[];
}

export function inferRoleFromObjectApiName(apiName: string): string | null {
  for (const config of DISCOVERY_ROLES) {
    if (config.childNamePatterns.some((p) => p.test(apiName))) {
      return config.role;
    }
  }
  return null;
}

export function pickLookupField(
  fields: DiscoveryFieldMeta[] | undefined,
  referenceTo: string | string[],
): string | null {
  if (!fields?.length) return null;
  const targets = Array.isArray(referenceTo) ? referenceTo : [referenceTo];
  const match = fields.find(
    (f) => f.type === 'reference' && f.referenceTo?.some((r) => targets.includes(r)),
  );
  return match?.apiName ?? null;
}
