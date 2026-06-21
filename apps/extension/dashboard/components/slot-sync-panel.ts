import type {
  ExecutionLog,
  LessonSlotImportPlan,
  ReallocationPlan,
  StudentSessionCreatePlan,
  StudentSessionUpdatePlan,
} from '../../src/contracts';
import { SANDBOX_CONFIRMATION_PHRASE } from '../../src/contracts';
import { executeImportPlan } from '../../src/services/registrationExecutor';
import { createDashboardApiClient } from '../../lib/salesforce-api-client';
import { formatExecutionLog } from './schedule-preview-panel';
import { confirmSandboxExecute } from './confirm-modal';
import { formatValidationIssuePlain, renderScheduleGapBannerPlainHtml } from './operator-messages';
import { showToast } from './toast';

export interface SlotSyncPanelOptions {
  slotPlan: LessonSlotImportPlan | null;
  studentSessionPlan?: StudentSessionUpdatePlan | null;
  studentSessionCreatePlan?: StudentSessionCreatePlan | null;
  reallocationPlan?: ReallocationPlan | null;
  studentSessionLoading?: boolean;
  scheduleGapReport?: import('../../src/services/lessonScheduleGapService').ScheduleGapReport | null;
}

export function renderSlotSyncSummary(root: HTMLElement, options: SlotSyncPanelOptions): void {
  const {
    slotPlan,
    studentSessionPlan = null,
    studentSessionCreatePlan = null,
    reallocationPlan = null,
    studentSessionLoading = false,
    scheduleGapReport = null,
  } = options;

  const gapHtml = renderScheduleGapBannerPlainHtml(scheduleGapReport);

  const slotHtml = slotPlan
    ? renderLessonSlotSection(slotPlan)
    : '<p class="muted">コマ組データから Lesson_Slot__c 同期プランを生成できます。</p>';

  const studentHtml = studentSessionLoading
    ? '<p class="muted">Manabie Student Session プランを生成中...</p>'
    : studentSessionPlan
      ? renderStudentSessionSection(studentSessionPlan)
      : '<p class="muted">Manabie 出欠同期（3B）: PrintSheet 行と Student Session を照合します。</p>';

  const createHtml = studentSessionLoading
    ? ''
    : studentSessionCreatePlan
      ? renderStudentSessionCreateSection(studentSessionCreatePlan)
      : '';

  const reallocationHtml = studentSessionLoading
    ? ''
    : reallocationPlan
      ? renderReallocationSection(reallocationPlan)
      : '';

  root.innerHTML = `${gapHtml}${slotHtml}${reallocationHtml}${createHtml}${studentHtml}`;
}

function renderValidationIssues(issues: { severity: string; message: string }[]): string {
  if (!issues.length) return '<p class="muted">バリデーション問題なし</p>';
  return `<ul class="validation-list">${issues
    .map((issue) => `<li class="${issue.severity}">${formatValidationIssuePlain(issue)}</li>`)
    .join('')}</ul>`;
}

function renderLessonSlotSection(plan: LessonSlotImportPlan): string {
  const batch = plan.batches[0];
  const previewRows = plan.sourceRows
    .slice(0, 8)
    .map(
      (row) =>
        `<tr><td>${row.date}</td><td>B${row.booth}</td><td>P${row.period}</td><td>${row.seat}</td>` +
        `<td>${row.teacherName || '—'}</td><td>${row.studentName}</td><td>${row.grade || '—'}</td>` +
        `<td>${row.lessonKind || '—'}</td><td>${row.subject || '—'}</td></tr>`,
    )
    .join('');

  return `
    <div class="panel-card">
      <h2>Lesson_Slot SF 同期（F19）</h2>
      <p class="muted">拠点: ${plan.accountName || plan.accountId || '未設定'} / ${plan.sourceRows.length} 行</p>
      ${renderValidationIssues(plan.validationIssues)}
      <p class="muted">Batch: ${batch?.sobjectApiName ?? '—'} (${batch?.records.length ?? 0} 件 upsert)</p>
      ${
        plan.sourceRows.length
          ? `<table class="print-sheet-table compact">
              <thead><tr><th>日付</th><th>ブース</th><th>時限</th><th>席</th><th>講師</th><th>生徒</th><th>学年</th><th>種別</th><th>教科</th></tr></thead>
              <tbody>${previewRows}</tbody>
            </table>
            ${plan.sourceRows.length > 8 ? `<p class="muted">…他 ${plan.sourceRows.length - 8} 行</p>` : ''}`
          : ''
      }
      <div class="footer-actions">
        <button type="button" id="btn-sync-lesson-slots" class="btn primary" ${
          plan.validationIssues.some((i) => i.severity === 'error') ? 'disabled' : ''
        }>授業データ送信</button>
      </div>
    </div>
  `;
}

