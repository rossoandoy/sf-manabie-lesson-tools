import type { CatalogRecord } from '../../src/contracts';

export type EntitySearchKind = 'student' | 'teacher' | 'subject';

export interface EntitySearchModalOptions {
  kind: EntitySearchKind;
  title: string;
  records: CatalogRecord[];
  initialQuery?: string;
  onSelect: (record: CatalogRecord) => void;
  onClose?: () => void;
}

function enrollmentLabel(status: unknown): string {
  const text = String(status ?? '').trim();
  if (text === 'Temporary') return '未入会';
  if (text === 'Enrolled') return '在籍中';
  return text || '';
}

function capacityLabel(raw: unknown): string {
  if (raw === null || raw === undefined || raw === '') return '1:2';
  if (typeof raw === 'number') return raw <= 1 ? '1:1' : '1:2';
  const text = String(raw).trim();
  if (text === '1' || text.includes('1:1')) return '1:1';
  return '1:2';
}

function searchPlaceholder(kind: EntitySearchKind): string {
  if (kind === 'subject') return '教科名で検索';
  if (kind === 'teacher') return '講師名で検索';
  return '名前・学年で検索';
}

function filterRecords(records: CatalogRecord[], query: string, kind: EntitySearchKind): CatalogRecord[] {
  const needle = query.trim().toLowerCase();
  return records.filter((record) => {
    const name = record.name.toLowerCase();
    if (!needle) return true;
    if (kind === 'subject' || kind === 'teacher') return name.includes(needle);
    const grade = String(record.fields?.Grade__c ?? record.fields?.grade ?? '').toLowerCase();
    return name.includes(needle) || grade.includes(needle);
  });
}

export function mountEntitySearchModal(options: EntitySearchModalOptions): () => void {
  const overlay = document.createElement('div');
  overlay.className = 'entity-search-overlay';
  overlay.innerHTML = `
    <div class="entity-search-modal panel-card" role="dialog" aria-modal="true">
      <div class="entity-search-header">
        <h2>${options.title}</h2>
        <button type="button" class="btn btn-sm" data-action="close-modal">×</button>
      </div>
      <input type="search" class="entity-search-input" placeholder="${searchPlaceholder(options.kind)}" value="${(options.initialQuery ?? '').replace(/"/g, '&quot;')}" />
      <div class="entity-search-list" tabindex="0"></div>
      <p class="muted entity-search-hint">クリックで選択 · ↑↓ Enter · Esc で閉じる</p>
    </div>
  `;
  document.body.appendChild(overlay);

  const listEl = overlay.querySelector('.entity-search-list') as HTMLElement;
  const inputEl = overlay.querySelector('.entity-search-input') as HTMLInputElement;
  let filtered = filterRecords(options.records, inputEl.value, options.kind);
  let highlightIndex = 0;
  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    overlay.remove();
    options.onClose?.();
  };

  const renderList = () => {
    if (!filtered.length) {
      listEl.innerHTML = '<p class="muted entity-search-empty">該当なし</p>';
      return;
    }
    listEl.innerHTML = filtered
      .map((record, index) => {
        const grade = String(record.fields?.Grade__c ?? record.fields?.grade ?? '');
        const enroll = enrollmentLabel(record.fields?.enrollmentStatus);
        const cap = options.kind === 'student' ? capacityLabel(record.fields?.MANAERP__Lesson_Capacity__c) : '';
        const meta = [grade, enroll, cap].filter(Boolean).join(' · ');
        return `<button type="button" class="entity-search-item ${index === highlightIndex ? 'active' : ''}" data-index="${index}">
          <span class="entity-search-name">${record.name}</span>
          ${meta ? `<span class="entity-search-meta muted">${meta}</span>` : ''}
        </button>`;
      })
      .join('');
  };

  const selectIndex = (index: number) => {
    const record = filtered[index];
    if (!record) return;
    options.onSelect(record);
    close();
  };

  const refresh = () => {
    filtered = filterRecords(options.records, inputEl.value, options.kind);
    highlightIndex = Math.min(highlightIndex, Math.max(0, filtered.length - 1));
    renderList();
  };

  listEl.addEventListener('mousedown', (event) => {
    const item = (event.target as HTMLElement).closest('[data-index]') as HTMLElement | null;
    if (!item) return;
    event.preventDefault();
    selectIndex(Number(item.dataset.index));
  });

  overlay.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    if (target.dataset.action === 'close-modal' || target === overlay) {
      close();
    }
  });

  inputEl.addEventListener('input', () => {
    highlightIndex = 0;
    refresh();
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
    if (event.key === 'Enter') {
      event.preventDefault();
      selectIndex(highlightIndex);
    }
  });

  renderList();
  inputEl.focus();
  inputEl.select();

  return close;
}
