import type {
  ExecuteOptions,
  ExecutionBatchLog,
  ExecutionLog,
  ExecutionRowResult,
  ImportBatch,
  ImportPlanRecord,
  SalesforceApiClient,
  ScheduleImportPlan,
  ClosedDateImportPlan,
  LessonSlotImportPlan,
  StudentSessionUpdatePlan,
  StudentSessionCreatePlan,
  ReallocationPlan,
} from '../contracts';
import { isProductionWriteAllowed, productionBlockedReason } from '../../lib/production-guard';

type AnyPlan = ScheduleImportPlan | ClosedDateImportPlan | LessonSlotImportPlan | StudentSessionUpdatePlan | StudentSessionCreatePlan | ReallocationPlan;

function containsApiPlaceholder(value: unknown): boolean {
  if (typeof value === 'string') return /<[^>]+>/.test(value);
  if (Array.isArray(value)) return value.some(containsApiPlaceholder);
  if (value && typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(
      ([key, nested]) => /<[^>]+>/.test(key) || containsApiPlaceholder(nested),
    );
  }
  return false;
}

function assertExecutionAllowed(plan: AnyPlan, options: ExecuteOptions): void {
  if (!options.confirmed) throw new Error('Execution requires explicit user confirmation.');
  const isSandbox = plan.targetOrg.isSandbox === true;
  const prodReason = productionBlockedReason(plan.targetOrg.orgId, isSandbox);
  if (prodReason && !options.allowProductionWrites) throw new Error(prodReason);
  if (!isProductionWriteAllowed(plan.targetOrg.orgId, isSandbox) && !options.allowProductionWrites) {
    throw new Error('Production writes are blocked by default. Use Sandbox for the initial MVP.');
  }
  if (plan.executionPolicy.confirmationPhrase && options.confirmationPhrase !== plan.executionPolicy.confirmationPhrase) {
    throw new Error('Confirmation phrase does not match.');
  }
  if (plan.executionPolicy.blockIfPlaceholdersRemain !== false && containsApiPlaceholder(plan.batches)) {
    throw new Error('ImportPlan still contains placeholder object or field API names.');
  }
  const errors = plan.validationIssues.filter((issue) => issue.severity === 'error');
  if (errors.length) throw new Error(`Validation failed: ${errors[0]?.message}`);
}

export function sortBatchesByDependency(batches: ImportBatch[]): ImportBatch[] {
  const remaining = new Map(batches.map((batch) => [batch.batchId, batch]));
  const done = new Set<string>();
  const sorted: ImportBatch[] = [];
  while (remaining.size) {
    let progressed = false;
    for (const [batchId, batch] of Array.from(remaining.entries())) {
      const deps = batch.dependsOn ?? [];
      if (deps.every((dep) => done.has(dep))) {
        sorted.push(batch);
        done.add(batchId);
        remaining.delete(batchId);
        progressed = true;
      }
    }
    if (!progressed) throw new Error(`ImportPlan has circular or missing dependencies: ${Array.from(remaining.keys()).join(', ')}`);
  }
  return sorted;
}

function resolveValue(value: unknown, refMap: Record<string, string>): unknown {
  if (typeof value === 'string') {
    const exact = value.match(/^\{\{ref:([^}]+)}}$/);
    if (exact) {
      const id = refMap[exact[1]!];
      if (!id) throw new Error(`Missing Salesforce ID for local reference: ${exact[1]}`);
      return id;
    }
    return value.replace(/\{\{ref:([^}]+)}}/g, (_match, ref) => {
      const id = refMap[ref];
      if (!id) throw new Error(`Missing Salesforce ID for local reference: ${ref}`);
      return id;
    });
  }
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, refMap));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, resolveValue(nested, refMap)]),
    );
  }
  return value;
}

function resolveRecord(record: ImportPlanRecord, refMap: Record<string, string>): ImportPlanRecord {
  return { ...record, fields: resolveValue(record.fields, refMap) as Record<string, unknown> };
}

