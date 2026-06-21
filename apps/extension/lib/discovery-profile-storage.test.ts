import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DISCOVERY_BY_HOST_KEY,
  discoveryHostMismatchWarning,
  listDiscoveryProfileSummaries,
  loadDiscoveryForHost,
  normalizeDiscoveryProfileEntry,
  removeDiscoveryForHost,
  saveDiscoveryForHost,
} from './discovery-profile-storage';
import type { SalesforceDiscoveryResult } from './types';

const store: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => {
        Object.assign(store, obj);
      }),
    },
  },
});

const sampleDiscovery = {
  generatedAt: '2026-01-01',
  org: { instanceUrl: 'https://trg2--extuat.sandbox.my.salesforce.com' },
  relatedObjectCandidates: [{ role: 'product', apiName: 'MANAERP__Product__c' }],
} as unknown as SalesforceDiscoveryResult;

describe('discovery-profile-storage', () => {
  beforeEach(() => {
    for (const key of Object.keys(store)) delete store[key];
  });

  it('saves and loads discovery per hostname with metadata', async () => {
    await saveDiscoveryForHost('trg2--extuat.sandbox.my.salesforce.com', sampleDiscovery, {
      label: 'TRG2 UAT',
    });
    const loaded = await loadDiscoveryForHost('trg2--extuat.sandbox.my.salesforce.com');
    expect(loaded?.generatedAt).toBe('2026-01-01');
    const summaries = await listDiscoveryProfileSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.label).toBe('TRG2 UAT');
    expect(summaries[0]?.savedAt).toBeTruthy();
  });

  it('migrates legacy raw discovery JSON in storage', () => {
    const entry = normalizeDiscoveryProfileEntry(sampleDiscovery);
    expect(entry?.discovery.generatedAt).toBe('2026-01-01');
    expect(entry?.savedAt).toBe('');
  });

  it('returns null for unknown host', async () => {
    expect(await loadDiscoveryForHost('unknown.example.com')).toBeNull();
  });

  it('warns when discovery instance host differs from connected host', () => {
    const warn = discoveryHostMismatchWarning(sampleDiscovery, 'other.sandbox.my.salesforce.com');
    expect(warn).toContain('trg2--extuat');
    expect(discoveryHostMismatchWarning(sampleDiscovery, 'trg2--extuat.sandbox.my.salesforce.com')).toBeNull();
  });

  it('removes saved profile for host', async () => {
    await saveDiscoveryForHost('host-a.example.com', sampleDiscovery);
    await saveDiscoveryForHost('host-b.example.com', sampleDiscovery);
    await removeDiscoveryForHost('host-a.example.com');
    expect(await loadDiscoveryForHost('host-a.example.com')).toBeNull();
    const summaries = await listDiscoveryProfileSummaries();
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.hostname).toBe('host-b.example.com');
  });

  it('keeps trg2 and sandbox example profiles isolated', async () => {
    const trg2 = {
      ...sampleDiscovery,
      org: { instanceUrl: 'https://trg2--extuat.sandbox.my.salesforce.com' },
    } as unknown as SalesforceDiscoveryResult;
    const example = {
      generatedAt: '2026-06-01',
      org: { instanceUrl: 'https://example--sandbox.sandbox.my.salesforce.com' },
      relatedObjectCandidates: [{ role: 'product', apiName: 'MANAERP__Product__c' }],
    } as unknown as SalesforceDiscoveryResult;
    await saveDiscoveryForHost('trg2--extuat.sandbox.my.salesforce.com', trg2, { label: 'TRG2' });
    await saveDiscoveryForHost('example--sandbox.sandbox.my.salesforce.com', example, {
      label: 'Example SB',
    });
    expect((await loadDiscoveryForHost('trg2--extuat.sandbox.my.salesforce.com'))?.org.instanceUrl).toContain(
      'trg2--extuat',
    );
    expect((await loadDiscoveryForHost('example--sandbox.sandbox.my.salesforce.com'))?.generatedAt).toBe(
      '2026-06-01',
    );
    const summaries = await listDiscoveryProfileSummaries();
    expect(summaries).toHaveLength(2);
  });

  it('persists wrapped entry shape in storage', async () => {
    await saveDiscoveryForHost('host.example.com', sampleDiscovery);
    const raw = store[DISCOVERY_BY_HOST_KEY] as Record<string, unknown>;
    const wrapped = raw['host.example.com'] as { discovery: unknown; savedAt: string };
    expect(wrapped.savedAt).toBeTruthy();
    expect((wrapped.discovery as SalesforceDiscoveryResult).generatedAt).toBe('2026-01-01');
  });
});
