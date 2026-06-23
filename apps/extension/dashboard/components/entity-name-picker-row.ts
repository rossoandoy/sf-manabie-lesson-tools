function escapeAttr(value: string): string {
  return value.replace(/"/g, '&quot;');
}

/** 生徒/講師名 — クリックで検索モーダルを開く表示専用ボタン（入力欄に見えない） */
export function renderEntityNamePickerRow(options: {
  value: string;
  placeholder: string;
  pickAction: string;
  clearAction: string;
  disabled?: boolean;
}): string {
  const trimmed = options.value.trim();
  const filled = trimmed ? ' entity-name-display-filled' : '';
  const label = trimmed
    ? escapeAttr(trimmed)
    : `<span class="entity-name-display-placeholder">${escapeAttr(options.placeholder)}</span>`;
  return `<div class="entity-name-picker-row">
    <button type="button" class="entity-name-display${filled}" data-action="${options.pickAction}" ${options.disabled ? 'disabled' : ''} title="クリックして選択">
      <span class="entity-name-display-label">${label}</span>
      <span class="entity-name-display-chevron" aria-hidden="true">▾</span>
    </button>
    <button type="button" class="btn btn-sm" data-action="${options.clearAction}" ${!trimmed ? 'disabled' : ''}>クリア</button>
  </div>`;
}

/** 静的 DOM 上の表示ボタンを選択値に同期（回数報告など再描画しない画面向け） */
export function syncEntityNameDisplay(
  row: ParentNode | null,
  value: string,
  placeholder: string,
): void {
  if (!row) return;
  const btn = row.querySelector('.entity-name-display') as HTMLButtonElement | null;
  const label = row.querySelector('.entity-name-display-label') as HTMLElement | null;
  const clearBtn = row.querySelector('button[data-action$="-clear"]') as HTMLButtonElement | null;
  if (!btn || !label) return;
  const trimmed = value.trim();
  if (trimmed) {
    btn.classList.add('entity-name-display-filled');
    label.textContent = trimmed;
  } else {
    btn.classList.remove('entity-name-display-filled');
    label.innerHTML = `<span class="entity-name-display-placeholder">${escapeAttr(placeholder)}</span>`;
  }
  if (clearBtn) clearBtn.disabled = !trimmed;
}
