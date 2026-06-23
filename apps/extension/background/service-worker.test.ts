import { beforeEach, describe, expect, it, vi } from 'vitest';

type MessageListener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: unknown) => void,
) => boolean;

const devHost = 'riso-kyoiku--dev.sandbox.my.salesforce.com';
const extuatHost = 'riso-kyoiku--extuat.sandbox.my.salesforce.com';
const trg2ExtuatHost = 'trg2--extuat.sandbox.my.salesforce.com';

function installChromeMock(options?: {
  tabUrl?: string;
  sidCookies?: Array<{ domain: string; value: string }>;
}): { getListener: () => MessageListener } {
  let messageListener: MessageListener | undefined;
  const sidCookies = options?.sidCookies ?? [
    { domain: devHost, value: 'dev-sid' },
    { domain: extuatHost, value: 'extuat-sid' },
  ];

  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: vi.fn((listener: MessageListener) => {
          messageListener = listener;
        }),
      },
    },
    cookies: {
      get: vi.fn(async () => null),
      getAll: vi.fn(async () => sidCookies),
    },
    storage: {
      local: {
        get: vi.fn(async () => ({ sf_last_host: devHost })),
        set: vi.fn(async () => undefined),
      },
    },
    tabs: {
      get: vi.fn(async () => ({
        id: 123,
        url:
          options?.tabUrl ??
          `https://${extuatHost.replace('.my.salesforce.com', '.lightning.force.com')}/lightning/o/Account/home`,
      })),
      query: vi.fn(async () => []),
      onUpdated: {
        addListener: vi.fn(),
      },
    },
  });

  return {
    getListener: () => {
      if (!messageListener) throw new Error('message listener was not registered');
      return messageListener;
    },
  };
}

async function sendMessage(listener: MessageListener, message: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    listener(message, {}, resolve);
  });
}

describe('service worker org status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  it('prefers the active Salesforce tab over the stored last host', async () => {
    const chromeMock = installChromeMock();
    await import('./service-worker.js');

    const response = await sendMessage(chromeMock.getListener(), { type: 'getStatus', tabId: 123 });

    expect(response).toEqual({ connected: true, hostname: extuatHost, sourceTabId: 123 });
  });

  it('finds sid cookies via getAll when direct cookie lookup fails', async () => {
    const chromeMock = installChromeMock({
      tabUrl: `https://${trg2ExtuatHost}/setup/objectManager`,
      sidCookies: [{ domain: '.sandbox.my.salesforce.com', value: 'trg2-sid' }],
    });
    await import('./service-worker.js');

    const response = await sendMessage(chromeMock.getListener(), { type: 'getStatus', tabId: 123 });

    expect(response).toEqual({ connected: true, hostname: trg2ExtuatHost, sourceTabId: 123 });
  });

  it('does not fall back to another org when the active tab has no matching sid', async () => {
    const chromeMock = installChromeMock({
      tabUrl: `https://${trg2ExtuatHost}/setup/objectManager`,
      sidCookies: [{ domain: devHost, value: 'dev-sid' }],
    });
    await import('./service-worker.js');

    const response = await sendMessage(chromeMock.getListener(), { type: 'getStatus', tabId: 123 });

    expect(response).toEqual({ connected: false, sourceTabId: 123 });
  });

  it('getSession returns sid only for the requested hostname', async () => {
    const chromeMock = installChromeMock();
    await import('./service-worker.js');

    const response = await sendMessage(chromeMock.getListener(), {
      type: 'getSession',
      hostname: extuatHost,
    });

    expect(response).toEqual({ sessionId: 'extuat-sid', hostname: extuatHost });
  });
});
