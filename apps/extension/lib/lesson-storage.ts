/** Chrome storage keys for Lesson Tools. */

export const STORAGE_KEYS = {
  LAST_HOST: 'sf_last_host',
  MASTER_CATALOG: 'lesson_master_catalog',
  DISCOVERY: 'lesson_salesforce_discovery',
  LAST_EXECUTION: 'lesson_last_execution_log',
  LESSON_SESSION: 'lesson_session_by_host',
  CLOSED_DATE_SESSION: 'closed_date_session_by_host',
  BOOTH_SESSION: 'booth_session_by_host',
  INVOICE_CACHE: 'invoice_cache_by_host',
  TIME_SLOTS: 'time_slots_by_host',
} as const;

export async function saveJson<T>(key: string, value: T): Promise<void> {
  await chrome.storage.local.set({ [key]: value });
}

export async function loadJson<T>(key: string): Promise<T | null> {
  const result = await chrome.storage.local.get(key);
  return (result[key] as T | undefined) ?? null;
}

export async function scopedKey(hostname: string, base: string): Promise<string> {
  return `${base}:${hostname}`;
}

export async function saveScoped<T>(hostname: string, base: string, value: T): Promise<void> {
  await saveJson(await scopedKey(hostname, base), value);
}

export async function loadScoped<T>(hostname: string, base: string): Promise<T | null> {
  return loadJson<T>(await scopedKey(hostname, base));
}
