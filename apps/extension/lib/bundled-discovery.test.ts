import { describe, expect, it } from 'vitest';
import { getBundledLessonDiscoveryForHost } from './bundled-discovery';

describe('getBundledLessonDiscoveryForHost', () => {
  it('returns trg2 lesson discovery for extuat hostname', () => {
    const discovery = getBundledLessonDiscoveryForHost('trg2--extuat.sandbox.my.salesforce.com');
    expect(discovery).not.toBeNull();
    expect(discovery?.config.lessonScheduleObject).toBe('MANAERP__Lesson_Schedule__c');
  });
});
