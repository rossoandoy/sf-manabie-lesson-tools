import type { ClosedDateDefinition, LessonMasterCatalog } from '../../src/contracts';
import { CalendarController } from '../../lib/calendar/calendar-controller';
import { downloadText, formatDateKey } from '../../lib/calendar-utils';
import { loadClosedDateSession, saveClosedDateSession } from '../../lib/session-state';
import { closedDateDefinitionsToCsv } from '../../src/services/closedDatePlanBuilder';
import { confirmAction } from './confirm-modal';
import { closeLessonEditorDrawer, mountClosedEditorDrawer } from './lesson-editor-drawer';

export interface ClosedDatePanelOptions {
  hostname: string;
  catalog: LessonMasterCatalog | null;
  editorRoot: HTMLElement;
  onChange: (items: ClosedDateDefinition[]) => void;
}

export async function mountClosedDatePanel(
  root: HTMLElement,
  options: ClosedDatePanelOptions,
): Promise<(partial?: Partial<ClosedDatePanelOptions>) => Promise<void>> {
  let session = await loadClosedDateSession(options.hostname);
  let controller: CalendarController;

  const persist = async (closedDates: ClosedDateDefinition[]) => {
    session.closedDates = closedDates;
    await saveClosedDateSession(options.hostname, session);
    options.onChange(closedDates);
    controller.updateOptions({ closedDates, lessons: [], catalog: options.catalog });
  };

  const openEditor = (existing: ClosedDateDefinition | null, dateKey: string) => {
    mountClosedEditorDrawer(
      options.editorRoot,
      dateKey,
      existing,
      options.catalog,
      async (item) => {
        const items = existing
          ? session.closedDates.map((c) => (c.id === existing.id ? item : c))
          : [...session.closedDates, item];
        await persist(items);
        closeLessonEditorDrawer(options.editorRoot);
      },
      async (id) => {
        await persist(session.closedDates.filter((c) => c.id !== id));
        closeLessonEditorDrawer(options.editorRoot);
      },
      () => closeLessonEditorDrawer(options.editorRoot),
    );
  };

  controller = new CalendarController(root, {
    mode: 'closed',
    showLessonChips: false,
    lessons: [],
    closedDates: session.closedDates,
    onClosedDatesChange: (items) => void persist(items),
    onEditClosed: openEditor,
    onExportCsv: () => downloadText(`${formatDateKey(new Date())}.csv`, closedDateDefinitionsToCsv(session.closedDates)),
    onClearAll: async () => {
      if (!(await confirmAction({
        title: '休校日をすべて削除',
        messageHtml: '<p>登録済みの休校日をすべて削除します。</p>',
        confirmLabel: '削除する',
        danger: true,
      }))) return;
      await persist([]);
    },
  });

  return async (partial) => {
    if (partial?.catalog !== undefined) options.catalog = partial.catalog;
    session = await loadClosedDateSession(options.hostname);
    controller.updateOptions({ closedDates: session.closedDates, catalog: options.catalog });
  };
}
