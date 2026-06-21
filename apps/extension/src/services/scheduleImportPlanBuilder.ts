import type {
  LessonDiscoveryConfig,
  LessonMasterCatalog,
  LessonScheduleDefinition,
  ScheduleImportPlan,
  ValidationIssue,
} from '../contracts';
import {
  DEFAULT_DISCOVERY_CONFIG,
  SANDBOX_CONFIRMATION_PHRASE,
} from '../contracts';

function isoDateTime(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, hh - 9, mm, 0));
  return `${date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00+09:00`;
}

function validateDefinition(def: LessonScheduleDefinition): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!def.lessonName.trim()) {
    issues.push({ severity: 'error', code: 'REQUIRED', message: '授業名は必須です', definitionId: def.id, field: 'lessonName' });
  }
  if (!def.locationId) {
    issues.push({ severity: 'error', code: 'REQUIRED', message: '拠点を選択してください', definitionId: def.id, field: 'locationId' });
  }
  if (!def.academicYearId) {
    issues.push({ severity: 'error', code: 'REQUIRED', message: '年度を選択してください', definitionId: def.id, field: 'academicYearId' });
  }
  if (!def.startTime || !def.endTime) {
    issues.push({ severity: 'error', code: 'REQUIRED', message: '開始/終了時間は必須です', definitionId: def.id });
  }
  return issues;
}

export function buildScheduleImportPlan(input: {
  definitions: LessonScheduleDefinition[];
  catalog: LessonMasterCatalog;
  discovery?: LessonDiscoveryConfig;
}): ScheduleImportPlan {
  const config = input.discovery ?? DEFAULT_DISCOVERY_CONFIG;
  const f = config.fields;
  const validationIssues = input.definitions.flatMap(validateDefinition);
  const planId = `schedule-${Date.now()}`;
  const scheduleRecords = input.definitions.map((def, index) => ({
    localRef: `schedule:${index}`,
    fields: {
      [f.lessonSchedule.name]: def.lessonName,
      [f.lessonSchedule.location]: def.locationId,
      [f.lessonSchedule.academicYear]: def.academicYearId,
      [f.lessonSchedule.startDateTime]: isoDateTime(def.lessonDate, def.startTime),
      [f.lessonSchedule.endDateTime]: isoDateTime(def.repeatEndDate || def.lessonDate, def.endTime),
      [f.lessonSchedule.teachingMethod]: def.teachingMethod,
      [f.lessonSchedule.teachingMedium]: def.teachingMedium,
      [f.lessonSchedule.locationCourse]: def.locationCourseId || undefined,
      [f.lessonSchedule.capacity]: def.capacity ? Number(def.capacity) : undefined,
    },
  }));

  const teacherRecords = input.definitions.map((def, index) => ({
    localRef: `teacher:${index}`,
    fields: {
      [f.lessonScheduleTeacher.lessonSchedule]: `{{ref:schedule:${index}}}`,
      ...(def.teacherId
        ? { [f.lessonScheduleTeacher.teacher]: def.teacherId }
        : { [f.lessonScheduleTeacher.teacherName]: def.teacherName }),
    },
  }));

  const classroomRecords = input.definitions
    .filter((def) => def.classroomId)
    .map((def, _i, arr) => {
      const index = input.definitions.indexOf(def);
      return {
        localRef: `classroom:${index}`,
        fields: {
          [f.lessonScheduleClassroom.lessonSchedule]: `{{ref:schedule:${index}}}`,
          [f.lessonScheduleClassroom.classroom]: def.classroomId,
        },
      };
    });

  const classRecords = input.definitions
    .filter((def) => def.classId)
    .map((def) => {
      const index = input.definitions.indexOf(def);
      return {
        localRef: `class:${index}`,
        fields: {
          [f.lessonScheduleClass.lessonSchedule]: `{{ref:schedule:${index}}}`,
          [f.lessonScheduleClass.classRef]: def.classId,
        },
      };
    });

  const batches = [
    {
      batchId: 'batch-lesson-schedule',
      artifactKind: 'lessonSchedule' as const,
      sobjectApiName: config.lessonScheduleObject,
      operation: 'create' as const,
      records: scheduleRecords,
    },
    {
      batchId: 'batch-lesson-schedule-teacher',
      artifactKind: 'lessonScheduleTeacher' as const,
      sobjectApiName: config.lessonScheduleTeacherObject,
      operation: 'create' as const,
      dependsOn: ['batch-lesson-schedule'],
      records: teacherRecords,
    },
  ];

  if (classroomRecords.length) {
    batches.push({
      batchId: 'batch-lesson-schedule-classroom',
      artifactKind: 'lessonScheduleClassroom' as const,
      sobjectApiName: config.lessonScheduleClassroomObject,
      operation: 'create' as const,
      dependsOn: ['batch-lesson-schedule'],
      records: classroomRecords,
    });
  }

  if (classRecords.length) {
    batches.push({
      batchId: 'batch-lesson-schedule-class',
      artifactKind: 'lessonScheduleClass' as const,
      sobjectApiName: config.lessonScheduleClassObject,
      operation: 'create' as const,
      dependsOn: ['batch-lesson-schedule'],
      records: classRecords,
    });
  }

  return {
    planId,
    createdAt: new Date().toISOString(),
    targetOrg: {
      orgId: input.catalog.org.orgId,
      username: input.catalog.org.username,
      instanceUrl: input.catalog.org.instanceUrl,
      isSandbox: input.catalog.org.isSandbox ?? true,
    },
    sourceDefinitions: input.definitions,
    batches,
    executionPolicy: {
      confirmationPhrase: SANDBOX_CONFIRMATION_PHRASE,
      productionWrites: 'blocked',
      blockIfPlaceholdersRemain: true,
    },
    validationIssues,
  };
}

export function scheduleDefinitionsToCsv(definitions: LessonScheduleDefinition[]): string {
  const header = '拠点,年度,開始日,終了日,指導法種別,授業形態,拠点コース,クラス,教室,授業名,講師名,定員';
  const rows = definitions.map((def) => {
    const locationCourse = def.locationCourseName
      ? `${def.locationCourseName} - ${def.locationName}`
      : def.locationCourseName;
    const start = `${def.lessonDate}T${def.startTime}:00+09:00`;
    const end = `${def.repeatEndDate || def.lessonDate}T${def.endTime}:00+09:00`;
    return [
      def.locationName,
      def.academicYearName,
      start,
      end,
      def.teachingMethod,
      def.teachingMedium,
      locationCourse,
      def.className,
      def.classroomName,
      def.lessonName,
      def.teacherName,
      def.capacity,
    ]
      .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
      .join(',');
  });
  return [header, ...rows].join('\n');
}

export function schoolYearFromDate(dateStr: string): number {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();
  return month >= 4 ? year : year - 1;
}
