import type { ValidationIssue } from '../../src/contracts';
import type { ScheduleGapReport } from '../../src/services/lessonScheduleGapService';

export function formatValidationIssuePlain(issue: ValidationIssue): string {
  if (issue.code === 'SESSION_NOT_MATCHED') {
    return issue.message.replace(
      /Manabie Student Session が見つかりません（Lesson 未生成の可能性）。/,
      'Manabie に Session がないため、先に Session 作成（3B+）を試してください。',
    );
  }
  if (issue.code === 'LESSON_NOT_FOUND') {
    if (issue.message.includes('振替先')) {
      return issue.message.replace(
        '振替先の Manabie Lesson がありません。',
        '振替先日に Manabie 授業が未作成のため、振替登録できません。',
      );
    }
    return issue.message.replace(
      '紐づけ可能な Manabie Lesson がありません。',
      'Manabie に授業が未作成のため Session を作れません。',
    );
  }
  if (issue.code === 'LESSON_AMBIGUOUS') {
    if (issue.message.includes('振替先')) {
      return issue.message.replace(
        '同日に複数 Lesson があり、振替先を自動解決できません。',
        '同日に複数の Manabie 授業があるため、振替先を自動解決できません。',
      );
    }
    return issue.message.replace(
      '同日に複数 Lesson があり、自動作成できません。',
      '同日に複数の Manabie 授業があるため、自動作成できません。',
    );
  }
  if (issue.code === 'REALLOCATION_NO_ORIGINAL_SESSION') {
    return issue.message.replace(
      /振替元の Manabie Session が見つかりません。/,
      '振替元日に Manabie Session がないため、振替登録できません（先に 3B+ を確認）。',
    );
  }
  if (issue.code === 'SCHEDULE_GAP_NO_LESSON') {
    const gapMatch = issue.message.match(/Manabie Lesson 未生成: ([^—]+)/);
    if (gapMatch) {
      return `この週の ${gapMatch[1].trim()} は Manabie 授業未生成 → 出欠同期はスキップされます。`;
    }
    const reallocMatch = issue.message.match(/Manabie Lesson 未生成: ([^—]+) — 振替登録/);
    if (reallocMatch) {
      return `${reallocMatch[1].trim()} は Manabie 授業未生成 → 振替登録はスキップされます。`;
    }
  }
  if (issue.code === 'ATTENDANCE_NOT_MAPPED') {
    return issue.message.replace(
      /は Manabie 書き込み対象外です（[^）]+）。/,
      'は Manabie へ送れません（振替/未確定のみ）。',
    );
  }
  return issue.message;
}

export function renderScheduleGapBannerPlainHtml(report: ScheduleGapReport | null | undefined): string {
  if (!report?.warnings.length) return '';
  const items = report.warnings.map((w) => `<li>${formatValidationIssuePlain(w)}</li>`).join('');
  return `<div class="schedule-gap-banner warning"><strong>Manabie 授業スケジュールの確認</strong><ul>${items}</ul></div>`;
}
