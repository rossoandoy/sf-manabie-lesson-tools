import type { ClosedDateDefinition, LessonScheduleDefinition } from '../../src/contracts';
import {
  closeMiniCalendar,
  createInitialCalendarState,
  jumpToToday,
  navigateNext,
  navigatePrev,
  selectDate,
  setView,
  toggleMiniCalendar,
  type CalendarUIState,
  type CalendarViewMode,
} from './calendar-state';
import { renderCalendarBody, renderToolbar, type CalendarRenderOptions } from './calendar-render';
import { applyLessonDrop, getLessonDragId, setLessonDragData } from './drag-drop';
import { copyLesson } from './lesson-sort';

export interface CalendarControllerOptions {
  mode: 'lesson' | 'closed';
  showLessonChips?: boolean;
  lessons: LessonScheduleDefinition[];
  closedDates: ClosedDateDefinition[];
  onLessonsChange?: (lessons: LessonScheduleDefinition[]) => void;
  onClosedDatesChange?: (closedDates: ClosedDateDefinition[]) => void;
  onEditLesson?: (lesson: LessonScheduleDefinition | null, dateKey: string) => void;
  onEditClosed?: (item: ClosedDateDefinition | null, dateKey: string) => void;
  onExportCsv?: () => void;
  onClearAll?: () => void;
}

export class CalendarController {
  private root: HTMLElement;
  private toolbarEl: HTMLElement;
  private bodyEl: HTMLElement;
  private state: CalendarUIState = createInitialCalendarState();
  private options: CalendarControllerOptions;
  private bound = false;
  private draggingLessonId: string | null = null;

  constructor(root: HTMLElement, options: CalendarControllerOptions) {
    this.root = root;
    this.options = options;
    this.root.innerHTML = `<div class="calendar-toolbar"></div><div class="calendar-body"></div>`;
    this.toolbarEl = this.root.querySelector('.calendar-toolbar')!;
    this.bodyEl = this.root.querySelector('.calendar-body')!;
    this.bindEvents();
    this.render();
  }

  updateOptions(partial: Partial<CalendarControllerOptions>): void {
    this.options = { ...this.options, ...partial };
    this.render();
  }

  getState(): CalendarUIState {
    return this.state;
  }

  private renderOptions(): CalendarRenderOptions {
    return {
      state: this.state,
      lessons: this.options.lessons,
      closedDates: this.options.closedDates,
      mode: this.options.mode,
      showLessonChips: this.options.showLessonChips,
    };
  }

  render(): void {
    this.toolbarEl.innerHTML = renderToolbar(this.state, this.options.mode);
    this.bodyEl.innerHTML = renderCalendarBody(this.renderOptions());
  }

