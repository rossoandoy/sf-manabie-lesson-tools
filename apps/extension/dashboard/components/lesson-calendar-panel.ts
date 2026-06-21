import type { ClosedDateDefinition, LessonMasterCatalog, LessonScheduleDefinition } from '../../src/contracts';
import { CalendarController } from '../../lib/calendar/calendar-controller';
import { downloadText, formatDateKey } from '../../lib/calendar-utils';
import { loadLessonSession, saveLessonSession } from '../../lib/session-state';
import { scheduleDefinitionsToCsv } from '../../src/services/scheduleImportPlanBuilder';
import { confirmAction } from './confirm-modal';
import {
  closeLessonEditorDrawer,
  mountLessonEditorDrawer,
  type LessonEditorDefaults,
} from './lesson-editor-drawer';

export interface LessonCalendarPanelOptions {
  hostname: string;
  catalog: LessonMasterCatalog | null;
  closedDates: ClosedDateDefinition[];
  editorRoot: HTMLElement;
  onChange: (lessons: LessonScheduleDefinition[]) => void;
}

export async function mountLessonCalendarPanel(
  root: HTMLElement,
  options: LessonCalendarPanelOptions,
): Promise<(partial?: Partial<LessonCalendarPanelOptions>) => Promise<void>> {
  let session = await loadLessonSession(options.hostname);
  let defaults: LessonEditorDefaults = session.defaults ?? {};
  let controller: CalendarController;

  const persist = async (lessons: LessonScheduleDefinition[]) => {
    session.lessons = lessons;
    await saveLessonSession(options.hostname, session);
    options.onChange(lessons);
    controller.updateOptions({ lessons, closedDates: options.closedDates, catalog: options.catalog });
  };

  const openEditor = (existing: LessonScheduleDefinition | null, dateKey: string) => {
    mountLessonEditorDrawer(options.editorRoot, dateKey, existing, {
      catalog: options.catalog,
      session,
      defaults,
      onSave: async (lesson, newDefaults) => {
        defaults = newDefaults;
        session.defaults = newDefaults;
        const lessons = existing
          ? session.lessons.map((l) => (l.id === existing.id ? lesson : l))
          : [...session.lessons, lesson];
        await saveLessonSession(options.hostname, session);
        await persist(lessons);
        closeLessonEditorDrawer(options.editorRoot);
      },
      onDelete: async (id) => {
        await persist(session.lessons.filter((l) => l.id !== id));
        closeLessonEditorDrawer(options.editorRoot);
      },
      onCopy: async (lesson) => {
        controller.copyLessonToSelected(lesson);
        closeLessonEditorDrawer(options.editorRoot);
      },
      onClose: () => closeLessonEditorDrawer(options.editorRoot),
    });
  };

  controller = new CalendarController(root, {
    mode: 'lesson',
    lessons: session.lessons,
    closedDates: options.closedDates,
    onLessonsChange: (lessons) => void persist(lessons),
    onEditLesson: openEditor,
    onExportCsv: () => downloadText(`${formatDateKey(new Date())}.csv`, scheduleDefinitionsToCsv(session.lessons)),
    onClearAll: async () => {
      if (!(await confirmAction({
        title: '授業をすべて削除',
        messageHtml: '<p>カレンダー上の授業をすべて削除します。この操作は元に戻せません。</p>',
        confirmLabel: '削除する',
        danger: true,
      }))) return;
      await persist([]);
    },
  });

  return async (partial) => {
    if (partial.catalog !== undefined) options.catalog = partial.catalog;
    if (partial.closedDates !== undefined) options.closedDates = partial.closedDates;
    session = await loadLessonSession(options.hostname);
    controller.updateOptions({
      lessons: session.lessons,
      closedDates: options.closedDates,
      catalog: options.catalog,
    });
  };
}

export async function mountDrawerPanel(root: HTMLElement, hostname: string): Promise<void> {
  const session = await loadLessonSession(hostname);
  root.innerHTML = `
    <label>年度（CSV）<input id="fiscal-year" value="${session.fiscalYearOverride}" placeholder="空欄=自動" /></label>
    <h3>タイムスロット</h3>
    <div id="time-slot-list"></div>
    <button type="button" id="btn-add-slot" class="btn">+ タイムスロット</button>
  `;
  const list = root.querySelector('#time-slot-list') as HTMLElement;
  const renderSlots = () => {
    list.innerHTML = session.timeSlots
      .map(
        (slot) => `
          <div class="slot-row">
            <button type="button" data-default="${slot.id}" class="btn">${slot.isDefault ? '★' : '☆'}</button>
            <input data-id="${slot.id}" data-field="name" value="${slot.name}" style="width:70px" />
            <input data-id="${slot.id}" data-field="startTime" type="time" value="${slot.startTime}" />
            <input data-id="${slot.id}" data-field="endTime" type="time" value="${slot.endTime}" />
            <button type="button" data-remove="${slot.id}" class="btn">×</button>
          </div>`,
      )
      .join('');
  };
  renderSlots();
  root.querySelector('#fiscal-year')?.addEventListener('change', async (event) => {
    session.fiscalYearOverride = (event.target as HTMLInputElement).value;
    await saveLessonSession(hostname, session);
  });
  root.querySelector('#btn-add-slot')?.addEventListener('click', async () => {
    session.timeSlots.push({ id: `ts-${Date.now()}`, name: '新規', startTime: '13:00', endTime: '14:00' });
    await saveLessonSession(hostname, session);
    renderSlots();
  });
  list.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;
    const removeId = target.getAttribute('data-remove');
    const defaultId = target.getAttribute('data-default');
    if (removeId) {
      session.timeSlots = session.timeSlots.filter((slot) => slot.id !== removeId);
      await saveLessonSession(hostname, session);
      renderSlots();
    }
    if (defaultId) {
      session.timeSlots = session.timeSlots.map((slot) => ({ ...slot, isDefault: slot.id === defaultId }));
      await saveLessonSession(hostname, session);
      renderSlots();
    }
  });
  list.addEventListener('change', async (event) => {
    const target = event.target as HTMLInputElement;
    const id = target.dataset.id;
    const field = target.dataset.field as 'name' | 'startTime' | 'endTime' | undefined;
    if (!id || !field) return;
    session.timeSlots = session.timeSlots.map((slot) => (slot.id === id ? { ...slot, [field]: target.value } : slot));
    await saveLessonSession(hostname, session);
  });
}
