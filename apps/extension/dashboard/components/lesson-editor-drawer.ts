import type {
  LessonMasterCatalog,
  LessonScheduleDefinition,
  TeachingMedium,
  TeachingMethod,
  TimeSlotTemplate,
} from '../../src/contracts';
import { createId, schoolYearFromDate } from '../../lib/calendar-utils';
import {
  filterClassesForCourse,
  filterClassroomsForLocation,
  filterLocationCoursesForLocation,
  type LessonSessionState,
} from '../../lib/session-state';

export interface LessonEditorDefaults {
  locationId?: string;
  locationCourseId?: string;
  classId?: string;
  classroomId?: string;
  teacherId?: string;
}

export interface LessonEditorOptions {
  catalog: LessonMasterCatalog | null;
  session: LessonSessionState;
  defaults: LessonEditorDefaults;
  onSave: (lesson: LessonScheduleDefinition, defaults: LessonEditorDefaults) => void;
  onDelete?: (lessonId: string) => void;
  onCopy?: (lesson: LessonScheduleDefinition) => void;
  onClose: () => void;
}

function renderOptions(items: Array<{ id: string; name: string }>, selectedId?: string): string {
  return `<option value="">選択してください</option>${items
    .map((item) => `<option value="${item.id}" ${item.id === selectedId ? 'selected' : ''}>${item.name}</option>`)
    .join('')}`;
}

