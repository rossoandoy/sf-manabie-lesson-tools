import type {
  ClosedDateDefinition,
  ClosedDateImportPlan,
  LessonDiscoveryConfig,
  LessonMasterCatalog,
  ValidationIssue,
} from '../contracts';
import { DEFAULT_DISCOVERY_CONFIG, SANDBOX_CONFIRMATION_PHRASE } from '../contracts';

function validateClosedDate(def: ClosedDateDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!def.title.trim()) {
    issues.push({ severity: 'error', code: 'REQUIRED', message: '休校日名は必須です', definitionId: def.id, field: 'title' });
  }
  if (!def.date) {
    issues.push({ severity: 'error', code: 'REQUIRED', message: '日付は必須です', definitionId: def.id, field: 'date' });
  }
  if (!def.academicYearId) {
    issues.push({ severity: 'error', code: 'REQUIRED', message: '年度を選択してください', definitionId: def.id, field: 'academicYearId' });
  }
  return issues;
}

export function buildClosedDateImportPlan(input: {
  definitions: ClosedDateDefinition[];
  catalog: LessonMasterCatalog;
  locationId: string;
  locationName: string;
  academicCalendarId: string;
  discovery?: LessonDiscoveryConfig;
}): ClosedDateImportPlan {
  const config = input.discovery ?? DEFAULT_DISCOVERY_CONFIG;
  const f = config.fields;
  const validationIssues = input.definitions.flatMap(validateClosedDate);
  if (!input.locationId) {
    validationIssues.push({ severity: 'error', code: 'REQUIRED', message: '拠点を選択してください', field: 'locationId' });
  }
  if (!input.academicCalendarId) {
    validationIssues.push({ severity: 'error', code: 'REQUIRED', message: 'Academic Calendar を選択してください', field: 'academicCalendarId' });
  }

  const closedDateRecords = input.definitions.map((def, index) => ({
    localRef: `closed:${index}`,
    fields: {
      [f.closedDate.name]: def.title,
      [f.closedDate.dateTime]: `${def.date}T00:00:00+09:00`,
      [f.closedDate.academicYear]: def.academicYearId,
      [f.closedDate.academicCalendar]: input.academicCalendarId,
    },
  }));

  const junctionRecords = input.definitions.map((def, index) => ({
    localRef: `junction:${index}`,
    fields: {
      [f.academicCalendarClosedDate.closedDate]: `{{ref:closed:${index}}}`,
      [f.academicCalendarClosedDate.academicCalendar]: input.academicCalendarId,
    },
  }));

  return {
    planId: `closed-date-${Date.now()}`,
    createdAt: new Date().toISOString(),
    targetOrg: {
      orgId: input.catalog.org.orgId,
      username: input.catalog.org.username,
      instanceUrl: input.catalog.org.instanceUrl,
      isSandbox: input.catalog.org.isSandbox ?? true,
    },
    locationId: input.locationId,
    locationName: input.locationName,
    academicCalendarId: input.academicCalendarId,
    sourceDefinitions: input.definitions,
    batches: [
      {
        batchId: 'batch-closed-date',
        artifactKind: 'closedDate',
        sobjectApiName: config.closedDateObject,
        operation: 'create',
        records: closedDateRecords,
      },
      {
        batchId: 'batch-academic-calendar-closed-date',
        artifactKind: 'academicCalendarClosedDate',
        sobjectApiName: config.academicCalendarClosedDateObject,
        operation: 'create',
        dependsOn: ['batch-closed-date'],
        records: junctionRecords,
      },
    ],
    executionPolicy: {
      confirmationPhrase: SANDBOX_CONFIRMATION_PHRASE,
      productionWrites: 'blocked',
      blockIfPlaceholdersRemain: true,
    },
    validationIssues,
  };
}

export function closedDateDefinitionsToCsv(definitions: ClosedDateDefinition[]): string {
  const header = '休校日,日付,年度';
  const rows = definitions.map((def) =>
    [def.title, `${def.date}T00:00:00+09:00`, def.academicYearName]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(','),
  );
  return [header, ...rows].join('\n');
}
