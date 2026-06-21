import { describe, expect, it } from 'vitest';
import { gradeForStudentName } from './booth-grade-lookup';

describe('gradeForStudentName', () => {
  it('returns grade from catalog student', () => {
    const grade = gradeForStudentName(
      {
        students: [{ fields: { Name: '田中太郎', Grade__c: '中2' } }],
      } as never,
      '田中太郎',
    );
    expect(grade).toBe('中2');
  });

  it('returns empty when student not found', () => {
    expect(gradeForStudentName({ students: [] } as never, '不明')).toBe('');
  });
});
