/**
 * Full master catalog SOQL smoke for trg2--extuat (CLI session).
 * Mirrors syncMasterCatalog query loop; writes NDJSON to debug session log.
 */
import { execSync } from 'node:child_process';
import { readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const debugLog = resolve(__dirname, '../../../.cursor/debug-48cd4d.log');
const discovery = JSON.parse(
  readFileSync(resolve(__dirname, '../data/discovery-trg2-extuat.json'), 'utf8'),
);
const queries = discovery.masterCatalog?.queries ?? {};
const orgAlias = process.env.E2E_ORG ?? 'trg2--extuat';
const optionalEmpty = new Set(['packageProducts', 'feeProducts', 'materialProducts']);

function agentLog(message, data, hypothesisId = 'H25') {
  appendFileSync(
    debugLog,
    `${JSON.stringify({
      sessionId: '48cd4d',
      runId: 'cli-full-sync',
      hypothesisId,
      location: 'scripts/verify-master-sync-live.mjs',
      message,
      data,
      timestamp: Date.now(),
    })}\n`,
  );
}

async function runSoql(instanceUrl, accessToken, soql) {
  const url = `${instanceUrl.replace(/\/$/, '')}/services/data/v66.0/query?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}

try {
  const raw = execSync(`sf org display --target-org ${orgAlias} --json`, { encoding: 'utf8' });
  const { instanceUrl, accessToken } = JSON.parse(raw).result;
  const results = {};

  for (const [key, soql] of Object.entries(queries)) {
    const { ok, status, body } = await runSoql(instanceUrl, accessToken, soql);
    if (!ok) {
      if (optionalEmpty.has(key)) {
        results[key] = { skipped: true, status };
        continue;
      }
      agentLog('catalog query failed', { key, status, error: body }, 'H25-FAIL');
      console.error(JSON.stringify({ ok: false, failedKey: key, status, body }, null, 2));
      process.exit(1);
    }
    results[key] = { totalSize: body.totalSize ?? body.records?.length ?? 0 };
  }

  if (!results.productTags?.totalSize) {
    agentLog('productTags empty', { results }, 'H25-FAIL');
    process.exit(1);
  }

  agentLog('full master catalog SOQL ok', { orgAlias, results }, 'H25-OK');
  console.log(JSON.stringify({ ok: true, results }, null, 2));
} catch (error) {
  agentLog('full sync smoke error', { error: error instanceof Error ? error.message : String(error) }, 'H25-FAIL');
  console.error(error);
  process.exit(1);
}
