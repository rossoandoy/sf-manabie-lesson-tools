import type { ConnectionState, GetStatusRequest } from '../lib/types';
import { isSalesforceUrl } from '../lib/auth';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const connectedState = $('connected-state');
const notSfState = $('not-sf-state');
const noSessionState = $('no-session-state');
const btnDashboard = $('btn-dashboard') as HTMLButtonElement;
const hostnameDisplay = $('hostname-display');

let detectedHost: string | null = null;
let activeTabId: number | undefined;

async function getActiveTabId(): Promise<number | undefined> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.id;
}

async function getStatus(tabId?: number): Promise<ConnectionState & { error?: string }> {
  const message: GetStatusRequest =
    typeof tabId === 'number' ? { type: 'getStatus', tabId } : { type: 'getStatus' };
  return chrome.runtime.sendMessage(message) as Promise<ConnectionState & { error?: string }>;
}

function showConnected(hostname: string) {
  connectedState.classList.remove('hidden');
  notSfState.classList.add('hidden');
  noSessionState.classList.add('hidden');
  hostnameDisplay.textContent = hostname;
  btnDashboard.disabled = false;
}

function showNotSfPage() {
  connectedState.classList.add('hidden');
  notSfState.classList.remove('hidden');
  noSessionState.classList.add('hidden');
  btnDashboard.disabled = true;
}

function showNoSession() {
  connectedState.classList.add('hidden');
  notSfState.classList.add('hidden');
  noSessionState.classList.remove('hidden');
  btnDashboard.disabled = true;
}

async function loadBuildStamp(): Promise<void> {
  const el = document.getElementById('popup-build-stamp');
  if (!el) return;
  try {
    const info = await fetch(chrome.runtime.getURL('BUILD_INFO.json')).then((r) => r.json()) as {
      stamp?: string;
      probeId?: string;
    };
    el.textContent = info.stamp ?? `v${chrome.runtime.getManifest().version}`;
  } catch {
    el.textContent = `v${chrome.runtime.getManifest().version} (BUILD_INFO missing)`;
  }
}

async function init() {
  void loadBuildStamp();
  activeTabId = await getActiveTabId();
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const status = await getStatus(activeTabId);

  if (status.connected && status.hostname) {
    detectedHost = status.hostname;
    showConnected(status.hostname);
    return;
  }

  if (activeTab?.url && isSalesforceUrl(activeTab.url)) {
    showNoSession();
    return;
  }

  showNotSfPage();
}

btnDashboard.addEventListener('click', () => {
  if (!detectedHost || activeTabId === undefined) return;
  const params = new URLSearchParams({
    host: detectedHost,
    tabId: String(activeTabId),
  });
  const dashUrl = chrome.runtime.getURL(`dashboard/dashboard.html?${params.toString()}`);
  chrome.tabs.create({ url: dashUrl });
});

init();