export function mountLessonEditorDrawer(
  root: HTMLElement,
  dateKey: string,
  existing: LessonScheduleDefinition | null,
  options: LessonEditorOptions,
): void {
  const defaultSlot = options.session.timeSlots.find((s) => s.isDefault) ?? options.session.timeSlots[0];
  const fiscalYear = options.session.fiscalYearOverride || String(schoolYearFromDate(dateKey));
  const locationId = existing?.locationId || options.defaults.locationId || options.catalog?.catalogs.locations[0]?.id || '';
  const locationCourses = filterLocationCoursesForLocation(options.catalog, locationId);
  const locationCourseId = existing?.locationCourseId || options.defaults.locationCourseId || locationCourses[0]?.id || '';
  const classes = filterClassesForCourse(options.catalog, locationCourseId);
  const classrooms = filterClassroomsForLocation(options.catalog, locationId);
  const noCatalog = !options.catalog;

  root.innerHTML = `
    <div class="editor-drawer open" id="lesson-editor-drawer">
      <div class="editor-drawer-header">
        <strong>${existing ? '授業編集' : '授業追加'}</strong>
        <button type="button" class="btn" id="btn-close-editor">×</button>
      </div>
      ${noCatalog ? '<p class="muted">前提マスタ同期後に拠点等を選択できます。</p>' : ''}
      <form id="lesson-form" class="form-grid form-grid-single">
        <label>授業名<input name="lessonName" required value="${existing?.lessonName ?? ''}" /></label>
        <label>授業日<input name="lessonDate" type="date" required value="${existing?.lessonDate ?? dateKey}" /></label>
        <label>開始<input name="startTime" type="time" required value="${existing?.startTime ?? defaultSlot?.startTime ?? '10:00'}" /></label>
        <label>終了<input name="endTime" type="time" required value="${existing?.endTime ?? defaultSlot?.endTime ?? '11:00'}" /></label>
        <label>指導法<select name="teachingMethod" ${noCatalog ? 'disabled' : ''}>
          <option value="Group" ${existing?.teachingMethod !== 'Individual' ? 'selected' : ''}>集団</option>
          <option value="Individual" ${existing?.teachingMethod === 'Individual' ? 'selected' : ''}>個別</option>
        </select></label>
        <label>形態<select name="teachingMedium" ${noCatalog ? 'disabled' : ''}>
          <option value="Offline" ${existing?.teachingMedium !== 'Online' ? 'selected' : ''}>オフライン</option>
          <option value="Online" ${existing?.teachingMedium === 'Online' ? 'selected' : ''}>オンライン</option>
        </select></label>
        <label>拠点<select name="locationId" id="field-location" ${noCatalog ? 'disabled' : ''}>${renderOptions(options.catalog?.catalogs.locations ?? [], locationId)}</select></label>
        <label>年度<select name="academicYearId" ${noCatalog ? 'disabled' : ''}>${renderOptions(options.catalog?.catalogs.academicYears ?? [], existing?.academicYearId)}</select></label>
        <label>拠点コース<select name="locationCourseId" id="field-location-course" ${noCatalog ? 'disabled' : ''}>${renderOptions(locationCourses, locationCourseId)}</select></label>
        <label>クラス<select name="classId" id="field-class" ${noCatalog ? 'disabled' : ''}>${renderOptions(classes, existing?.classId || options.defaults.classId)}</select></label>
        <label>教室<select name="classroomId" id="field-classroom" ${noCatalog ? 'disabled' : ''}>${renderOptions(classrooms, existing?.classroomId || options.defaults.classroomId)}</select></label>
        <label>講師<select name="teacherId" ${noCatalog ? 'disabled' : ''}>${renderOptions(options.catalog?.catalogs.teachers ?? [], existing?.teacherId || options.defaults.teacherId)}</select></label>
        <label>定員<input name="capacity" value="${existing?.capacity ?? ''}" /></label>
        <label>繰り返し終了日<input name="repeatEndDate" type="date" value="${existing?.repeatEndDate ?? dateKey}" /></label>
      </form>
      <div class="footer-actions">
        ${existing ? '<button type="button" id="btn-copy-lesson" class="btn">コピー</button>' : ''}
        ${existing ? '<button type="button" id="btn-delete-lesson" class="btn danger">削除</button>' : ''}
        <button type="button" id="btn-save-lesson" class="btn primary">保存</button>
      </div>
    </div>
  `;

  root.querySelector('#btn-close-editor')?.addEventListener('click', options.onClose);

  root.querySelector('#field-location')?.addEventListener('change', (event) => {
    const locId = (event.target as HTMLSelectElement).value;
    const courseSelect = root.querySelector('#field-location-course') as HTMLSelectElement;
    const classSelect = root.querySelector('#field-class') as HTMLSelectElement;
    const classroomSelect = root.querySelector('#field-classroom') as HTMLSelectElement;
    const courses = filterLocationCoursesForLocation(options.catalog, locId);
    courseSelect.innerHTML = renderOptions(courses);
    classSelect.innerHTML = renderOptions(filterClassesForCourse(options.catalog, courseSelect.value));
    classroomSelect.innerHTML = renderOptions(filterClassroomsForLocation(options.catalog, locId));
  });

  root.querySelector('#btn-delete-lesson')?.addEventListener('click', () => {
    if (existing) options.onDelete?.(existing.id);
  });

  root.querySelector('#btn-copy-lesson')?.addEventListener('click', () => {
    if (existing) options.onCopy?.(existing);
  });

  const save = () => {
    const form = root.querySelector('#lesson-form') as HTMLFormElement;
    const data = new FormData(form);
    const locId = String(data.get('locationId') ?? '');
    const locationCourseIdVal = String(data.get('locationCourseId') ?? '');
    const classId = String(data.get('classId') ?? '');
    const classroomId = String(data.get('classroomId') ?? '');
    const teacherId = String(data.get('teacherId') ?? '');
    const academicYearId = String(data.get('academicYearId') ?? '');
    const definition: LessonScheduleDefinition = {
      id: existing?.id ?? createId('lesson'),
      lessonName: String(data.get('lessonName') ?? ''),
      lessonDate: String(data.get('lessonDate') ?? dateKey),
      startTime: String(data.get('startTime') ?? ''),
      endTime: String(data.get('endTime') ?? ''),
      teachingMethod: String(data.get('teachingMethod') ?? 'Group') as TeachingMethod,
      teachingMedium: String(data.get('teachingMedium') ?? 'Offline') as TeachingMedium,
      locationId: locId,
      locationName: options.catalog?.catalogs.locations.find((i) => i.id === locId)?.name ?? '',
      academicYearId,
      academicYearName: options.catalog?.catalogs.academicYears.find((i) => i.id === academicYearId)?.name ?? fiscalYear,
      locationCourseId: locationCourseIdVal,
      locationCourseName: options.catalog?.catalogs.locationCourses.find((i) => i.id === locationCourseIdVal)?.name ?? '',
      classId,
      className: options.catalog?.catalogs.classes.find((i) => i.id === classId)?.name ?? '',
      classroomId,
      classroomName: options.catalog?.catalogs.classrooms.find((i) => i.id === classroomId)?.name ?? '',
      teacherId,
      teacherName: options.catalog?.catalogs.teachers.find((i) => i.id === teacherId)?.name ?? '',
      capacity: String(data.get('capacity') ?? ''),
      repeatEndDate: String(data.get('repeatEndDate') ?? dateKey),
    };
    const newDefaults: LessonEditorDefaults = {
      locationId: locId,
      locationCourseId: locationCourseIdVal,
      classId,
      classroomId,
      teacherId,
    };
    options.onSave(definition, newDefaults);
  };

  root.querySelector('#btn-save-lesson')?.addEventListener('click', save);

  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') options.onClose();
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName !== 'TEXTAREA') {
      event.preventDefault();
      save();
    }
  });
}

