import type { ClosedDateDefinition } from '../../src/contracts';
import {
  ATTENDANCE_OPTIONS,
  attendanceCssClass,
  registerTransfer,
  setCellAttendance,
  type CellSeatRef,
} from '../../lib/booth-attendance';
import { getCell, type BoothGridSession, type BoothSlotRef } from '../../lib/booth-session-state';

export interface AttendanceSelection {
  ref: BoothSlotRef;
  seat: 1 | 2;
}

export interface AttendancePanelOptions {
  getSession: () => BoothGridSession;
  getSelection: () => AttendanceSelection | null;
  setSelectedSeat: (seat: 1 | 2) => void;
  getClosedDates: () => ClosedDateDefinition[];
  onChange: () => void;
  persist: () => Promise<void>;
}

function attendButtonClass(status: string, current: string | undefined, disabled: boolean): string {
  const base = `btn attend-${status === '出席' ? 'present' : status === '欠席' ? 'absent' : 'makeup'}`;
  const active = current === status ? ' attend-active' : '';
  return `${base}${active}${disabled ? '' : ''}`;
}

export function mountAttendancePanel(
  container: HTMLElement,
  options: AttendancePanelOptions,
): { refresh: () => void } {
  let bound = false;
  let message = '';

  const seatRef = (): CellSeatRef | null => {
    const sel = options.getSelection();
    if (!sel) return null;
    return { ...sel.ref, seat: sel.seat };
  };

  const render = () => {
    const sel = options.getSelection();
    const session = options.getSession();
    if (!sel) {
      container.innerHTML = '<p class="muted">コマと席を選択して出欠を記録</p>';
      return;
    }

    const seat1 = getCell(session, sel.ref.date, sel.ref.booth, sel.ref.period, 1);
    const seat2 = getCell(session, sel.ref.date, sel.ref.booth, sel.ref.period, 2);
    const active = getCell(session, sel.ref.date, sel.ref.booth, sel.ref.period, sel.seat);
    const hasStudent = Boolean(active.studentName.trim());
    const seatOptions = [
      { seat: 1 as const, label: '席1', cell: seat1 },
      { seat: 2 as const, label: '席2', cell: seat2 },
    ];

    container.innerHTML = `
      <h2>出欠記録</h2>
      <div class="attendance-seat-picker">
        ${seatOptions
          .map(({ seat, label, cell }) => {
            const attendCls = attendanceCssClass(cell.attendance);
            return `<button type="button" class="btn attendance-seat-btn ${sel.seat === seat ? 'attendance-seat-active' : ''} ${attendCls ? `booth-seat ${attendCls}` : ''}" data-action="pick-seat" data-seat="${seat}">
                ${label}: ${cell.studentName || '—'}
              </button>`;
          })
          .join('')}
      </div>
      <p class="attendance-status${active.attendance === '欠席' ? ' attendance-status-absent' : active.attendance === '出席' ? ' attendance-status-present' : ''}">現在: <strong>${active.attendance || '未確定'}</strong></p>
      ${active.transferFrom ? `<p class="muted">振替元: ${active.transferFrom}</p>` : ''}
      ${active.transferTo ? `<p class="muted">振替先: ${active.transferTo}</p>` : ''}
      <div class="footer-actions attendance-actions">
        <button type="button" class="${attendButtonClass('出席', active.attendance, !hasStudent)}" data-action="attend" data-status="出席" ${hasStudent ? '' : 'disabled'}>出席</button>
        <button type="button" class="${attendButtonClass('欠席', active.attendance, !hasStudent)}" data-action="attend" data-status="欠席" ${hasStudent ? '' : 'disabled'}>欠席</button>
        <button type="button" class="${attendButtonClass('振替', active.attendance, !hasStudent)}" data-action="attend" data-status="振替" ${hasStudent ? '' : 'disabled'}>振替</button>
      </div>
      <details class="transfer-form">
        <summary>振替登録</summary>
        <label>振替先 日付<input id="transfer-date" type="date" value="${sel.ref.date}" /></label>
        <label>ブース<input id="transfer-booth" type="number" min="1" value="${sel.ref.booth}" /></label>
        <label>時限<input id="transfer-period" type="number" min="1" value="${sel.ref.period}" /></label>
        <label>席
          <select id="transfer-seat"><option value="1">席1</option><option value="2">席2</option></select>
        </label>
        <button type="button" class="btn primary" data-action="register-transfer" ${hasStudent ? '' : 'disabled'}>振替を登録</button>
      </details>
      ${message ? `<p class="attendance-message">${message}</p>` : ''}
    `;
    (container.querySelector('#transfer-seat') as HTMLSelectElement).value = String(sel.seat);
  };

  const bind = () => {
    if (bound) return;
    bound = true;
    container.addEventListener('click', async (event) => {
      const target = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) return;
      const action = target.dataset.action;
      const ref = seatRef();
      if (!ref) return;

      if (action === 'pick-seat') {
        options.setSelectedSeat(Number(target.dataset.seat) as 1 | 2);
        message = '';
        render();
        return;
      }

      if (action === 'attend') {
        const status = target.dataset.status as (typeof ATTENDANCE_OPTIONS)[number];
        if (setCellAttendance(options.getSession(), ref, status, options.getClosedDates())) {
          message = '';
          await options.persist();
          options.onChange();
          render();
        }
        return;
      }

      if (action === 'register-transfer') {
        const toDate = (container.querySelector('#transfer-date') as HTMLInputElement).value;
        const toBooth = Number((container.querySelector('#transfer-booth') as HTMLInputElement).value);
        const toPeriod = Number((container.querySelector('#transfer-period') as HTMLInputElement).value);
        const toSeat = Number((container.querySelector('#transfer-seat') as HTMLSelectElement).value) as 1 | 2;
        const result = registerTransfer(
          options.getSession(),
          ref,
          { date: toDate, booth: toBooth, period: toPeriod, seat: toSeat },
          options.getClosedDates(),
        );
        message = result.ok ? '振替を登録しました' : (result.error ?? '振替に失敗しました');
        if (result.ok) {
          await options.persist();
          options.onChange();
        }
        render();
      }
    });
  };

  bind();
  render();
  return { refresh: render };
}
