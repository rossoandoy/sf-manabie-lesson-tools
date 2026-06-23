/** Chrome storage wrapper. */

const STORAGE_KEYS = {
  LAST_HOST: 'sf_last_host',
  MASTER_CATALOG: 'master_catalog',
  DISCOVERY: 'salesforce_discovery',
  LAST_EXECUTION: 'last_execution_log',
  PRODUCT_DEFINITION: 'product_definition',
  DRAFT_DEFINITIONS: 'draft_definitions',
  DRAFT_INDEX: 'draft_index',
  EXECUTED_INDEX: 'executed_index',
} as const;

export async function saveLastHost(hostname: string): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.LAST_HOST]: hostname });
}

export async function loadLastHost(): Promise<string | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.LAST_HOST);
  return result[STORAGE_KEYS.LAST_HOST] ?? null;
}

export async function saveJson<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function loadJson<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? null;
}

export { STORAGE_KEYS };
