import { describe, expect, it, vi } from 'vitest';
import type { ImportBatch, SalesforceApiClient } from '../contracts';
import { executeImportPlan, sortBatchesByDependency } from './registrationExecutor';

describe('registrationExecutor', () => {
  it('sorts batches by dependency order', () => {
    const batches: ImportBatch[] = [
      {
        batchId: 'child',
        artifactKind: 'lessonScheduleTeacher',
        sobjectApiName: 'MANAERP__Lesson_Schedule_Teacher__c',
        operation: 'create',
        dependsOn: ['parent'],
        records: [],
      },
      {
        batchId: 'parent',
        artifactKind: 'lessonSchedule',
        sobjectApiName: 'MANAERP__Lesson_Schedule__c',
        operation: 'create',
        records: [],
      },
    ];
    const sorted = sortBatchesByDependency(batches);
    expect(sorted[0]?.batchId).toBe('parent');
    expect(sorted[1]?.batchId).toBe('child');
  });

  it('upserts records via collection API', async () => {
    const upsertRecordCollection = vi.fn(async () => [{ id: 'a5B001', success: true }]);
    const api: SalesforceApiClient = {
      createRecord: vi.fn(),
      upsertRecord: vi.fn(),
      upsertRecordCollection,
      updateRecord: vi.fn(),
      deleteRecord: vi.fn(),
      query: vi.fn(async () => ({ records: [] })),
    };
    const log = await executeImportPlan(
      {
        planId: 'slot-plan',
        createdAt: new Date().toISOString(),
        targetOrg: { orgId: '00DTEST', username: 'u@test.com', isSandbox: true },
        accountId: '001',
        accountName: 'Center',
        sourceRows: [],
        batches: [
          {
            batchId: 'batch-lesson-slot',
            artifactKind: 'lessonSlot',
            sobjectApiName: 'Lesson_Slot__c',
            operation: 'upsert',
            externalIdField: 'Slot_Key__c',
            records: [
              {
                localRef: 'slot-1',
                fields: {
                  Slot_Key__c: '001_20260610_P1_B1_山田',
                  Student_Name__c: '山田',
                },
              },
            ],
          },
        ],
        executionPolicy: {
          confirmationPhrase: 'EXECUTE SANDBOX',
          productionWrites: 'blocked',
          blockIfPlaceholdersRemain: true,
        },
        validationIssues: [],
      },
      api,
      { confirmed: true, confirmationPhrase: 'EXECUTE SANDBOX' },
    );
    expect(log.success).toBe(true);
    expect(upsertRecordCollection).toHaveBeenCalledWith(
      'Lesson_Slot__c',
      'Slot_Key__c',
      [{ Slot_Key__c: '001_20260610_P1_B1_山田', Student_Name__c: '山田' }],
    );
  });

  it('updates records via updateRecord', async () => {
    const updateRecord = vi.fn(async () => ({ id: 'a0ST001' }));
    const api: SalesforceApiClient = {
      createRecord: vi.fn(),
      upsertRecord: vi.fn(),
      updateRecord,
      deleteRecord: vi.fn(),
      query: vi.fn(async () => ({ records: [] })),
    };
    const log = await executeImportPlan(
      {
        planId: 'student-session-plan',
        createdAt: new Date().toISOString(),
        targetOrg: { orgId: '00DTEST', username: 'u@test.com', isSandbox: true },
        accountId: '001',
        accountName: 'Center',
        sourceRows: [],
        matchedCount: 1,
        updateCount: 1,
        skipCount: 0,
        batches: [
          {
            batchId: 'batch-student-session',
            artifactKind: 'studentSession',
            sobjectApiName: 'MANAERP__Student_Sessions__c',
            operation: 'update',
            records: [
              {
                localRef: 'ss-1',
                salesforceId: 'a0ST001',
                fields: {
                  Id: 'a0ST001',
                  MANAERP__Attendance_Status__c: 'Attend',
                },
              },
            ],
          },
        ],
        executionPolicy: {
          confirmationPhrase: 'EXECUTE SANDBOX',
          productionWrites: 'blocked',
          blockIfPlaceholdersRemain: true,
        },
        validationIssues: [],
      },
      api,
      { confirmed: true, confirmationPhrase: 'EXECUTE SANDBOX' },
    );
    expect(log.success).toBe(true);
    expect(updateRecord).toHaveBeenCalledWith('MANAERP__Student_Sessions__c', 'a0ST001', {
      MANAERP__Attendance_Status__c: 'Attend',
    });
  });
});
