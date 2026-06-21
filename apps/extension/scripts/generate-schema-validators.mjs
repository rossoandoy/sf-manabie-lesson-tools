import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import standaloneCode from 'ajv/dist/standalone/index.js';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const extensionRoot = resolve(__dirname, '..');
const repoRoot = resolve(extensionRoot, '../..');
const outDir = resolve(extensionRoot, 'lib/generated');
const outFile = resolve(outDir, 'schema-validators.js');

function loadSchema(relativePath) {
  return JSON.parse(readFileSync(resolve(repoRoot, relativePath), 'utf8'));
}

const productDefinitionSchema = loadSchema('schemas/product_definition.schema.json');
const importPlanSchema = loadSchema('schemas/import_plan.schema.json');
const discoverySchema = loadSchema('schemas/salesforce_discovery_result.schema.json');

const ajv = new Ajv2020({
  allErrors: true,
  strict: false,
  code: { source: true, esm: true },
});
addFormats(ajv);

ajv.addSchema(productDefinitionSchema, 'productDefinition');
ajv.addSchema(importPlanSchema, 'importPlan');
ajv.addSchema(discoverySchema, 'discovery');

const moduleCode = standaloneCode(ajv, {
  validateProductDefinition: 'productDefinition',
  validateImportPlan: 'importPlan',
  validateDiscovery: 'discovery',
});

mkdirSync(outDir, { recursive: true });
writeFileSync(outFile, moduleCode);
console.log(`Wrote ${outFile}`);