  private bindEvents(): void {
    if (this.bound) return;
    this.bound = true;

    this.root.addEventListener('click', (event) => {
      const target = (event.target as HTMLElement).closest('[data-action]') as HTMLElement | null;
      if (!target) {
        const cell = (event.target as HTMLElement).closest('[data-date]') as HTMLElement | null;
        if (cell?.dataset.date && this.options.mode === 'lesson') {
          this.options.onEditLesson?.(null, cell.dataset.date);
        } else if (cell?.dataset.date && this.options.mode === 'closed') {
          this.options.onEditClosed?.(null, cell.dataset.date);
        }
        return;
      }
      const action = target.dataset.action!;
      event.stopPropagation();

      if (action === 'prev') this.state = navigatePrev(this.state);
      else if (action === 'next') this.state = navigateNext(this.state);
      else if (action === 'today') this.state = jumpToToday(this.state);
      else if (action === 'toggle-mini') this.state = toggleMiniCalendar(this.state);
      else if (action === 'view-month') this.state = setView(this.state, 'month');
      else if (action === 'view-week') this.state = setView(this.state, 'week');
      else if (action === 'view-day') this.state = setView(this.state, 'day');
      else if (action === 'add-lesson') this.options.onEditLesson?.(null, this.state.selectedDate);
      else if (action === 'export-csv') this.options.onExportCsv?.();
      else if (action === 'clear-all') this.options.onClearAll?.();
      else if (action === 'select-date') {
        const date = target.dataset.date!;
        this.state = selectDate(this.state, date);
        this.state = closeMiniCalendar(this.state);
      } else if (action === 'edit-lesson') {
        const id = target.dataset.lessonId!;
        const lesson = this.options.lessons.find((l) => l.id === id);
        if (lesson) this.options.onEditLesson?.(lesson, lesson.lessonDate);
      } else if (action === 'delete-lesson') {
        const id = target.dataset.lessonId!;
        if (confirm('この授業を削除しますか？')) {
          this.options.onLessonsChange?.(this.options.lessons.filter((l) => l.id !== id));
        }
      } else if (action === 'copy-lesson') {
        const id = target.dataset.lessonId!;
        const lesson = this.options.lessons.find((l) => l.id === id);
        if (lesson) this.copyLessonToSelected(lesson);
      } else if (action === 'delete-closed') {
        const id = target.dataset.closedId!;
        this.options.onClosedDatesChange?.(this.options.closedDates.filter((c) => c.id !== id));
      } else if (action === 'edit-closed') {
        const id = target.dataset.closedId!;
        const item = this.options.closedDates.find((c) => c.id === id);
        if (item) this.options.onEditClosed?.(item, item.date);
      }
      this.render();
    });

    this.root.addEventListener('dragstart', (event) => {
      const chip = (event.target as HTMLElement).closest('.lesson-chip') as HTMLElement | null;
      if (!chip || !event.dataTransfer) return;
      this.draggingLessonId = chip.dataset.lessonId ?? null;
      setLessonDragData(event, this.draggingLessonId!);
      chip.classList.add('dragging');
    });

    this.root.addEventListener('dragend', () => {
      this.draggingLessonId = null;
      this.root.querySelectorAll('.lesson-chip.dragging').forEach((el) => el.classList.remove('dragging'));
      this.root.querySelectorAll('.calendar-cell.drop-target').forEach((el) => el.classList.remove('drop-target'));
    });

    this.root.addEventListener('dragover', (event) => {
      const cell = (event.target as HTMLElement).closest('.calendar-cell') as HTMLElement | null;
      if (!cell) return;
      event.preventDefault();
      cell.classList.add('drop-target');
    });

    this.root.addEventListener('dragleave', (event) => {
      const cell = (event.target as HTMLElement).closest('.calendar-cell') as HTMLElement | null;
      cell?.classList.remove('drop-target');
    });

    this.root.addEventListener('drop', (event) => {
      const cell = (event.target as HTMLElement).closest('.calendar-cell') as HTMLElement | null;
      if (!cell?.dataset.date) return;
      event.preventDefault();
      cell.classList.remove('drop-target');
      const lessonId = getLessonDragId(event) || this.draggingLessonId;
      if (!lessonId) return;
      const closedSet = new Set(this.options.closedDates.map((c) => c.date));
      const result = applyLessonDrop(this.options.lessons, lessonId, cell.dataset.date, closedSet);
      if (result.blocked) {
        alert('休校日には授業を配置できません。');
        return;
      }
      this.options.onLessonsChange?.(result.lessons);
      this.state = selectDate(this.state, cell.dataset.date);
      this.render();
    });

    document.addEventListener('click', (event) => {
      if (!this.state.miniCalendarOpen) return;
      const wrap = this.root.querySelector('.mini-cal-wrap');
      if (wrap && !wrap.contains(event.target as Node)) {
        this.state = closeMiniCalendar(this.state);
        this.render();
      }
    });
  }

  copyLessonToSelected(lesson: LessonScheduleDefinition): void {
    const copy = copyLesson(lesson, this.state.selectedDate);
    this.options.onLessonsChange?.([...this.options.lessons, copy]);
  }
}

export function viewFromAction(action: string): CalendarViewMode | null {
  if (action === 'view-month') return 'month';
  if (action === 'view-week') return 'week';
  if (action === 'view-day') return 'day';
  return null;
}
