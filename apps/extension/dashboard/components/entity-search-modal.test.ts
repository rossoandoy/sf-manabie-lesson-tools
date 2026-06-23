/** @vitest-environment jsdom */
import { describe, expect, it, vi } from 'vitest';
import { mountEntitySearchModal } from './entity-search-modal';

describe('entity-search-modal', () => {
  it('filters and selects a student record', () => {
    const onSelect = vi.fn();
    const close = mountEntitySearchModal({
      kind: 'student',
      title: '生徒を選択',
      records: [
        { id: '1', name: '田中', fields: { Grade__c: '中2', enrollmentStatus: 'Enrolled' } },
        { id: '2', name: '佐藤', fields: { Grade__c: '高1', enrollmentStatus: 'Temporary' } },
      ],
      onSelect,
    });

    const input = document.querySelector('.entity-search-input') as HTMLInputElement;
    input.value = '田中';
    input.dispatchEvent(new Event('input'));

    const item = document.querySelector('.entity-search-item') as HTMLButtonElement;
    item.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: '田中' }));
    close();
    expect(document.querySelector('.entity-search-overlay')).toBeNull();
  });
});
