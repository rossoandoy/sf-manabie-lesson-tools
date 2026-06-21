import {
  validateDiscovery,
  validateImportPlan,
  validateProductDefinition,
} from './generated/schema-validators.js';
import type { ProductDefinition, ImportPlan } from '../src/contracts';
import type { SalesforceDiscoveryResult } from './types';

export const SCHEMA_VALIDATOR_MODE = 'standalone-precompiled' as const;

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

function formatErrors(validator: { errors?: Array<{ instancePath?: string; message?: string }> | null }): string[] {
  return (validator.errors ?? []).map((e) => `${e.instancePath || '/'}: ${e.message}`);
}

export function validateProductDefinitionSchemaDoc(data: ProductDefinition): SchemaValidationResult {
  const valid = validateProductDefinition(data) as boolean;
  return { valid, errors: valid ? [] : formatErrors(validateProductDefinition) };
}

export function validateImportPlanSchemaDoc(data: ImportPlan): SchemaValidationResult {
  const valid = validateImportPlan(data) as boolean;
  return { valid, errors: valid ? [] : formatErrors(validateImportPlan) };
}

export function validateDiscoverySchemaDoc(data: SalesforceDiscoveryResult): SchemaValidationResult {
  const valid = validateDiscovery(data) as boolean;
  return { valid, errors: valid ? [] : formatErrors(validateDiscovery) };
}
