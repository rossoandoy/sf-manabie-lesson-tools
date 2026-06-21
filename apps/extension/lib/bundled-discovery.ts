import type { LessonDiscoveryResult } from '../src/contracts';
import bundledTrg2 from '../data/discovery-trg2-extuat.json';

const TRG2_HOST = 'trg2--extuat.sandbox.my.salesforce.com';

function isLessonDiscovery(value: unknown): value is LessonDiscoveryResult {
  return typeof value === 'object' && value !== null && 'generatedAt' in value && 'config' in value;
}

export function getBundledLessonDiscoveryForHost(hostname: string): LessonDiscoveryResult | null {
  if (hostname !== TRG2_HOST && !hostname.includes('trg2--extuat')) return null;
  if (!isLessonDiscovery(bundledTrg2)) return null;
  return bundledTrg2;
}
