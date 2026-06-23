import { describe, expect, it } from 'vitest';
import { gradeForStudentName, gradeFromCatalogRecord } from './booth-grade-lookup';

describe('gradeFromCatalogRecord', () => {
  it('returns Grade__c when present', () => {
    expect(gradeFromCatalogRecord({ id: '1', name: 'A', fields: { Grade__c: '中2' } })).toBe('中2');
  });

  it('falls back to MANAERP__Grade__r.Name', () => {
    expect(
      gradeFromCatalogRecord({
        id: '1',
        name: 'A',
        fields: { MANAERP__Grade__r: { Name: '小6' } },
      }),
    ).toBe('小6');
  });
});

describe('gradeForStudentName', () => {
  it('returns grade from catalog student', () => {
    const grade = gradeForStudentName(
      {
        catalogs: { students: [{ id: '1', name: '田中太郎', fields: { Name: '田中太郎', Grade__c: '中2' } }] },
      } as never,
      null,
      '田中太郎',
    );
    expect(grade).toBe('中2');
  });

  it('prefers center scoped catalog', () => {
    const grade = gradeForStudentName(null, {
      accountId: '001',
      classroomName: 'A',
      students: [{ id: '1', name: '体験', fields: { Name: '体験', Grade__c: '小6' } }],
      teachers: [],
      loadedAt: '',
    }, '体験');
    expect(grade).toBe('小6');
  });

  it('falls back to global when center has zero students without error', () => {
    const grade = gradeForStudentName(
      {
        catalogs: { students: [{ id: '1', name: 'Global', fields: { Name: 'Global', Grade__c: '高1' } }] },
      } as never,
      {
        accountId: '001',
        classroomName: 'A',
        students: [],
        teachers: [],
        loadedAt: '',
      },
      'Global',
    );
    expect(grade).toBe('');
  });

  it('returns empty when student not found', () => {
    expect(gradeForStudentName({ catalogs: { students: [] } } as never, null, '不明')).toBe('');
  });
});