export function closeLessonEditorDrawer(root: HTMLElement): void {
  root.innerHTML = '';
}

export function mountClosedEditorDrawer(
  root: HTMLElement,
  dateKey: string,
  existing: import('../../src/contracts').ClosedDateDefinition | null,
  catalog: LessonMasterCatalog | null,
  onSave: (item: import('../../src/contracts').ClosedDateDefinition) => void,
  onDelete: (id: string) => void,
  onClose: () => void,
): void {
  const yearName = String(schoolYearFromDate(dateKey));
  root.innerHTML = `
    <div class="editor-drawer open">
      <div class="editor-drawer-header">
        <strong>${existing ? '休校日編集' : '休校日追加'}</strong>
        <button type="button" class="btn" id="btn-close-closed-editor">×</button>
      </div>
      <form id="closed-form" class="form-grid form-grid-single">
        <label>表示する休校日名<input name="title" required value="${existing?.title ?? ''}" placeholder="例: 夏期講習・臨時休校" /></label>
        <label>日付<input name="date" type="date" required value="${existing?.date ?? dateKey}" /></label>
        <label>年度<select name="academicYearId">${(catalog?.catalogs.academicYears ?? [])
          .map(
            (item) =>
              `<option value="${item.id}" ${item.name.includes(yearName) || item.id === existing?.academicYearId ? 'selected' : ''}>${item.name}</option>`,
          )
          .join('')}</select></label>
      </form>
      <div class="footer-actions">
        ${existing ? '<button type="button" id="btn-delete-closed" class="btn danger">削除</button>' : ''}
        <button type="button" id="btn-save-closed" class="btn primary">保存</button>
      </div>
    </div>
  `;
  root.querySelector('#btn-close-closed-editor')?.addEventListener('click', onClose);
  root.querySelector('#btn-delete-closed')?.addEventListener('click', () => existing && onDelete(existing.id));
  root.querySelector('#btn-save-closed')?.addEventListener('click', () => {
    const form = root.querySelector('#closed-form') as HTMLFormElement;
    const data = new FormData(form);
    const academicYearId = String(data.get('academicYearId') ?? '');
    onSave({
      id: existing?.id ?? createId('closed'),
      title: String(data.get('title') ?? ''),
      date: String(data.get('date') ?? dateKey),
      academicYearId,
      academicYearName: catalog?.catalogs.academicYears.find((i) => i.id === academicYearId)?.name ?? yearName,
    });
  });
}
