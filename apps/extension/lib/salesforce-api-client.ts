import type { SalesforceApiClient } from '../src/contracts';
import { createSObject, createSObjectCollection, deleteSObject, updateSObject, upsertSObject, upsertSObjectCollection, soqlQuery } from './sf-api';

export function createDashboardApiClient(): SalesforceApiClient {
  return {
    createRecord: (sobjectApiName, fields) => createSObject(sobjectApiName, fields),
    createRecordCollection: (sobjectApiName, records) => createSObjectCollection(sobjectApiName, records),
    updateRecord: (sobjectApiName, id, fields) => updateSObject(sobjectApiName, id, fields),
    upsertRecord: (sobjectApiName, externalIdField, externalIdValue, fields) =>
      upsertSObject(sobjectApiName, externalIdField, externalIdValue, fields),
    upsertRecordCollection: (sobjectApiName, externalIdField, records) =>
      upsertSObjectCollection(sobjectApiName, externalIdField, records),
    deleteRecord: (sobjectApiName, id) => deleteSObject(sobjectApiName, id),
    query: async (soql) => ({ records: await soqlQuery(soql) }),
  };
}
