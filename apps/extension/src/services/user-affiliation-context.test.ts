import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  applyAffiliationToBoothSession,
  CLOSED_CENTER_NAMES,
  contextFromAccount,
  contextFromAffiliationRow,
  formatApiErrorDetail,
  isValidCenterAccount,
  resolveUserAffiliation,
  resolveUserAffiliationContext,
} from './user-affiliation-context';
import { DEFAULT_BOOTH_SETTINGS, type BoothGridSession } from '../../lib/booth-session-state';
import { SfApiError, soqlQuery } from '../../lib/sf-api';

vi.mock('../../lib/sf-api', () => ({
  getOrgIdentity: vi.fn(async () => ({
    orgId: '00D',
    userId: '005USER',
    username: 'test@example.com',
    instanceUrl: 'https://example.sandbox.salesforce.com',
    isSandbox: true,
  })),
  SfApiError: class SfApiError extends Error {
    constructor(
      message: string,
      public status: number,
      public body?: string,
    ) {
      super(message);
      this.name = 'SfApiError';
    }
  },
  soqlQuery: vi.fn(),
}));

const centerAccount = {
  Id: '001CENTER',
  Name: '大森北校',
  Booth__c: 6,
  Capacity__c: '1：2',
  MANAERP__Location_Type__c: 'Center',
  MANAERP__Status__c: 'Operating',
};

const catalogLocation = {
  id: '001CENTER',
  name: '大森北校',
  fields: {
    Booth__c: 6,
    Capacity__c: '1：2',
    MANAERP__Location_Type__c: 'Center',
    MANAERP__Status__c: 'Operating',
  },
};

function affiliationRow(accountId: string) {
  return { MANAERP__Account__c: accountId };
}

function affiliationRowWithRelationship(account: Record<string, unknown>) {
  return {
    MANAERP__Account__c: String(account.Id),
    MANAERP__Account__r: account,
  };
}