function renderReallocationSection(plan: ReallocationPlan): string {
  const previewRows = plan.sourceRows
    .filter((row) => row.originalSessionId && row.newLessonId && !row.skipReason)
    .slice(0, 8)
    .map(
      (row) =>
        `<tr><td>${row.transferFrom}</td><td>${row.transferTo}</td><td>${row.studentName}</td>` +
        `<td>${row.originalSessionId}</td><td>${row.newLessonId}</td></tr>`,
    )
    .join('');
  const hasErrors = plan.validationIssues.some((issue) => issue.severity === 'error');
  const batch = plan.batches[0];

  return `
    <div class="panel-card">
      <h2>Manabie 振替登録（3C）</h2>
      <p class="muted">
        振替行（transferFrom あり）のみ create /
        登録 ${plan.createCount} / スキップ ${plan.skipCount}
      </p>
      ${renderValidationIssues(plan.validationIssues)}
      <p class="muted">Batch: ${batch?.sobjectApiName ?? '—'} (${batch?.records.length ?? 0} 件 create)</p>
      ${
        previewRows
          ? `<table class="print-sheet-table compact">
              <thead><tr><th>振替元</th><th>振替先</th><th>生徒</th><th>Session</th><th>Lesson</th></tr></thead>
              <tbody>${previewRows}</tbody>
            </table>`
          : '<p class="muted">振替登録対象はありません。</p>'
      }
      <div class="footer-actions">
        <button type="button" id="btn-create-reallocations" class="btn" ${
          hasErrors || plan.createCount === 0 ? 'disabled' : ''
        }>振替登録</button>
      </div>
    </div>
  `;
}

function renderStudentSessionCreateSection(plan: StudentSessionCreatePlan): string {
  const previewRows = plan.sourceRows
    .filter((row) => row.manaerpAttendance && !row.skipReason)
    .slice(0, 8)
    .map(
      (row) =>
        `<tr><td>${row.date}</td><td>${row.studentName}</td><td>${row.boothAttendance}</td>` +
        `<td>${row.manaerpAttendance}</td></tr>`,
    )
    .join('');
  const hasErrors = plan.validationIssues.some((issue) => issue.severity === 'error');
  const batch = plan.batches[0];

  return `
    <div class="panel-card">
      <h2>Manabie Session 作成（3B+）</h2>
      <p class="muted">
        Lesson あり / Session なしの行のみ create /
        作成 ${plan.createCount} / スキップ ${plan.skipCount}
      </p>
      ${renderValidationIssues(plan.validationIssues)}
      <p class="muted">Batch: ${batch?.sobjectApiName ?? '—'} (${batch?.records.length ?? 0} 件 create)</p>
      ${
        previewRows
          ? `<table class="print-sheet-table compact">
              <thead><tr><th>日付</th><th>生徒</th><th>コマ組</th><th>Manabie</th></tr></thead>
              <tbody>${previewRows}</tbody>
            </table>`
          : '<p class="muted">作成対象の Student Session はありません。</p>'
      }
      <div class="footer-actions">
        <button type="button" id="btn-create-student-sessions" class="btn" ${
          hasErrors || plan.createCount === 0 ? 'disabled' : ''
        }>Session 作成</button>
      </div>
    </div>
  `;
}

