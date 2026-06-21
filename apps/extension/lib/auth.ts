/** Cookie-based authentication helpers for Salesforce. */

export function normalizeCookieDomain(domain: string): string {
  return domain.startsWith('.') ? domain.slice(1) : domain;
}

export function hostnameMatchesCookieDomain(hostname: string, cookieDomain: string): boolean {
  const normalized = normalizeCookieDomain(cookieDomain);
  return hostname === normalized || hostname.endsWith(`.${normalized}`);
}

export function cookieDomainToApiHostname(cookieDomain: string): string | null {
  const host = normalizeCookieDomain(cookieDomain);
  if (!host.endsWith('.salesforce.com') && !host.endsWith('.force.com')) return null;
  return toApiHostname(host);
}

export function pickSidCookieForHostname<T extends { domain: string }>(
  hostname: string,
  cookies: T[],
): T | null {
  const exact = cookies.find((cookie) => cookieDomainToApiHostname(cookie.domain) === hostname);
  if (exact) return exact;

  return cookies.find((cookie) => hostnameMatchesCookieDomain(hostname, cookie.domain)) ?? null;
}

export function toApiHostname(hostname: string): string {
  const lightningMatch = hostname.match(
    /^(.+?)\.(?:(sandbox|develop|scratch)\.)?lightning\.force\.com$/i,
  );
  if (lightningMatch) {
    const [, prefix, env] = lightningMatch;
    return env ? `${prefix}.${env}.my.salesforce.com` : `${prefix}.my.salesforce.com`;
  }

  const vfMatch = hostname.match(/^(.+?)(?:--[a-z0-9]+)?\.(?:vf|visualforce)\.(?:force\.)?com$/i);
  if (vfMatch) {
    return `${vfMatch[1]}.my.salesforce.com`;
  }

  return hostname;
}

export function getSfHost(url: string): string | null {
  try {
    const { hostname } = new URL(url);
    if (hostname.endsWith('.salesforce.com') || hostname.endsWith('.force.com')) {
      return toApiHostname(hostname);
    }
    return null;
  } catch {
    return null;
  }
}

export function isSalesforceUrl(url: string): boolean {
  return getSfHost(url) !== null;
}

export function isSandboxHostname(hostname: string): boolean {
  return (
    hostname.includes('.sandbox.') ||
    hostname.includes('--sandbox') ||
    hostname.includes('.cs') ||
    hostname.toLowerCase().includes('sandbox')
  );
}
