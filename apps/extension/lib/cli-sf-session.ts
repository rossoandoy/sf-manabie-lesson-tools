/** Salesforce session from SF CLI (Node scripts / live E2E only — not used in extension runtime). */

import { execSync } from 'node:child_process';
import type { MasterCatalog } from '../src/contracts';

export interface CliSfSession {
  orgId: string;
  instanceUrl: string;
  accessToken: string;
  username: string;
  isSandbox: boolean;
}

export function getCliSfSession(orgAlias = 'trg2--extuat'): CliSfSession {
  const raw = execSync(`sf org display --target-org ${orgAlias} --json`, { encoding: 'utf-8' });
  const data = JSON.parse(raw) as {
    result: {
      id: string;
      instanceUrl: string;
      accessToken: string;
      username: string;
    };
  };
  const instanceUrl = data.result.instanceUrl.replace(/\/$/, '');
  const isSandbox = instanceUrl.includes('.sandbox.') || instanceUrl.includes('--');
  return {
    orgId: data.result.id,
    instanceUrl,
    accessToken: data.result.accessToken,
    username: data.result.username,
    isSandbox,
  };
}

export function createCliConnection(session: CliSfSession) {
  const apiVersion = 'v66.0';
  return {
    org: {
      orgId: session.orgId,
      username: session.username,
      isSandbox: session.isSandbox,
    } satisfies MasterCatalog['org'],
    async query<T = Record<string, unknown>>(soql: string): Promise<{ records: T[] }> {
      const url = `${session.instanceUrl}/services/data/${apiVersion}/query?q=${encodeURIComponent(soql)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`SOQL failed: ${await res.text()}`);
      const body = (await res.json()) as { records: T[] };
      return { records: body.records ?? [] };
    },
  };
}

export function createCliSalesforceApi(session: CliSfSession) {
  const apiVersion = 'v66.0';
  const base = `${session.instanceUrl}/services/data/${apiVersion}`;

  async function parseError(res: Response): Promise<string> {
    const text = await res.text();
    try {
      const json = JSON.parse(text) as Array<{ message?: string }>;
      if (Array.isArray(json)) return json.map((e) => e.message).filter(Boolean).join('; ') || text;
    } catch {
      /* ignore */
    }
    return text;
  }

  return {
    async createRecord(sobjectApiName: string, fields: Record<string, unknown>) {
      const res = await fetch(`${base}/sobjects/${sobjectApiName}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(await parseError(res));
      const body = (await res.json()) as { id: string; success?: boolean };
      return { id: body.id, success: body.success ?? true };
    },
    async updateRecord(sobjectApiName: string, id: string, fields: Record<string, unknown>) {
      const res = await fetch(`${base}/sobjects/${sobjectApiName}/${id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(fields),
      });
      if (!res.ok) throw new Error(await parseError(res));
      return { id, success: true };
    },
    async upsertRecord(
      sobjectApiName: string,
      externalIdField: string,
      externalIdValue: string,
      fields: Record<string, unknown>,
    ) {
      const res = await fetch(
        `${base}/sobjects/${sobjectApiName}/${externalIdField}/${encodeURIComponent(externalIdValue)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${session.accessToken}`,
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify(fields),
        },
      );
      if (!res.ok) throw new Error(await parseError(res));
      const body = (await res.json()) as { id?: string; success?: boolean; created?: boolean };
      if (!body.id) throw new Error('Upsert succeeded but no Id returned');
      return { id: body.id };
    },
    async deleteRecord(sobjectApiName: string, id: string): Promise<void> {
      const res = await fetch(`${base}/sobjects/${sobjectApiName}/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/json',
        },
      });
      if (!res.ok) throw new Error(await parseError(res));
    },
    async query(soql: string) {
      const url = `${session.instanceUrl}/services/data/${apiVersion}/query?q=${encodeURIComponent(soql)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.accessToken}`, Accept: 'application/json' },
      });
      if (!res.ok) throw new Error(`SOQL failed: ${await res.text()}`);
      const body = (await res.json()) as { records: Record<string, unknown>[] };
      return { records: body.records ?? [] };
    },
  };
}