function renderStudentSessionSection(plan: StudentSessionUpdatePlan): string {
  const previewRows = plan.sourceRows
    .filter((row) => row.manaerpAttendance && !row.skipReason)
    .slice(0, 8)
    .map(
      (row) =>
        `<tr><td>${row.date}</td><td>${row.studentName}</td><td>${row.boothAttendance}</td>` +
        `<td>${row.currentManaerpAttendance || '—'} → ${row.manaerpAttendance}</td></tr>`,
    )
    .join('');

  const hasErrors = plan.validationIssues.some((issue) => issue.severity === 'error');
  const batch = plan.batches[0];

  return `
    <div class="panel-card">
      <h2>Manabie 出欠同期（3B）</h2>
      <p class="muted">
        拠点: ${plan.accountName || plan.accountId || '未設定'} /
        マッチ ${plan.matchedCount} / 更新 ${plan.updateCount} / スキップ ${plan.skipCount}
      </p>
      ${renderValidationIssues(plan.validationIssues)}
      <p class="muted">Batch: ${batch?.sobjectApiName ?? '—'} (${batch?.records.length ?? 0} 件 update)</p>
      ${
        previewRows
          ? `<table class="print-sheet-table compact">
              <thead><tr><th>日付</th><th>生徒</th><th>コマ組</th><th>Manabie</th></tr></thead>
              <tbody>${previewRows}</tbody>
            </table>`
          : '<p class="muted">更新対象の Student Session はありません。</p>'
      }
      <div class="footer-actions">
        <button type="button" id="btn-sync-student-sessions" class="btn primary" ${
          hasErrors || plan.updateCount === 0 ? 'disabled' : ''
        }>Manabie 出欠同期</button>
      </div>
    </div>
  `;
}

