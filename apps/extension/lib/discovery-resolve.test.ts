import { describe, expect, it } from 'vitest';
import { getBundledLessonDiscoveryForHost } from './bundled-discovery';

describe('lesson discovery resolve', () => {
  it('loads bundled config for trg2 host', () => {
    const discovery = getBundledLessonDiscoveryForHost('trg2--extuat.sandbox.my.salesforce.com');
    expect(discovery?.config.closedDateObject).toBe('MANAERP__Closed_Date__c');
  });
});
