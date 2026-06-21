import type { ExecutionLog } from '../src/contracts';

const SENSITIVE_KEYS = new Set(['raw', 'sid', 'authorization', 'accessToken', 'sessionId']);

/** Strip fields that must never appear in exported logs (defensive). */
export function sanitizeExecutionLogForExport(log: ExecutionLog): ExecutionLog {
  return scrubSensitiveValues(structuredClone(log)) as ExecutionLog;
}

function scrubSensitiveValues(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(scrubSensitiveValues);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key)) continue;
      out[key] = scrubSensitiveValues(nested);
    }
    return out;
  }
  return value;
}

export function downloadExecutionLogJson(log: ExecutionLog, filenamePrefix = 'execution-log'): void {
  const safe = sanitizeExecutionLogForExport(log);
  const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filenamePrefix}-${safe.executionId}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
