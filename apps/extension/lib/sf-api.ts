/** Salesforce REST API client using session cookie auth (Dashboard direct fetch). */

import type { SoqlResult, SessionInfo, OrgIdentity } from './types';

const API_VERSION = 'v66.0';

export class SfApiError extends Error {
  constructor(message: string, public status: number, public body?: string) {
    super(message);
    this.name = 'SfApiError';
  }
}

async function getSession(hostname: string): Promise<SessionInfo> {
  const response = (await chrome.runtime.sendMessage({
    type: 'getSession',
    hostname,
  })) as SessionInfo & { error?: string };

  if (response.error) throw new Error(response.error);
  if (!response.sessionId) {
    throw new Error('Salesforce session not found. Please log in to Salesforce in this browser.');
  }
  return response;
}

async function sfFetch(url: string, token: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
}

async function authenticatedRequest<T>(
  hostname: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const session = await getSession(hostname);
  const baseUrl = `https://${session.hostname}`;
  const url = path.startsWith('http') ? path : `${baseUrl}${path}`;
  const response = await sfFetch(url, session.sessionId, init);

  if (response.status === 401) {
    throw new SfApiError('Session expired. Please log in to Salesforce again.', 401);
  }
  if (!response.ok) {
    const body = await response.text();
    throw new SfApiError(`API request failed: ${path}`, response.status, body);
  }
  if (response.status === 204) return {} as T;
  return response.json();
}

let _currentHost: string | null = null;

export function setCurrentHost(hostname: string): void {
  _currentHost = hostname;
}

export function getCurrentHost(): string | null {
  return _currentHost;
}

function requireHost(): string {
  if (!_currentHost) {
    throw new Error('Salesforce host is not set. Open Dashboard from a Salesforce session.');
  }
  return _currentHost;
}

export async function soqlQuery<T = Record<string, unknown>>(soql: string): Promise<T[]> {
  const host = requireHost();
  const encoded = encodeURIComponent(soql);
  let result = await authenticatedRequest<SoqlResult<T>>(
    host,
    `/services/data/${API_VERSION}/query/?q=${encoded}`,
  );
  const records = [...result.records];
  while (!result.done && result.nextRecordsUrl) {
    result = await authenticatedRequest<SoqlResult<T>>(host, result.nextRecordsUrl);
    records.push(...result.records);
  }
  return records;
}

export async function getOrgIdentity(hostname: string): Promise<OrgIdentity> {
  const session = await getSession(hostname);
  const baseUrl = `https://${session.hostname}`;
  const response = await sfFetch(`${baseUrl}/services/oauth2/userinfo`, session.sessionId);
  if (!response.ok) {
    throw new SfApiError('Failed to get user info', response.status);
  }
  const data = await response.json();
  const orgId = String(data.organization_id ?? '');
  const username = String(data.preferred_username ?? data.email ?? '');
  const instanceUrl = String(data.urls?.custom_domain ?? baseUrl);
  const isSandbox = Boolean(data.urls?.custom_domain?.includes('sandbox') || session.hostname.includes('sandbox'));
  return { orgId, username, instanceUrl, isSandbox };
}

export async function createSObjectCollection(
  sobjectApiName: string,
  records: Record<string, unknown>[],
): Promise<Array<{ id?: string; success: boolean; errors?: Array<{ message: string }> }>> {
  if (!records.length) return [];
  const host = requireHost();
  const payload = {
    allOrNone: false,
    records: records.map((fields) => ({
      attributes: { type: sobjectApiName },
      ...fields,
    })),
  };
  const result = await authenticatedRequest<Array<{ id?: string; success: boolean; errors?: Array<{ message: string }> }>>(
    host,
    `/services/data/${API_VERSION}/composite/sobjects`,
    { method: 'POST', body: JSON.stringify(payload) },
  );
  return Array.isArray(result) ? result : [];
}

export async function upsertSObjectCollection(
  sobjectApiName: string,
  externalIdField: string,
  records: Record<string, unknown>[],
): Promise<Array<{ id?: string; success: boolean; errors?: Array<{ message: string }> }>> {
  if (!records.length) return [];
  const host = requireHost();
  const payload = {
    allOrNone: false,
    records: records.map((fields) => ({
      attributes: { type: sobjectApiName },
      ...fields,
    })),
  };
  const result = await authenticatedRequest<Array<{ id?: string; success: boolean; errors?: Array<{ message: string }> }>>(
    host,
    `/services/data/${API_VERSION}/composite/sobjects/${sobjectApiName}/${externalIdField}`,
    { method: 'PATCH', body: JSON.stringify(payload) },
  );
  return Array.isArray(result) ? result : [];
}

export async function createSObject(
  sobjectApiName: string,
  fields: Record<string, unknown>,
): Promise<{ id: string; success?: boolean; errors?: unknown[] }> {
  const host = requireHost();
  return authenticatedRequest(host, `/services/data/${API_VERSION}/sobjects/${sobjectApiName}/`, {
    method: 'POST',
    body: JSON.stringify(fields),
  });
}

export async function updateSObject(
  sobjectApiName: string,
  id: string,
  fields: Record<string, unknown>,
): Promise<{ id?: string; success?: boolean; errors?: unknown[] }> {
  const host = requireHost();
  await authenticatedRequest(host, `/services/data/${API_VERSION}/sobjects/${sobjectApiName}/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(fields),
  });
  return { id, success: true };
}

export async function upsertSObject(
  sobjectApiName: string,
  externalIdField: string,
  externalIdValue: string,
  fields: Record<string, unknown>,
): Promise<{ id?: string; success?: boolean; created?: boolean; errors?: unknown[] }> {
  const host = requireHost();
  const encoded = encodeURIComponent(externalIdValue);
  return authenticatedRequest(
    host,
    `/services/data/${API_VERSION}/sobjects/${sobjectApiName}/${externalIdField}/${encoded}`,
    { method: 'PATCH', body: JSON.stringify(fields) },
  );
}

export async function deleteSObject(
  sobjectApiName: string,
  id: string,
): Promise<{ id?: string; success?: boolean; errors?: unknown[] }> {
  const host = requireHost();
  await authenticatedRequest(host, `/services/data/${API_VERSION}/sobjects/${sobjectApiName}/${id}`, {
    method: 'DELETE',
  });
  return { id, success: true };
}

export async function describeSObject(sobjectApiName: string): Promise<Record<string, unknown>> {
  const host = requireHost();
  return authenticatedRequest(
    host,
    `/services/data/${API_VERSION}/sobjects/${sobjectApiName}/describe/`,
  );
}
