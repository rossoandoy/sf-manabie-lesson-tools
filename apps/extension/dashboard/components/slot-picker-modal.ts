import type { CatalogRecord } from '../../src/contracts';
import type { BoothSlotRef } from '../../lib/booth-session-state';
import { fiscalYearEndDateFrom } from '../../lib/calendar-utils';
import { mountEntitySearchModal, type EntitySearchKind } from './entity-search-modal';

export interface SlotPickerRepeatPrefill {
  dow: number;
  period: number;
  booth: number;
  seat?: 1 | 2;
  subject?: string;
  startDate?: string;
  endDate?: string;
}

export interface StudentRepeatConfirm {
  enabled: true;
  subject: string;
  dow: number;
  period: number;
  booth: number;
  homeSeat: 1 | 2;
  capacity: '1:1' | '1:2';
  interval: 'weekly' | 'daily' | 'biweekly';
  startDate: string;
  endDate: string;
}

export interface TeacherRepeatConfirm {
  enabled: true;
  dow: number;
  period: number;
  booth: number;
  interval: 'weekly' | 'daily' | 'biweekly';
  startDate: string;
  endDate: string;
}

export interface SlotPickerConfirmResult {
  record: CatalogRecord;
  studentRepeat?: StudentRepeatConfirm;
  teacherRepeat?: TeacherRepeatConfirm;
}

export interface SlotPickerModalOptions {
  kind: 'student' | 'teacher';
  title: string;
  records: CatalogRecord[];
  initialQuery?: string;
  prefill?: SlotPickerRepeatPrefill;
  subjectRecords?: CatalogRecord[];
  onConfirm: (result: SlotPickerConfirmResult) => void;
  onClose?: () => void;
}

