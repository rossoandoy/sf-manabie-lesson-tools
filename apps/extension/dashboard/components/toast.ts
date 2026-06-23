export type ToastVariant = 'info' | 'success' | 'error';

let container: HTMLElement | null = null;

function ensureContainer(): HTMLElement {
  if (container && document.body.contains(container)) return container;
  container = document.createElement('div');
  container.className = 'toast-container';
  container.setAttribute('role', 'status');
  container.setAttribute('aria-live', 'polite');
  document.body.appendChild(container);
  return container;
}

export function showToast(message: string, variant: ToastVariant = 'info', durationMs = 5000): void {
  const host = ensureContainer();
  const el = document.createElement('div');
  el.className = `toast toast-${variant}`;
  el.textContent = message;
  host.appendChild(el);
  window.setTimeout(() => {
    el.classList.add('toast-dismiss');
    window.setTimeout(() => el.remove(), 300);
  }, durationMs);
}

export function showAlert(message: string): void {
  showToast(message, 'info', 7000);
}