describe('user affiliation context', () => {
  beforeEach(() => {
    vi.mocked(soqlQuery).mockReset();
  });

  it('resolves account via affiliation Id + direct Account SOQL', async () => {
    vi.mocked(soqlQuery).mockImplementation(async (soql: string) => {
      if (soql.includes('FROM User')) {
        return [{ MANAERP__ContactId__c: '003CONTACT' }];
      }
      if (soql.includes('FROM MANAERP__Affiliation__c')) {
        expect(soql).not.toContain('MANAERP__Account__r');
        return [affiliationRow('001CENTER')];
      }
      if (soql.includes('FROM Account')) {
        return [centerAccount];
      }
      return [];
    });

    const result = await resolveUserAffiliation('trg2--extuat.sandbox.my.salesforce.com');
    expect(result.context).toEqual({
      accountId: '001CENTER',
      classroomName: '大森北校',
      boothCount: 6,
      capacityLabel: '1:2',
      source: 'affiliation',
    });
    expect(await resolveUserAffiliationContext('trg2--extuat.sandbox.my.salesforce.com')).toEqual(result.context);
  });

  it('resolves account from master catalog locations without Account SOQL', async () => {
    vi.mocked(soqlQuery).mockImplementation(async (soql: string) => {
      if (soql.includes('FROM User')) return [{ ContactId: '003CONTACT' }];
      if (soql.includes('FROM MANAERP__Affiliation__c')) return [affiliationRow('001CENTER')];
      if (soql.includes('FROM Account')) throw new Error('Account SOQL should not run when catalog hit');
      return [];
    });

    const result = await resolveUserAffiliation('host', { locations: [catalogLocation] });
    expect(result.context?.accountId).toBe('001CENTER');
    expect(soqlQuery).not.toHaveBeenCalledWith(expect.stringContaining('FROM Account'));
  });

  it('falls back to ContactId when MANAERP__ContactId__c is empty', async () => {
    vi.mocked(soqlQuery).mockImplementation(async (soql: string) => {
      if (soql.includes('FROM User')) {
        return [{ MANAERP__ContactId__c: null, ContactId: '003FALLBACK' }];
      }
      if (soql.includes('FROM MANAERP__Affiliation__c')) {
        expect(soql).toContain('003FALLBACK');
        return [affiliationRow('001CENTER')];
      }
      if (soql.includes('FROM Account')) return [centerAccount];
      return [];
    });

    const result = await resolveUserAffiliation('host');
    expect(result.context?.accountId).toBe('001CENTER');
  });

  it('skips Brand affiliation and picks valid Center', async () => {
    vi.mocked(soqlQuery).mockImplementation(async (soql: string) => {
      if (soql.includes('FROM User')) {
        return [{ MANAERP__ContactId__c: '003CONTACT' }];
      }
      if (soql.includes('FROM MANAERP__Affiliation__c')) {
        return [affiliationRow('001BRAND'), affiliationRow('001CENTER')];
      }
      if (soql.includes('FROM Account')) {
        return [
          {
            Id: '001BRAND',
            Name: 'Brand HQ',
            MANAERP__Location_Type__c: 'Brand',
            MANAERP__Status__c: 'Operating',
          },
          centerAccount,
        ];
      }
      return [];
    });

    const result = await resolveUserAffiliation('host');
    expect(result.context?.accountId).toBe('001CENTER');
  });

  it('skips closed center names', async () => {
    const closedName = CLOSED_CENTER_NAMES[0]!;
    expect(
      isValidCenterAccount({
        Id: '001X',
        Name: closedName,
        MANAERP__Location_Type__c: 'Center',
        MANAERP__Status__c: 'Operating',
      }),
    ).toBe(false);
    expect(contextFromAccount({ ...centerAccount, Name: closedName })).toBeNull();
    expect(contextFromAffiliationRow(affiliationRowWithRelationship({ ...centerAccount, Name: closedName }))).toBeNull();
  });

  it('returns no_valid_center when all affiliations invalid', async () => {
    vi.mocked(soqlQuery).mockImplementation(async (soql: string) => {
      if (soql.includes('FROM User')) {
        return [{ ContactId: '003CONTACT' }];
      }
      if (soql.includes('FROM MANAERP__Affiliation__c')) {
        return [affiliationRow('001BRAND')];
      }
      if (soql.includes('FROM Account')) {
        return [
          {
            Id: '001BRAND',
            Name: 'Brand',
            MANAERP__Location_Type__c: 'Brand',
            MANAERP__Status__c: 'Operating',
          },
        ];
      }
      return [];
    });

    const result = await resolveUserAffiliation('host');
    expect(result.context).toBeNull();
    expect(result.reason).toBe('no_valid_center');
  });

  it('returns no_affiliation when none exist', async () => {
    vi.mocked(soqlQuery).mockImplementation(async (soql: string) => {
      if (soql.includes('FROM User')) return [{ ContactId: '003CONTACT' }];
      if (soql.includes('FROM MANAERP__Affiliation__c')) return [];
      return [];
    });

    const result = await resolveUserAffiliation('host');
    expect(result.reason).toBe('no_affiliation');
  });

  it('parses Salesforce error body in api_error detail', () => {
    const detail = formatApiErrorDetail(
      new SfApiError('API request failed: /query', 400, JSON.stringify([{ message: 'No such column Capacity__c' }])),
    );
    expect(detail).toContain('No such column Capacity__c');
  });

  it('applies affiliation to booth session settings', () => {
    const session: BoothGridSession = {
      settings: { ...DEFAULT_BOOTH_SETTINGS },
      cells: [],
      slotMeta: [],
      repeatRecords: [],
    };
    const updated = applyAffiliationToBoothSession(session, {
      accountId: '001ACCOUNT',
      classroomName: '教室A',
      boothCount: 6,
      capacityLabel: '1:1',
      source: 'affiliation',
    });
    expect(updated.settings.accountId).toBe('001ACCOUNT');
    expect(updated.settings.boothCount).toBe(6);
    expect(updated.settings.oneToOneMode).toBe(true);
    expect(updated.settings.accountSource).toBe('affiliation');
  });
});