function dowOptions(selected: number): string {
  const labels = ['日', '月', '火', '水', '木', '金', '土'];
  return labels
    .map((label, index) => `<option value="${index}" ${index === selected ? 'selected' : ''}>${label}</option>`)
    .join('');
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

function subjectSelectOptions(records: CatalogRecord[], selected: string): string {
  const options = records
    .map(
      (r) =>
        `<option value="${escapeAttr(r.name)}" ${r.name === selected ? 'selected' : ''}>${escapeAttr(r.name)}</option>`,
    )
    .join('');
  return `<option value="">— 選択 —</option>${options}`;
}

export function mountSlotPickerModal(options: SlotPickerModalOptions): () => void {
  let selectedRecord: CatalogRecord | null = null;
  let closed = false;
  const prefill = options.prefill ?? { dow: 1, period: 1, booth: 1, seat: 1 as const };
  const subjectOptions =
    options.kind === 'student' ? subjectSelectOptions(options.subjectRecords ?? [], prefill.subject ?? '') : '';

  const overlay = document.createElement('div');
  overlay.className = 'entity-search-overlay';
  overlay.innerHTML = `
    <div class="entity-search-modal panel-card slot-picker-modal" role="dialog" aria-modal="true">
      <div class="entity-search-header">
        <h2>${options.title}</h2>
        <button type="button" class="btn btn-sm" data-action="close-modal">×</button>
      </div>
      <input type="search" class="entity-search-input slot-picker-search" placeholder="${options.kind === 'teacher' ? '講師名で検索' : '名前・学年で検索'}" value="${escapeAttr(options.initialQuery ?? '')}" />
      <div class="entity-search-list" tabindex="0"></div>
      <div class="slot-picker-repeat">
        <label class="slot-picker-repeat-toggle">
          <input type="checkbox" id="slot-picker-repeat-enabled" /> 繰り返し配置する
        </label>
        <div id="slot-picker-repeat-fields" class="slot-picker-repeat-fields hidden form-grid form-grid-single">
          ${
            options.kind === 'student'
              ? `<label>教科<select id="slot-picker-subject">${subjectOptions}</select></label>`
              : ''
          }
          <label>曜日<select id="slot-picker-dow">${dowOptions(prefill.dow)}</select></label>
          <label>時限<input id="slot-picker-period" type="number" min="1" max="10" value="${prefill.period}" /></label>
          <label>ブース<input id="slot-picker-booth" type="number" min="1" max="12" value="${prefill.booth}" /></label>
          ${
            options.kind === 'student'
              ? `<label>自席<select id="slot-picker-seat"><option value="1" ${prefill.seat === 1 ? 'selected' : ''}>席1</option><option value="2" ${prefill.seat === 2 ? 'selected' : ''}>席2</option></select></label>
                 <label>定員<select id="slot-picker-capacity"><option value="1:2">1:2</option><option value="1:1">1:1</option></select></label>`
              : ''
          }
          <label>間隔<select id="slot-picker-interval"><option value="weekly">毎週</option><option value="daily">毎日</option></select></label>
          <label>開始日<input id="slot-picker-start" type="date" value="${prefill.startDate ?? ''}" /></label>
          <label>終了日<input id="slot-picker-end" type="date" value="${prefill.endDate ?? ''}" /></label>
        </div>
      </div>
      <div class="footer-actions">
        <button type="button" class="btn primary" data-action="slot-picker-confirm" disabled>確定</button>
      </div>
      <p class="muted entity-search-hint">クリックで選択 · 繰り返しはチェック後に確定</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const listEl = overlay.querySelector('.entity-search-list') as HTMLElement;
  const inputEl = overlay.querySelector('.slot-picker-search') as HTMLInputElement;
  const confirmBtn = overlay.querySelector('[data-action="slot-picker-confirm"]') as HTMLButtonElement;
  const repeatToggle = overlay.querySelector('#slot-picker-repeat-enabled') as HTMLInputElement;
  const repeatFields = overlay.querySelector('#slot-picker-repeat-fields') as HTMLElement;

  let filtered = options.records;
  let highlightIndex = 0;

  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    options.onClose?.();
  };

  const renderList = () => {
    if (!filtered.length) {
      listEl.innerHTML = '<p class="muted entity-search-empty">該当なし</p>';
      selectedRecord = null;
      confirmBtn.disabled = true;
      return;
    }
    listEl.innerHTML = filtered
      .map((record, index) => {
        const grade = String(record.fields?.Grade__c ?? record.fields?.grade ?? '');
        const meta = grade ? `<span class="entity-search-meta muted">${grade}</span>` : '';
        const active = selectedRecord?.id === record.id || (!selectedRecord && index === highlightIndex);
        return `<button type="button" class="entity-search-item ${active ? 'active' : ''}" data-index="${index}">
          <span class="entity-search-name">${record.name}</span>${meta}
        </button>`;
      })
      .join('');
  };

  const filterRecords = () => {
    const needle = inputEl.value.trim().toLowerCase();
    filtered = options.records.filter((record) => {
      const name = record.name.toLowerCase();
      if (!needle) return true;
      if (options.kind === 'teacher') return name.includes(needle);
      const grade = String(record.fields?.Grade__c ?? record.fields?.grade ?? '').toLowerCase();
      return name.includes(needle) || grade.includes(needle);
    });
    highlightIndex = Math.min(highlightIndex, Math.max(0, filtered.length - 1));
    renderList();
  };

  const selectIndex = (index: number) => {
    const record = filtered[index];
    if (!record) return;
    selectedRecord = record;
    highlightIndex = index;
    confirmBtn.disabled = false;
    renderList();
  };

  repeatToggle.addEventListener('change', () => {
    repeatFields.classList.toggle('hidden', !repeatToggle.checked);
  });

  listEl.addEventListener('mousedown', (event) => {
    const item = (event.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
    if (!item) return;
    event.preventDefault();
    selectIndex(Number(item.dataset.index));
  });

  inputEl.addEventListener('input', () => {
    highlightIndex = 0;
    filterRecords();
  });

  overlay.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.dataset.action === 'close-modal' || target === overlay) close();
  });

  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      highlightIndex = Math.min(filtered.length - 1, highlightIndex + 1);
      renderList();
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      highlightIndex = Math.max(0, highlightIndex - 1);
      renderList();
      return;
    }
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'INPUT') {
      event.preventDefault();
      if (selectedRecord) confirmBtn.click();
      else selectIndex(highlightIndex);
    }
  });

  confirmBtn.addEventListener('click', () => {
    if (!selectedRecord) return;
    const result: SlotPickerConfirmResult = { record: selectedRecord };
    if (repeatToggle.checked) {
      const startDate = (overlay.querySelector('#slot-picker-start') as HTMLInputElement).value;
      const endDate = (overlay.querySelector('#slot-picker-end') as HTMLInputElement).value;
      const dow = Number((overlay.querySelector('#slot-picker-dow') as HTMLSelectElement).value);
      const period = Math.max(1, Number((overlay.querySelector('#slot-picker-period') as HTMLInputElement).value) || 1);
      const booth = Math.max(1, Number((overlay.querySelector('#slot-picker-booth') as HTMLInputElement).value) || 1);
      const interval = (overlay.querySelector('#slot-picker-interval') as HTMLSelectElement).value as
        | 'weekly'
        | 'daily'
        | 'biweekly';
      if (options.kind === 'student') {
        result.studentRepeat = {
          enabled: true,
          subject: (overlay.querySelector('#slot-picker-subject') as HTMLSelectElement).value.trim(),
          dow,
          period,
          booth,
          homeSeat: Number((overlay.querySelector('#slot-picker-seat') as HTMLSelectElement).value) as 1 | 2,
          capacity: (overlay.querySelector('#slot-picker-capacity') as HTMLSelectElement).value as '1:1' | '1:2',
          interval,
          startDate,
          endDate,
        };
      } else {
        result.teacherRepeat = {
          enabled: true,
          dow,
          period,
          booth,
          interval,
          startDate,
          endDate,
        };
      }
    }
    options.onConfirm(result);
    close();
  });

  filterRecords();
  inputEl.focus();
  inputEl.select();

  return close;
}

export function slotRepeatPrefillFromRef(
  ref: BoothSlotRef,
  seat: 1 | 2,
  weekKeys: string[],
  subject?: string,
): SlotPickerRepeatPrefill {
  const startDate = weekKeys[0] ?? ref.date;
  return {
    dow: new Date(`${ref.date}T12:00:00`).getDay(),
    period: ref.period,
    booth: ref.booth,
    seat,
    subject,
    startDate,
    endDate: fiscalYearEndDateFrom(startDate),
  };
}

/** Re-export for subject-only pickers in repeat panel */
export function mountSimpleEntityPicker(
  kind: EntitySearchKind,
  title: string,
  records: CatalogRecord[],
  initialQuery: string | undefined,
  onSelect: (record: CatalogRecord) => void,
  onClose?: () => void,
): () => void {
  return mountEntitySearchModal({ kind, title, records, initialQuery, onSelect, onClose });
}