export function bindSlotSyncActions(
  root: HTMLElement,
  getOptions: () => SlotSyncPanelOptions,
  onLog: (text: string) => void,
  callbacks?: {
    onSlotSyncExecuted?: (log: ExecutionLog, plan: LessonSlotImportPlan) => void | Promise<void>;
    onStudentSessionSyncExecuted?: (log: ExecutionLog, plan: StudentSessionUpdatePlan) => void | Promise<void>;
    onStudentSessionCreateExecuted?: (log: ExecutionLog, plan: StudentSessionCreatePlan) => void | Promise<void>;
    onReallocationExecuted?: (log: ExecutionLog, plan: ReallocationPlan) => void | Promise<void>;
    ensureFreshManabieCache?: () => Promise<boolean>;
  },
): void {
  if (root.dataset.slotSyncBound === '1') return;
  root.dataset.slotSyncBound = '1';
  root.addEventListener('click', async (event) => {
    const slotBtn = (event.target as HTMLElement).closest('#btn-sync-lesson-slots');
    const sessionBtn = (event.target as HTMLElement).closest('#btn-sync-student-sessions');
    const createBtn = (event.target as HTMLElement).closest('#btn-create-student-sessions');
    const reallocBtn = (event.target as HTMLElement).closest('#btn-create-reallocations');
    if (!slotBtn && !sessionBtn && !createBtn && !reallocBtn) return;

    if (!(await callbacks?.ensureFreshManabieCache?.())) return;

    if (slotBtn) {
      const plan = getOptions().slotPlan;
      if (!plan) return;
      const phrase = await confirmSandboxExecute({
        title: 'Lesson_Slot SF 同期（F19）',
        summaryHtml: `<p>${plan.sourceRows.length} 行を Sandbox に upsert します。</p>`,
      });
      if (phrase !== SANDBOX_CONFIRMATION_PHRASE) {
        onLog('同期キャンセル: 確認フレーズ不一致');
        return;
      }
      onLog('Lesson_Slot 同期実行中...');
      try {
        const log = await executeImportPlan(plan, createDashboardApiClient(), {
          confirmed: true,
          confirmationPhrase: phrase,
        });
        onLog(formatExecutionLog(log));
        showToast(log.success ? '授業データ送信が完了しました' : '授業データ送信に失敗しました', log.success ? 'success' : 'error');
        await callbacks?.onSlotSyncExecuted?.(log, plan);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onLog(msg);
        showToast(msg, 'error');
      }
      return;
    }

    if (createBtn) {
      const plan = getOptions().studentSessionCreatePlan;
      if (!plan) return;
      const phrase = await confirmSandboxExecute({
        title: 'Manabie Session 作成（3B+）',
        summaryHtml: `<p>Student Session を ${plan.createCount} 件 create します。</p>`,
      });
      if (phrase !== SANDBOX_CONFIRMATION_PHRASE) {
        onLog('Session 作成キャンセル: 確認フレーズ不一致');
        return;
      }
      onLog('Manabie Session 作成実行中...');
      try {
        const log = await executeImportPlan(plan, createDashboardApiClient(), {
          confirmed: true,
          confirmationPhrase: phrase,
        });
        onLog(formatExecutionLog(log));
        showToast(log.success ? 'Session 作成が完了しました' : 'Session 作成に失敗しました', log.success ? 'success' : 'error');
        await callbacks?.onStudentSessionCreateExecuted?.(log, plan);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onLog(msg);
        showToast(msg, 'error');
      }
      return;
    }

    if (reallocBtn) {
      const plan = getOptions().reallocationPlan;
      if (!plan) return;
      const phrase = await confirmSandboxExecute({
        title: 'Manabie 振替登録（3C）',
        summaryHtml: `<p>Reallocation を ${plan.createCount} 件 create します。</p>`,
      });
      if (phrase !== SANDBOX_CONFIRMATION_PHRASE) {
        onLog('振替登録キャンセル: 確認フレーズ不一致');
        return;
      }
      onLog('Manabie 振替登録実行中...');
      try {
        const log = await executeImportPlan(plan, createDashboardApiClient(), {
          confirmed: true,
          confirmationPhrase: phrase,
        });
        onLog(formatExecutionLog(log));
        showToast(log.success ? '振替登録が完了しました' : '振替登録に失敗しました', log.success ? 'success' : 'error');
        await callbacks?.onReallocationExecuted?.(log, plan);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onLog(msg);
        showToast(msg, 'error');
      }
      return;
    }

    const plan = getOptions().studentSessionPlan;
    if (!plan) return;
    const phrase = await confirmSandboxExecute({
      title: 'Manabie 出欠同期（3B）',
      summaryHtml: `<p>更新 ${plan.updateCount} 件 / スキップ ${plan.skipCount} 件</p>`,
    });
    if (phrase !== SANDBOX_CONFIRMATION_PHRASE) {
      onLog('出欠同期キャンセル: 確認フレーズ不一致');
      return;
    }
    onLog('Manabie 出欠同期実行中...');
    try {
      const log = await executeImportPlan(plan, createDashboardApiClient(), {
        confirmed: true,
        confirmationPhrase: phrase,
      });
      onLog(formatExecutionLog(log));
      showToast(log.success ? '出欠同期が完了しました' : '出欠同期に失敗しました', log.success ? 'success' : 'error');
      await callbacks?.onStudentSessionSyncExecuted?.(log, plan);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onLog(msg);
      showToast(msg, 'error');
    }
  });
}

export function renderStudentDatalistId(): string {
  return 'booth-student-datalist';
}

export function renderStudentDatalist(catalog: import('../../src/contracts').LessonMasterCatalog | null): string {
  const id = renderStudentDatalistId();
  const options = (catalog?.catalogs.students ?? [])
    .map((student) => `<option value="${student.name.replace(/"/g, '&quot;')}"></option>`)
    .join('');
  return `<datalist id="${id}">${options}</datalist>`;
}
