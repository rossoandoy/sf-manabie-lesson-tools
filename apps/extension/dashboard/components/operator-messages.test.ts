import { describe, expect, it } from 'vitest';
import { formatValidationIssuePlain } from './operator-messages';

describe('formatValidationIssuePlain', () => {
  it('plainifies SESSION_NOT_MATCHED for operators', () => {
    const text = formatValidationIssuePlain({
      severity: 'warning',
      code: 'SESSION_NOT_MATCHED',
      message: '2026-04-10 山田: Manabie Student Session が見つかりません（Lesson 未生成の可能性）。',
    });
    expect(text).toContain('Session 作成（3B+）');
  });

  it('plainifies SCHEDULE_GAP_NO_LESSON with week context', () => {
    const text = formatValidationIssuePlain({
      severity: 'warning',
      code: 'SCHEDULE_GAP_NO_LESSON',
      message: 'Manabie Lesson 未生成: 2026-04-10, 2026-04-11 — 出欠同期はスキップされます。',
    });
    expect(text).toContain('2026-04-10');
    expect(text).toContain('授業未生成');
  });

  it('plainifies REALLOCATION_NO_ORIGINAL_SESSION', () => {
    const text = formatValidationIssuePlain({
      severity: 'warning',
      code: 'REALLOCATION_NO_ORIGINAL_SESSION',
      message: '2026-04-10 山田: 振替元の Manabie Session が見つかりません。',
    });
    expect(text).toContain('振替登録');
  });

  it('passes through unknown codes unchanged', () => {
    const message = 'その他の警告';
    expect(
      formatValidationIssuePlain({ severity: 'warning', code: 'OTHER', message }),
    ).toBe(message);
  });
});
