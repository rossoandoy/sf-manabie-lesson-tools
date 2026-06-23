import type { SalesforceDiscoveryResult } from './types';

export const DISCOVERY_BY_HOST_KEY = 'discovery_by_host';

export interface DiscoveryProfileEntry {
  discovery: SalesforceDiscoveryResult;
  savedAt: string;
  label?: string;
}

export type DiscoveryByHostMap = Record<string, DiscoveryProfileEntry | SalesforceDiscoveryResult>;

function isDiscoveryResult(value: unknown): value is SalesforceDiscoveryResult {
  return (
    typeof value === 'object' &&
    value !== null &&
    'generatedAt' in value &&
    'relatedObjectCandidates' in value
  );
}

export function normalizeDiscoveryProfileEntry(raw: unknown): DiscoveryProfileEntry | null {
  if (isDiscoveryResult(raw)) {
    return { discovery: raw, savedAt: '' };
  }
  if (typeof raw === 'object' && raw !== null && 'discovery' in raw) {
    const entry = raw as DiscoveryProfileEntry;
    if (isDiscoveryResult(entry.discovery)) {
      return {
        discovery: entry.discovery,
        savedAt: entry.savedAt ?? '',
        label: entry.label,
      };
    }
  }
  return null;
}

export function discoveryProfileHostname(discovery: SalesforceDiscoveryResult): string | null {
  const url = discovery.org?.instanceUrl;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function discoveryHostMismatchWarning(
  discovery: SalesforceDiscoveryResult,
  connectedHostname: string,
): string | null {
  const profileHost = discoveryProfileHostname(discovery);
  if (!profileHost || profileHost === connectedHostname) return null;
  return `Discovery の org (${profileHost}) と接続 org (${connectedHostname}) が一致しません。`;
}

export interface DiscoveryProfileSummary {
  hostname: string;
  savedAt: string;
  label?: string;
  profileHostname: string | null;
}

export async function loadDiscoveryByHostMap(): Promise<Record<string, DiscoveryProfileEntry>> {
  const result = await chrome.storage.local.get(DISCOVERY_BY_HOST_KEY);
  const raw = result[DISCOVERY_BY_HOST_KEY];
  if (!raw || typeof raw !== 'object') return {};

  const out: Record<string, DiscoveryProfileEntry> = {};
  for (const [hostname, value] of Object.entries(raw as DiscoveryByHostMap)) {
    const entry = normalizeDiscoveryProfileEntry(value);
    if (entry) out[hostname] = entry;
  }
  return out;
}

export async function listDiscoveryProfileSummaries(): Promise<DiscoveryProfileSummary[]> {
  const map = await loadDiscoveryByHostMap();
  return Object.entries(map)
    .map(([hostname, entry]) => ({
      hostname,
      savedAt: entry.savedAt,
      label: entry.label,
      profileHostname: discoveryProfileHostname(entry.discovery),
    }))
    .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''));
}

export async function loadDiscoveryForHost(hostname: string): Promise<SalesforceDiscoveryResult | null> {
  const map = await loadDiscoveryByHostMap();
  return map[hostname]?.discovery ?? null;
}

export async function loadDiscoveryProfileForHost(
  hostname: string,
): Promise<DiscoveryProfileEntry | null> {
  const map = await loadDiscoveryByHostMap();
  return map[hostname] ?? null;
}

export async function saveDiscoveryForHost(
  hostname: string,
  discovery: SalesforceDiscoveryResult,
  options?: { label?: string },
): Promise<void> {
  const map = await loadDiscoveryByHostMap();
  map[hostname] = {
    discovery,
    savedAt: new Date().toISOString(),
    label: options?.label,
  };
  await chrome.storage.local.set({ [DISCOVERY_BY_HOST_KEY]: map });
}

export async function removeDiscoveryForHost(hostname: string): Promise<void> {
  const map = await loadDiscoveryByHostMap();
  delete map[hostname];
  await chrome.storage.local.set({ [DISCOVERY_BY_HOST_KEY]: map });
}
