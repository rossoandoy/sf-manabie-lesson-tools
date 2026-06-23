import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { confirmAction, confirmSandboxExecute } from './confirm-modal';
import { SANDBOX_CONFIRMATION_PHRASE } from '../../src/contracts';

describe('confirmSandboxExecute', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns null when cancelled', async () => {
    const promise = confirmSandboxExecute({ title: 'Test', summaryHtml: '<p>summary</p>' });
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    expect(overlay).toBeTruthy();
    (overlay.querySelector('.modal-cancel') as HTMLButtonElement).click();
    await expect(promise).resolves.toBeNull();
  });

  it('returns phrase when input matches', async () => {
    const promise = confirmSandboxExecute({ title: 'Test', summaryHtml: '<p>summary</p>' });
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    const input = overlay.querySelector('.modal-phrase-input') as HTMLInputElement;
    const confirm = overlay.querySelector('.modal-confirm') as HTMLButtonElement;
    input.value = SANDBOX_CONFIRMATION_PHRASE;
    input.dispatchEvent(new Event('input'));
    expect(confirm.disabled).toBe(false);
    confirm.click();
    await expect(promise).resolves.toBe(SANDBOX_CONFIRMATION_PHRASE);
  });

  it('keeps confirm disabled until phrase matches', async () => {
    void confirmSandboxExecute({ title: 'Test', summaryHtml: '' });
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    const input = overlay.querySelector('.modal-phrase-input') as HTMLInputElement;
    const confirm = overlay.querySelector('.modal-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    input.value = 'wrong';
    input.dispatchEvent(new Event('input'));
    expect(confirm.disabled).toBe(true);
  });
});

describe('confirmAction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns false when cancelled', async () => {
    const promise = confirmAction({ title: 'Cancel test', messageHtml: '<p>body</p>' });
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    (overlay.querySelector('.modal-cancel') as HTMLButtonElement).click();
    await expect(promise).resolves.toBe(false);
  });

  it('returns true when confirmed', async () => {
    const promise = confirmAction({
      title: 'Confirm test',
      messageHtml: '<p>proceed?</p>',
      confirmLabel: 'OK',
    });
    const overlay = document.querySelector('.modal-overlay') as HTMLElement;
    (overlay.querySelector('.modal-confirm') as HTMLButtonElement).click();
    await expect(promise).resolves.toBe(true);
  });
});
