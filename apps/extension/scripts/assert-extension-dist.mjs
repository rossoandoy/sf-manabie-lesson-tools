import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dist = resolve(__dirname, '../dist');
const dashboardJs = resolve(dist, 'dashboard/dashboard.js');
const buildInfoPath = resolve(dist, 'BUILD_INFO.json');
const manifestPath = resolve(dist, 'manifest/manifest.json');
const manifestPathAlt = resolve(dist, 'manifest.json');
const dashboardHtmlPath = resolve(dist, 'dashboard/dashboard.html');

function fail(message) {
  console.error(`assert-extension-dist: ${message}`);
  process.exit(1);
}

if (!existsSync(dashboardJs)) fail('dist/dashboard/dashboard.js missing — run npm run build');

const forbidden = [
  'Error compiling schema',
  'scope.schema',
  '_compileMetaSchema',
  'ajv/dist/2020',
  '127.0.0.1:7319',
  'boot-probe.js',
  'agent-debug-log',
];
const dashboard = readFileSync(dashboardJs, 'utf8');
for (const pattern of forbidden) {
  if (dashboard.includes(pattern)) fail(`forbidden pattern in dashboard.js: ${pattern}`);
}

const manifestPathResolved = existsSync(manifestPathAlt) ? manifestPathAlt : manifestPath;
if (!existsSync(manifestPathResolved)) fail('dist/manifest.json missing');
const manifest = JSON.parse(readFileSync(manifestPathResolved, 'utf8'));
const csp = manifest.content_security_policy?.extension_pages ?? '';
if (csp.includes('127.0.0.1:7319')) {
  fail('manifest CSP must not restrict connect-src to debug ingest only');
}
if (!csp.includes('salesforce.com')) {
  fail('manifest CSP connect-src must allow Salesforce domains');
}

const html = readFileSync(dashboardHtmlPath, 'utf8');
if (html.includes('boot-probe.js')) fail('dashboard.html must not load boot-probe.js');

const buildInfo = JSON.parse(readFileSync(buildInfoPath, 'utf8'));

console.log('Load unpacked path:');
console.log(dist);
console.log('');
console.log(`Version: ${manifest.version}`);
console.log(`Build stamp: ${buildInfo.stamp}`);
console.log('AJV runtime compile: not detected');
console.log('CSP: Salesforce connect-src OK');
console.log('Status: OK — use the path above in chrome://extensions');
