import { describe, expect, it } from 'vitest';
import {
  ACCOUNT_BOOTH_COUNT_FIELD,
  boothCountFieldUsed,
  boothCountFromAccountFields,
  buildLocationAccountsSoql,
} from './booth-count-from-account';

describe('booth-count-from-account', () => {
  it('reads Booth__c from Account fields', () => {
    expect(boothCountFromAccountFields({ Booth__c: 8 })).toBe(8);
    expect(boothCountFieldUsed({ Booth__c: 8 })).toBe(ACCOUNT_BOOTH_COUNT_FIELD);
  });

  it('falls back to TRG_BoothCount__c when Booth__c is empty', () => {
    expect(boothCountFromAccountFields({ TRG_BoothCount__c: 5 })).toBe(5);
    expect(boothCountFieldUsed({ Booth__c: null, TRG_BoothCount__c: 5 })).toBe('TRG_BoothCount__c');
  });

  it('prefers Booth__c over legacy field', () => {
    expect(boothCountFromAccountFields({ Booth__c: 3, TRG_BoothCount__c: 9 })).toBe(3);
  });

  it('returns null for invalid values', () => {
    expect(boothCountFromAccountFields({})).toBeNull();
    expect(boothCountFromAccountFields({ Booth__c: 0 })).toBeNull();
  });

  it('buildLocationAccountsSoql for trg2--extuat uses TRG_BoothCount__c without Capacity__c', () => {
    const soql = buildLocationAccountsSoql('trg2--extuat.sandbox.my.salesforce.com');
    expect(soql).toContain('TRG_BoothCount__c');
    expect(soql).not.toContain('Booth__c');
    expect(soql).not.toContain('Capacity__c');
  });

  it('buildLocationAccountsSoql default uses Booth__c and Capacity__c', () => {
    const soql = buildLocationAccountsSoql('other.example.com');
    expect(soql).toContain('Booth__c');
    expect(soql).toContain('Capacity__c');
    expect(soql).not.toContain('TRG_BoothCount__c');
  });
});