async function executeBatch(
  api: SalesforceApiClient,
  batch: ImportBatch,
  refMap: Record<string, string>,
  dryRun: boolean,
): Promise<ExecutionBatchLog> {
  const rowResults: ExecutionRowResult[] = [];
  const useUpsertCollection =
    batch.operation === 'upsert' &&
    batch.records.length > 0 &&
    batch.externalIdField &&
    typeof api.upsertRecordCollection === 'function';
  const useCreateCollection =
    batch.operation === 'create' &&
    batch.records.length > 1 &&
    batch.records.every((r) => !r.salesforceId) &&
    typeof api.createRecordCollection === 'function';

  if (useUpsertCollection && api.upsertRecordCollection && batch.externalIdField) {
    const chunkSize = 200;
    const externalIdField = batch.externalIdField;
    for (let i = 0; i < batch.records.length; i += chunkSize) {
      const chunk = batch.records.slice(i, i + chunkSize).map((r) => resolveRecord(r, refMap));
      if (dryRun) {
        chunk.forEach((r) => {
          refMap[r.localRef] = `DRY_RUN_${r.localRef}`;
          rowResults.push({ localRef: r.localRef, success: true, salesforceId: refMap[r.localRef] });
        });
        continue;
      }
      const results = await api.upsertRecordCollection(
        batch.sobjectApiName,
        externalIdField,
        chunk.map((r) => r.fields),
      );
      chunk.forEach((record, idx) => {
        const result = results[idx];
        if (result?.success && result.id) {
          refMap[record.localRef] = result.id;
          rowResults.push({ localRef: record.localRef, success: true, salesforceId: result.id });
        } else {
          rowResults.push({
            localRef: record.localRef,
            success: false,
            errorMessage: result?.errors?.map((e) => e.message).join('; ') ?? 'Unknown error',
          });
        }
      });
    }
  } else if (useCreateCollection && api.createRecordCollection) {
    const chunkSize = 200;
    for (let i = 0; i < batch.records.length; i += chunkSize) {
      const chunk = batch.records.slice(i, i + chunkSize).map((r) => resolveRecord(r, refMap));
      if (dryRun) {
        chunk.forEach((r) => {
          refMap[r.localRef] = `DRY_RUN_${r.localRef}`;
          rowResults.push({ localRef: r.localRef, success: true, salesforceId: refMap[r.localRef] });
        });
        continue;
      }
      const results = await api.createRecordCollection(
        batch.sobjectApiName,
        chunk.map((r) => r.fields),
      );
      chunk.forEach((record, idx) => {
        const result = results[idx];
        if (result?.success && result.id) {
          refMap[record.localRef] = result.id;
          rowResults.push({ localRef: record.localRef, success: true, salesforceId: result.id });
        } else {
          rowResults.push({
            localRef: record.localRef,
            success: false,
            errorMessage: result?.errors?.map((e) => e.message).join('; ') ?? 'Unknown error',
          });
        }
      });
    }
  } else {
    for (const record of batch.records) {
      const resolved = resolveRecord(record, refMap);
      if (dryRun) {
        refMap[record.localRef] = `DRY_RUN_${record.localRef}`;
        rowResults.push({ localRef: record.localRef, success: true, salesforceId: refMap[record.localRef] });
        continue;
      }
      try {
        if (batch.operation === 'upsert' && batch.externalIdField) {
          const extField = batch.externalIdField;
          const extValue = String(resolved.fields[extField] ?? '');
          const fields = { ...resolved.fields };
          delete fields[extField];
          const result = await api.upsertRecord(batch.sobjectApiName, extField, extValue, fields);
          refMap[record.localRef] = result.id;
          rowResults.push({ localRef: record.localRef, success: true, salesforceId: result.id });
        } else if (batch.operation === 'update') {
          const id = String(resolved.salesforceId ?? resolved.fields.Id ?? '');
          if (!id) throw new Error(`Update record ${record.localRef} is missing Salesforce Id`);
          const fields = { ...resolved.fields };
          delete fields.Id;
          const result = await api.updateRecord(batch.sobjectApiName, id, fields);
          refMap[record.localRef] = result.id ?? id;
          rowResults.push({ localRef: record.localRef, success: true, salesforceId: refMap[record.localRef] });
        } else {
          const result = await api.createRecord(batch.sobjectApiName, resolved.fields);
          refMap[record.localRef] = result.id;
          rowResults.push({ localRef: record.localRef, success: true, salesforceId: result.id });
        }
      } catch (error) {
        rowResults.push({
          localRef: record.localRef,
          success: false,
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  return {
    batchId: batch.batchId,
    artifactKind: batch.artifactKind,
    sobjectApiName: batch.sobjectApiName,
    operation: batch.operation,
    rowResults,
  };
}

export async function executeImportPlan(
  plan: AnyPlan,
  api: SalesforceApiClient,
  options: ExecuteOptions,
): Promise<ExecutionLog> {
  assertExecutionAllowed(plan, options);
  const startedAt = new Date().toISOString();
  const refMap: Record<string, string> = {};
  const batchLogs: ExecutionBatchLog[] = [];

  for (const batch of sortBatchesByDependency(plan.batches)) {
    options.onBatchStart?.(batch);
    const batchLog = await executeBatch(api, batch, refMap, options.dryRun === true);
    batchLogs.push(batchLog);
    options.onBatchFinish?.(batchLog);
    if (batchLog.rowResults.some((row) => !row.success)) break;
  }

  const success = batchLogs.every((log) => log.rowResults.every((row) => row.success));
  return {
    planId: plan.planId,
    startedAt,
    finishedAt: new Date().toISOString(),
    success,
    batchLogs,
    errorMessage: success ? undefined : 'One or more rows failed',
  };
}

export function buildRetryPlan(plan: AnyPlan, log: ExecutionLog): AnyPlan | null {
  const failedRefs = new Set(
    log.batchLogs.flatMap((batch) => batch.rowResults.filter((row) => !row.success).map((row) => row.localRef)),
  );
  if (!failedRefs.size) return null;
  const batches = plan.batches
    .map((batch) => ({
      ...batch,
      records: batch.records.filter((record) => failedRefs.has(record.localRef)),
    }))
    .filter((batch) => batch.records.length > 0);
  return { ...plan, planId: `${plan.planId}-retry`, createdAt: new Date().toISOString(), batches };
}
