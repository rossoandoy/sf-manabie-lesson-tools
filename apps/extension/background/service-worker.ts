/**
 * Background service worker — Cookie Broker only.
 * Resolves org from the active Salesforce tab; never falls back to another org's sid.
 */

import { getSfHost, pickSidCookieForHostname } from '../lib/auth';
import { saveLastHost, loadLastHost } from '../lib/storage';
import type { ConnectionState, GetStatusRequest, SessionInfo } from '../lib/types';

interface GetSessionMessage { type: 'getSession'; hostname: string }
interface GetSfHostMessage { type: 'getSfHost'; url: string }
interface SfDetectedMessage { type: 'sfDetected'; sfHost: string }

type Message = GetSessionMessage | GetSfHostMessage | GetStatusRequest | SfDetectedMessage;

chrome.runtime.onMessage.addListener((message: Message, _sender, sendResponse) => {
  handleMessage(message).then(sendResponse).catch((err) => {
    sendResponse({ error: err instanceof Error ? err.message : String(err) });
  });
  return true;
});

async function handleMessage(message: Message): Promise<unknown> {
  switch (message.type) {
    case 'getSession':
      return handleGetSession(message.hostname);
    case 'getSfHost':
      return { sfHost: getSfHost(message.url) };
    case 'getStatus':
      return handleGetStatus(message.tabId);
    case 'sfDetected':
      await saveLastHost(message.sfHost);
      return { ok: true };
    default:
      throw new Error(`Unknown message type: ${(message as { type: string }).type}`);
  }
}

async function findSidCookieForHostname(hostname: string): Promise<chrome.cookies.Cookie | null> {
  const direct = await chrome.cookies.get({ url: `https://${hostname}/`, name: 'sid' });
  if (direct) return direct;

  const fallback = await chrome.cookies.get({ url: `https://${hostname}`, name: 'sid' });
  if (fallback) return fallback;

  const allCookies = await chrome.cookies.getAll({ name: 'sid' });
  return pickSidCookieForHostname(hostname, allCookies);
}

async function handleGetSession(hostname: string): Promise<SessionInfo> {
  const cookie = await findSidCookieForHostname(hostname);
  if (!cookie) {
    throw new Error('sid cookie not found for this org. Please log in to Salesforce on the active tab.');
  }
  return { sessionId: cookie.value, hostname };
}

async function getActiveTabUrl(tabId?: number): Promise<string | null> {
  if (typeof tabId === 'number') {
    try {
      const tab = await chrome.tabs.get(tabId);
      return tab.url ?? null;
    } catch {
      return null;
    }
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? null;
}

async function hasSessionCookie(hostname: string): Promise<boolean> {
  return Boolean(await findSidCookieForHostname(hostname));
}

async function resolveConnectedHostname(tabId?: number): Promise<string | null> {
  const activeTabUrl = await getActiveTabUrl(tabId);
  const activeHost = activeTabUrl ? getSfHost(activeTabUrl) : null;
  if (activeHost) {
    const hasCookie = await hasSessionCookie(activeHost);
    if (hasCookie) {
      await saveLastHost(activeHost);
      return activeHost;
    }
    return null;
  }

  const lastHost = await loadLastHost();
  if (lastHost && (await hasSessionCookie(lastHost))) return lastHost;

  return null;
}

async function handleGetStatus(tabId?: number): Promise<ConnectionState> {
  const hostname = await resolveConnectedHostname(tabId);
  if (hostname) {
    return {
      connected: true,
      hostname,
      sourceTabId: typeof tabId === 'number' ? tabId : undefined,
    };
  }
  return { connected: false, sourceTabId: typeof tabId === 'number' ? tabId : undefined };
}

chrome.tabs.onUpdated.addListener(async (_tabId, info, tab) => {
  if (!tab.url || info.status !== 'complete') return;
  const sfHost = getSfHost(tab.url);
  if (!sfHost) return;
  await saveLastHost(sfHost);
});
