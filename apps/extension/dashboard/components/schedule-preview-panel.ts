import type { ClosedDateImportPlan, ScheduleImportPlan } from '../../src/contracts';
import { scheduleDefinitionsToCsv } from '../../src/services/scheduleImportPlanBuilder';
import { closedDateDefinitionsToCsv } from '../../src/services/closedDatePlanBuilder';
import { downloadText, formatDateKey } from '../../lib/calendar-utils';

export function renderSchedulePreviewPanel(
  root: HTMLElement,
  plan: ScheduleImportPlan | null,
  closedPlan: ClosedDateImportPlan | null,
): void {
  if (!plan) {
    root.innerHTML = '<p class="muted">授業スケジュールが未入力、または前提マスタ未同期です。</p>';
    return;
  }

  const validationHtml =
    plan.validationIssues.length === 0
      ? '<p class="muted">バリデーション問題なし</p>'
      : `<ul class="validation-list">${plan.validationIssues
          .map((issue) => `<li class="${issue.severity}">${issue.message}</li>`)
          .join('')}</ul>`;

  const batchHtml = plan.batches
    .map(
      (batch) =>
        `<li><strong>${batch.artifactKind}</strong> — ${batch.sobjectApiName} (${batch.records.length}件)</li>`,
    )
    .join('');

  root.innerHTML = `
    <div class="panel-card">
      <h2>授業スケジュール ImportPlan</h2>
      <p class="muted">Plan ID: ${plan.planId}</p>
      ${validationHtml}
      <ul>${batchHtml}</ul>
      <div class="footer-actions">
        <button type="button" id="btn-download-schedule-csv" class="btn">CSV（監査）</button>
      </div>
    </div>
    ${
      closedPlan
        ? `<div class="panel-card">
            <h2>休校日 ImportPlan（Phase 1.5）</h2>
            <p class="muted">拠点: ${closedPlan.locationName || '未選択'} / Calendar: ${closedPlan.academicCalendarId || '未選択'}</p>
            <ul>${closedPlan.batches.map((batch) => `<li>${batch.artifactKind}: ${batch.records.length}件</li>`).join('')}</ul>
            <button type="button" id="btn-download-closed-csv" class="btn">休校日 CSV（監査）</button>
          </div>`
        : ''
    }
  `;

  root.querySelector('#btn-download-schedule-csv')?.addEventListener('click', () => {
    downloadText(`${formatDateKey(new Date())}-lessons.csv`, scheduleDefinitionsToCsv(plan.sourceDefinitions));
  });
  root.querySelector('#btn-download-closed-csv')?.addEventListener('click', () => {
    if (closedPlan) downloadText(`${formatDateKey(new Date())}-closed.csv`, closedDateDefinitionsToCsv(closedPlan.sourceDefinitions));
  });
}

export function formatExecutionLog(log: import('../../src/contracts').ExecutionLog | null): string {
  if (!log) return '—';
  const lines = [
    `planId: ${log.planId}`,
    `success: ${log.success}`,
    `started: ${log.startedAt}`,
    `finished: ${log.finishedAt ?? ''}`,
  ];
  for (const batch of log.batchLogs) {
    lines.push(`\n[${batch.batchId}] ${batch.sobjectApiName}`);
    for (const row of batch.rowResults) {
      lines.push(`  ${row.localRef}: ${row.success ? row.salesforceId : row.errorMessage}`);
    }
  }
  if (log.errorMessage) lines.push(`\nerror: ${log.errorMessage}`);
  return lines.join('\n');
}
