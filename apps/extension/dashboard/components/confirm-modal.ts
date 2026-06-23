import { SANDBOX_CONFIRMATION_PHRASE } from '../../src/contracts';

let overlay: HTMLElement | null = null;

function ensureOverlay(): HTMLElement {
  if (overlay && document.body.contains(overlay)) return overlay;
  overlay = document.createElement('div');
  overlay.className = 'modal-overlay hidden';
  overlay.innerHTML = `
    <div class="modal-dialog" role="dialog" aria-modal="true">
      <h2 class="modal-title"></h2>
      <div class="modal-body"></div>
      <div class="modal-actions">
        <button type="button" class="btn modal-cancel">キャンセル</button>
        <button type="button" class="btn primary modal-confirm">確認</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  return overlay;
}

function closeModal(): void {
  overlay?.classList.add('hidden');
}

export async function confirmAction(options: {
  title: string;
  messageHtml: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  const root = ensureOverlay();
  const titleEl = root.querySelector('.modal-title') as HTMLElement;
  const bodyEl = root.querySelector('.modal-body') as HTMLElement;
  const cancelBtn = root.querySelector('.modal-cancel') as HTMLButtonElement;
  const confirmBtn = root.querySelector('.modal-confirm') as HTMLButtonElement;

  titleEl.textContent = options.title;
  bodyEl.innerHTML = options.messageHtml;
  cancelBtn.textContent = options.cancelLabel ?? 'キャンセル';
  confirmBtn.textContent = options.confirmLabel ?? '続行';
  confirmBtn.classList.toggle('danger', Boolean(options.danger));

  root.classList.remove('hidden');
  confirmBtn.focus();

  return new Promise((resolve) => {
    const cleanup = (result: boolean) => {
      closeModal();
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      root.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onCancel = () => cleanup(false);
    const onConfirm = () => cleanup(true);
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === root) cleanup(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cleanup(false);
    };
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    root.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

export async function confirmTokenInput(options: {
  title: string;
  messageHtml: string;
  expectedToken: string;
  confirmLabel?: string;
}): Promise<boolean> {
  const root = ensureOverlay();
  const titleEl = root.querySelector('.modal-title') as HTMLElement;
  const bodyEl = root.querySelector('.modal-body') as HTMLElement;
  const cancelBtn = root.querySelector('.modal-cancel') as HTMLButtonElement;
  const confirmBtn = root.querySelector('.modal-confirm') as HTMLButtonElement;

  titleEl.textContent = options.title;
  bodyEl.innerHTML = `
    ${options.messageHtml}
    <p class="modal-phrase-hint">確認トークンを入力してください:</p>
    <code class="modal-phrase-target">${options.expectedToken}</code>
    <label class="modal-phrase-field">トークン
      <input type="text" class="modal-phrase-input" autocomplete="off" spellcheck="false" />
    </label>
    <p class="modal-phrase-match muted" aria-live="polite"></p>
  `;
  cancelBtn.textContent = 'キャンセル';
  confirmBtn.textContent = options.confirmLabel ?? '実行';
  confirmBtn.classList.add('danger');
  confirmBtn.disabled = true;

  const input = bodyEl.querySelector('.modal-phrase-input') as HTMLInputElement;
  const matchEl = bodyEl.querySelector('.modal-phrase-match') as HTMLElement;

  const syncMatch = () => {
    const ok = input.value === options.expectedToken;
    confirmBtn.disabled = !ok;
    matchEl.textContent = ok ? 'トークン一致' : '';
    matchEl.classList.toggle('match-ok', ok);
  };
  input.addEventListener('input', syncMatch);

  root.classList.remove('hidden');
  input.focus();

  return new Promise((resolve) => {
    const cleanup = (result: boolean) => {
      closeModal();
      input.removeEventListener('input', syncMatch);
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      root.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const onCancel = () => cleanup(false);
    const onConfirm = () => {
      if (input.value !== options.expectedToken) return;
      cleanup(true);
    };
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === root) cleanup(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cleanup(false);
    };
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    root.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}

export async function confirmSandboxExecute(options: {
  title: string;
  summaryHtml: string;
}): Promise<string | null> {
  const root = ensureOverlay();
  const titleEl = root.querySelector('.modal-title') as HTMLElement;
  const bodyEl = root.querySelector('.modal-body') as HTMLElement;
  const cancelBtn = root.querySelector('.modal-cancel') as HTMLButtonElement;
  const confirmBtn = root.querySelector('.modal-confirm') as HTMLButtonElement;

  titleEl.textContent = options.title;
  bodyEl.innerHTML = `
    ${options.summaryHtml}
    <p class="modal-phrase-hint">確認フレーズを入力してください:</p>
    <code class="modal-phrase-target">${SANDBOX_CONFIRMATION_PHRASE}</code>
    <label class="modal-phrase-field">フレーズ
      <input type="text" class="modal-phrase-input" autocomplete="off" spellcheck="false" />
    </label>
    <p class="modal-phrase-match muted" aria-live="polite"></p>
  `;
  cancelBtn.textContent = 'キャンセル';
  confirmBtn.textContent = '実行';
  confirmBtn.classList.remove('danger');
  confirmBtn.disabled = true;

  const input = bodyEl.querySelector('.modal-phrase-input') as HTMLInputElement;
  const matchEl = bodyEl.querySelector('.modal-phrase-match') as HTMLElement;

  const syncMatch = () => {
    const ok = input.value === SANDBOX_CONFIRMATION_PHRASE;
    confirmBtn.disabled = !ok;
    matchEl.textContent = ok ? 'フレーズ一致' : '';
    matchEl.classList.toggle('match-ok', ok);
  };
  input.addEventListener('input', syncMatch);

  root.classList.remove('hidden');
  input.focus();

  return new Promise((resolve) => {
    const cleanup = (phrase: string | null) => {
      closeModal();
      input.removeEventListener('input', syncMatch);
      cancelBtn.removeEventListener('click', onCancel);
      confirmBtn.removeEventListener('click', onConfirm);
      root.removeEventListener('click', onBackdrop);
      document.removeEventListener('keydown', onKey);
      resolve(phrase);
    };
    const onCancel = () => cleanup(null);
    const onConfirm = () => {
      if (input.value !== SANDBOX_CONFIRMATION_PHRASE) return;
      cleanup(input.value);
    };
    const onBackdrop = (event: MouseEvent) => {
      if (event.target === root) cleanup(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') cleanup(null);
    };
    cancelBtn.addEventListener('click', onCancel);
    confirmBtn.addEventListener('click', onConfirm);
    root.addEventListener('click', onBackdrop);
    document.addEventListener('keydown', onKey);
  });
}
