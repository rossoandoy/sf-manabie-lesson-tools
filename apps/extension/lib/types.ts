/** Shared types for Manabie Product Master Assistant extension. */

export interface SoqlResult<T = Record<string, unknown>> {
  totalSize: number;
  done: boolean;
  records: T[];
  nextRecordsUrl?: string;
}

export interface SessionInfo {
  sessionId: string;
  hostname: string;
}

export interface ConnectionState {
  connected: boolean;
  hostname?: string;
  username?: string;
  orgId?: string;
  isSandbox?: boolean;
  sourceTabId?: number;
}

export interface GetStatusRequest {
  type: 'getStatus';
  tabId?: number;
}

export interface OrgIdentity {
  orgId: string;
  userId: string;
  username: string;
  instanceUrl: string;
  isSandbox: boolean;
}

export interface UiFieldRuleUnless {
  productField: string;
  equals: boolean | string | number;
}

export interface UiFieldRule {
  id: string;
  source: 'validationRule' | 'importValidationRule' | 'describe' | 'domain';
  objectApiName: string;
  fieldApiName: string;
  productTypeValue?: string;
  detailTypeValues?: string[];
  effect: 'required' | 'forbidden' | 'visible' | 'optional';
  unless?: UiFieldRuleUnless;
  validationName?: string;
  verifiedOnObjects?: string[];
}

export interface SalesforceDiscoveryResult {
  org: {
    orgId?: string;
    username?: string;
    instanceUrl?: string;
  };
  generatedAt: string;
  productObject: {
    apiName: string;
    label?: string;
    productTypeField?: string;
    fields?: Array<{
      apiName: string;
      label?: string;
      type?: string;
      createable?: boolean;
      updateable?: boolean;
      nillable?: boolean;
      picklistValues?: string[];
      referenceTo?: string[];
    }>;
  };
  relatedObjectCandidates: Array<{
    apiName: string;
    label?: string;
    role: string;
    confidence?: number;
    evidence?: string[];
    fields?: Array<{ apiName: string; label?: string; type?: string; referenceTo?: string[]; picklistValues?: string[] }>;
  }>;
  productTypeRules?: Array<{
    productTypeValue: string;
    detailObjectRole: string;
    detailObjectApiName?: string | null;
    detailTypeField?: string;
    detailTypePicklist?: string[];
    importObjectApiName?: string;
  }>;
  uiFieldRules?: UiFieldRule[];
  childRelationships?: unknown[];
  masterCatalog?: {
    productTagObjectApiName?: string;
    productTagNameField?: string;
    productTagCodeFields?: string[];
    productTagArchivedField?: string;
    productTagArchivedFilterValue?: boolean;
    /** Account fields for location picker filters (describe-confirmed). */
    locationFilterFields?: string[];
    locationFilterLabels?: Record<string, string>;
    /** Center + Operating sync filter (describe-confirmed). */
    locationSyncFilter?: {
      typeValue?: string;
      statusFieldApi?: string;
      statusValue?: string;
    } | null;
    queries?: Record<string, string>;
  };
  unresolved?: string[];
}

export type DashboardTab = 'masters' | 'product' | 'plan' | 'execute' | 'bulk' | 'queue';
