import type { ClosedDateDefinition } from '../../src/contracts';
import {
  endRepeatRecord,
  getCell,
  rescheduleRepeat,
  saveBoothSession,
  type BoothGridSession,
  type BoothSlotRef,
} from '../../lib/booth-session-state';
import { registerTransfer, registerTransferPair } from '../../lib/booth-attendance';
import { endTeacherRepeatRecord, rescheduleTeacherRepeat } from '../../lib/booth-teacher-repeat';
import { confirmAction } from './confirm-modal';
import { mountEntitySearchModal } from './entity-search-modal';
import { showToast } from './toast';
import type { PrintSheetRow } from '../../lib/booth-print-sheet';

export interface BoothSelectedSlot {
  ref: BoothSlotRef;
  seat: 1 | 2;
  studentName?: string;
  subject?: string;
  teacherName?: string;
}

export interface BoothRepeatPanelOptions {
  hostname: string;
  closedDates: ClosedDateDefinition[];
  getSession: () => BoothGridSession;
  getWeekDateKeys: () => string[];
  getAllRows: () => PrintSheetRow[];
  getSelectedSlot?: () => BoothSelectedSlot | null;
  getStudentRecords?: () => Array<{ id: string; name: string; fields?: Record<string, unknown> }>;
  onSelectSlot?: (ref: BoothSlotRef, seat: 1 | 2) => void;
  onSessionChange?: () => void;
  onRefresh?: () => void;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function cellHasStudentName(session: BoothGridSession, ref: BoothSlotRef, seat: 1 | 2): boolean {
  return Boolean(getCell(session, ref.date, ref.booth, ref.period, seat).studentName.trim());
}

export function mountBoothRepeatPanel(host: HTMLElement, options: BoothRepeatPanelOptions): () => void {
  let bound = false;
  let closeSearchModal: (() => void) | null = null;

  host.innerHTML = `
    <div class="booth-repeat-body">
      <p class="muted booth-repeat-hint">新規の繰り返し配置は、生徒/講師選択ポップアップの「繰り返し配置する」から設定できます。</p>
      <div class="repeat-list-host"></div>
      <h4>振替待ち</h4>
      <div class="transfer-pending-host"></div>
      <button type="button" class="btn btn-sm" data-action="transfer-wizard">振替ウィザード</button>
    </div>
  `;

  const repeatListHost = host.querySelector('.repeat-list-host') as HTMLElement;
  const transferPendingHost = host.querySelector('.transfer-pending-host') as HTMLElement;

  const renderRepeatList = () => {
    const session = options.getSession();
    const studentItems = session.repeatRecords
      .filter((r) => r.status === 'active')
      .map(
        (r) =>
          `<div class="repeat-list-item"><span>[生徒] ${r.name} / ${r.dow}曜 ${r.period}限 B${r.booth}</span>
           <button type="button" class="btn btn-sm" data-action="reschedule-repeat" data-repeat-id="${r.id}">再配置</button>
           <button type="button" class="btn btn-sm danger" data-action="end-repeat" data-repeat-id="${r.id}">終了</button></div>`,
      );
    const teacherItems = (session.teacherRepeatRecords ?? [])
      .filter((r) => r.status === 'active')
      .map(
        (r) =>
          `<div class="repeat-list-item"><span>[講師] ${r.teacherName} / ${r.dow}曜 ${r.period}限 B${r.booth}</span>
           <button type="button" class="btn btn-sm" data-action="reschedule-teacher-repeat" data-repeat-id="${r.id}">再配置</button>
           <button type="button" class="btn btn-sm danger" data-action="end-teacher-repeat" data-repeat-id="${r.id}">終了</button></div>`,
      );
    const items = [...studentItems, ...teacherItems];
    repeatListHost.innerHTML = items.length ? items.join('') : '<p class="muted">登録済み繰り返しなし</p>';
  };

  const renderTransferPending = () => {
    const pending = options.getAllRows().filter((row) => row.attendance === '振替' && !row.transferTo?.trim());
    transferPendingHost.innerHTML = pending.length
      ? `<ul class="transfer-pending-list">${pending
          .slice(0, 20)
          .map(
            (row) =>
              `<li><button type="button" class="btn-link transfer-pending-item" data-action="transfer-jump" data-date="${escapeAttr(row.date)}" data-booth="${row.booth}" data-period="${row.period}" data-seat="${row.seat}">${row.date} ${escapeAttr(row.studentName)}（元: ${row.transferFrom ?? '—'}）</button></li>`,
          )
          .join('')}${pending.length > 20 ? `<li class="muted">…他 ${pending.length - 20} 件</li>` : ''}</ul>`
      : '<p class="muted">振替待ちなし</p>';
  };

  const openTransferWizard = (): void => {
    const weekStart = options.getWeekDateKeys()[0] ?? '';
    const selected = options.getSelectedSlot?.();
    const fromDate = selected?.ref.date ?? weekStart;
    const fromBooth = selected?.ref.booth ?? 1;
    const fromPeriod = selected?.ref.period ?? 1;
    const fromSeat = selected?.seat ?? 1;
    const studentDefault = selected?.studentName?.trim() ?? '';
    const session = options.getSession();
    const fromRef: BoothSlotRef = { date: fromDate, booth: fromBooth, period: fromPeriod };
    const bothSeats =
      cellHasStudentName(session, fromRef, 1) && cellHasStudentName(session, fromRef, 2);
    const pairDefault = bothSeats ? 'checked' : '';

    void confirmAction({
      title: '振替ウィザード',
      messageHtml: `
        <label>生徒名
          <div class="transfer-student-picker">
            <input id="tw-student" readonly value="${escapeAttr(studentDefault)}" style="width:100%" placeholder="検索で選択" />
            <button type="button" class="btn btn-sm" id="tw-student-pick">検索</button>
          </div>
        </label>
        <label>振替元日<input id="tw-from-date" type="date" value="${fromDate}" style="width:100%" /></label>
        <label>振替元ブース<input id="tw-from-booth" type="number" min="1" value="${fromBooth}" style="width:100%" /></label>
        <label>振替元時限<input id="tw-from-period" type="number" min="1" value="${fromPeriod}" style="width:100%" /></label>
        <label>振替元席<select id="tw-from-seat" style="width:100%"><option value="1" ${fromSeat === 1 ? 'selected' : ''}>席1</option><option value="2" ${fromSeat === 2 ? 'selected' : ''}>席2</option></select></label>
        <label>振替先日<input id="tw-to-date" type="date" value="${weekStart}" style="width:100%" /></label>
        <label>振替先ブース<input id="tw-to-booth" type="number" min="1" value="${fromBooth}" style="width:100%" /></label>
        <label>振替先時限<input id="tw-to-period" type="number" min="1" value="${fromPeriod}" style="width:100%" /></label>
        <label class="transfer-pair-option"><input id="tw-pair" type="checkbox" ${pairDefault} ${bothSeats ? '' : 'disabled'} /> 同コマ2席を一括振替（席1+席2）</label>
      `,
      confirmLabel: '振替登録',
    }).then(async (ok) => {
      if (!ok) return;
      const student = (document.getElementById('tw-student') as HTMLInputElement | null)?.value.trim();
      if (!student) {
        showToast('生徒名を入力してください', 'error');
        return;
      }
      const from = {
        date: (document.getElementById('tw-from-date') as HTMLInputElement).value,
        booth: Number((document.getElementById('tw-from-booth') as HTMLInputElement).value) || 1,
        period: Number((document.getElementById('tw-from-period') as HTMLInputElement).value) || 1,
        seat: Number((document.getElementById('tw-from-seat') as HTMLSelectElement).value) as 1 | 2,
      };
      const toRef: BoothSlotRef = {
        date: (document.getElementById('tw-to-date') as HTMLInputElement).value,
        booth: Number((document.getElementById('tw-to-booth') as HTMLInputElement).value) || 1,
        period: Number((document.getElementById('tw-to-period') as HTMLInputElement).value) || 1,
      };
      const usePair = (document.getElementById('tw-pair') as HTMLInputElement | null)?.checked;
      const liveSession = options.getSession();
      const sourceCell = getCell(liveSession, from.date, from.booth, from.period, from.seat);
      if (sourceCell.studentName.trim() !== student) {
        showToast('振替元に該当生徒が見つかりません', 'error');
        return;
      }

      let result;
      if (usePair) {
        result = registerTransferPair(
          liveSession,
          { date: from.date, booth: from.booth, period: from.period },
          toRef,
          options.closedDates,
        );
      } else {
        result = registerTransfer(
          liveSession,
          from,
          { ...toRef, seat: from.seat },
          options.closedDates,
        );
      }

      if (!result.ok) {
        showToast(result.error ?? '振替失敗', 'error');
        return;
      }
      await saveBoothSession(options.hostname, liveSession);
      options.onSessionChange?.();
      const count = 'transferred' in result && result.transferred ? result.transferred : 1;
      showToast(`振替を ${count} 件登録しました`, 'success');
      options.onRefresh?.();
    });

    window.setTimeout(() => {
      const pickBtn = document.getElementById('tw-student-pick');
      const studentInput = document.getElementById('tw-student') as HTMLInputElement | null;
      pickBtn?.addEventListener('click', () => {
        const records = options.getStudentRecords?.() ?? [];
        if (!records.length) {
          showToast('生徒一覧がありません', 'error');
          return;
        }
        closeSearchModal?.();
        closeSearchModal = mountEntitySearchModal({
          kind: 'student',
          title: '生徒を選択（振替）',
          records,
          initialQuery: studentInput?.value ?? '',
          onSelect: (record) => {
            if (studentInput) studentInput.value = record.name;
          },
          onClose: () => {
            closeSearchModal = null;
          },
        });
      });
    }, 0);
  };

  const renderAll = () => {
    renderRepeatList();
    renderTransferPending();
  };

  const bindEvents = () => {
    if (bound) return;
    bound = true;

    host.addEventListener('click', async (event) => {
      const target = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      const session = options.getSession();
      const closedDates = options.closedDates;

      if (action === 'transfer-jump') {
        const ref: BoothSlotRef = {
          date: target.dataset.date!,
          booth: Number(target.dataset.booth),
          period: Number(target.dataset.period),
        };
        const seat = Number(target.dataset.seat) as 1 | 2;
        options.onSelectSlot?.(ref, seat === 2 ? 2 : 1);
        return;
      }

      if (action === 'transfer-wizard') {
        openTransferWizard();
      } else if (action === 'reschedule-repeat') {
        rescheduleRepeat(session, target.dataset.repeatId!, closedDates);
        await saveBoothSession(options.hostname, session);
        options.onSessionChange?.();
        options.onRefresh?.();
      } else if (action === 'end-repeat') {
        const repeatId = target.dataset.repeatId!;
        const record = session.repeatRecords.find((r) => r.id === repeatId);
        if (!record) return;
        const ok = await confirmAction({
          title: '生徒定期を終了',
          messageHtml: `<p>${escapeAttr(record.name)} の定期を終了します。既存コマは削除しません。</p>`,
          confirmLabel: '終了',
          danger: true,
        });
        if (!ok) return;
        if (!endRepeatRecord(session, repeatId)) {
          showToast('定期の終了に失敗しました', 'error');
          return;
        }
        await saveBoothSession(options.hostname, session);
        options.onSessionChange?.();
        options.onRefresh?.();
        showToast('生徒定期を終了しました', 'success');
      } else if (action === 'reschedule-teacher-repeat') {
        rescheduleTeacherRepeat(session, target.dataset.repeatId!, closedDates);
        await saveBoothSession(options.hostname, session);
        options.onSessionChange?.();
        options.onRefresh?.();
      } else if (action === 'end-teacher-repeat') {
        const repeatId = target.dataset.repeatId!;
        const record = session.teacherRepeatRecords?.find((r) => r.id === repeatId);
        if (!record) return;
        const ok = await confirmAction({
          title: '講師定期を終了',
          messageHtml: `<p>${escapeAttr(record.teacherName)} の定期を終了します。既存 slotMeta は削除しません。</p>`,
          confirmLabel: '終了',
          danger: true,
        });
        if (!ok) return;
        if (!endTeacherRepeatRecord(session, repeatId)) {
          showToast('定期の終了に失敗しました', 'error');
          return;
        }
        await saveBoothSession(options.hostname, session);
        options.onSessionChange?.();
        options.onRefresh?.();
        showToast('講師定期を終了しました', 'success');
      }
    });
  };

  bindEvents();
  renderAll();

  return renderAll;
}
