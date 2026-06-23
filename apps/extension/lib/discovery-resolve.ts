import type { SalesforceDiscoveryResult } from './types';
import { getBundledDiscoveryForHost } from './bundled-discovery';

export function discoveryHasProductTagConfig(discovery: SalesforceDiscoveryResult | null): boolean {
  if (!discovery) return false;
  if (discovery.masterCatalog?.productTagObjectApiName) return true;
  const tag = discovery.relatedObjectCandidates?.find((c) => c.role === 'productTag');
  return Boolean(tag?.apiName && !tag.apiName.startsWith('<'));
}

export function resolveDiscoveryForDashboard(
  hostname: string,
  hostDiscovery: SalesforceDiscoveryResult | null,
  legacyDiscovery: SalesforceDiscoveryResult | null,
): { discovery: SalesforceDiscoveryResult | null; bundled: boolean; source: string } {
  if (hostDiscovery) {
    return { discovery: hostDiscovery, bundled: false, source: 'host-profile' };
  }
  const bundled = getBundledDiscoveryForHost(hostname);
  if (legacyDiscovery && discoveryHasProductTagConfig(legacyDiscovery)) {
    return { discovery: legacyDiscovery, bundled: false, source: 'legacy-storage' };
  }
  if (bundled) {
    return { discovery: bundled, bundled: true, source: 'bundled-trg2' };
  }
  if (legacyDiscovery) {
    return { discovery: legacyDiscovery, bundled: false, source: 'legacy-incomplete' };
  }
  return { discovery: null, bundled: false, source: 'none' };
}
