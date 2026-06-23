import type { ClosedDateDefinition, LessonMasterCatalog, LessonScheduleDefinition } from '../../src/contracts';
import { CalendarController } from '../../lib/calendar/calendar-controller';
import { formatDateKey } from '../../lib/calendar-utils';
import { loadLessonSession, saveLessonSession } from '../../lib/session-state';
import { confirmAction } from './confirm-modal';
import {
  closeLessonEditorDrawer,
  mountLessonEditorDrawer,
  type LessonEditorDefaults,
} from './lesson-editor-drawer';

export interface BoothLessonCalendarOptions {
  hostname: string;
  catalog: LessonMasterCatalog | null;
  closedDates: ClosedDateDefinition[];
  editorRoot: HTMLElement;
  onChange?: (lessons: LessonScheduleDefinition[]) => void;
}

export async function mountBoothLessonCalendar(
  root: HTMLElement,
  options: BoothLessonCalendarOptions,
): Promise<(partial?: Partial<BoothLessonCalendarOptions>) => Promise<void>> {
  let session = await loadLessonSession(options.hostname);
  let defaults: LessonEditorDefaults = session.defaults ?? {};
  let controller: CalendarController;

  const persist = async (lessons: LessonScheduleDefinition[]) => {
    session.lessons = lessons;
    await saveLessonSession(options.hostname, session);
    options.onChange?.(lessons);
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
  });

  return async (partial) => {
    if (partial?.catalog !== undefined) options.catalog = partial.catalog;
    if (partial?.closedDates !== undefined) options.closedDates = partial.closedDates;
    session = await loadLessonSession(options.hostname);
    controller.updateOptions({
      lessons: session.lessons,
      closedDates: options.closedDates,
      catalog: options.catalog,
    });
  };
}

export function boothCalendarJumpDateHint(): string {
  return `今日: ${formatDateKey(new Date())}`;
}
