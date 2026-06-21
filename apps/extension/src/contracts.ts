/** Lesson Tools domain contracts. */

export type Severity = 'info' | 'warning' | 'error';

export type ScheduleArtifactKind =
  | 'lessonSchedule'
  | 'lessonScheduleTeacher'
  | 'lessonScheduleClassroom'
  | 'lessonScheduleClass'
  | 'closedDate'
  | 'academicCalendarClosedDate'
  | 'lessonSlot'
  | 'studentSession'
  | 'studentSessionCreate'
  | 'reallocation';

export interface CatalogRecord {
  id: string;
  name: string;
  apiName?: string;
  fields?: Record<string, unknown>;
}

export interface LessonMasterCatalog {
  org: {
    orgId: string;
    username: string;
    instanceUrl?: string;
    isSandbox?: boolean;
  };
  syncedAt: string;
  catalogs: {
    locations: CatalogRecord[];
    academicYears: CatalogRecord[];
    locationCourses: CatalogRecord[];
    classes: CatalogRecord[];
    classrooms: CatalogRecord[];
    teachers: CatalogRecord[];
    students: CatalogRecord[];
    academicCalendars: CatalogRecord[];
  };
}

export interface TimeSlotTemplate {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  isDefault?: boolean;
}

export type TeachingMethod = 'Group' | 'Individual';
export type TeachingMedium = 'Offline' | 'Online';

export interface LessonScheduleDefinition {
  id: string;
  lessonName: string;
  lessonDate: string;
  startTime: string;
  endTime: string;
  teachingMethod: TeachingMethod;
  teachingMedium: TeachingMedium;
  locationId: string;
  locationName: string;
  academicYearId: string;
  academicYearName: string;
  locationCourseId: string;
  locationCourseName: string;
  classId: string;
  className: string;
  classroomId: string;
  classroomName: string;
  teacherId: string;
  teacherName: string;
  capacity: string;
  repeatEndDate: string;
}

export interface ClosedDateDefinition {
  id: string;
  title: string;
  date: string;
  academicYearId: string;
  academicYearName: string;
}

export interface InvoiceBillingConfig {
  billItemRelationship?: string | null;
  billedKomaField?: string | null;
  paidKomaField?: string | null;
  /** When set, paid koma sums `paidKomaField` only on child rows where this field is populated. */
  paidKomaWhenField?: string | null;
}

export interface LessonDiscoveryConfig {
  lessonScheduleObject: string;
  lessonScheduleTeacherObject: string;
  lessonScheduleClassroomObject: string;
  lessonScheduleClassObject: string;
  closedDateObject: string;
  academicCalendarClosedDateObject: string;
  locationCourseObject: string;
  classObject: string;
  classroomObject: string;
  academicYearObject: string;
  academicCalendarObject: string;
  lessonSlotObject: string;
  lessonObject?: string;
  studentSessionObject?: string;
  reallocationObject?: string;
  invoiceBilling?: InvoiceBillingConfig;
  fields: {
    lessonSchedule: Record<string, string>;
    lessonScheduleTeacher: Record<string, string>;
    lessonScheduleClassroom: Record<string, string>;
    lessonScheduleClass: Record<string, string>;
    closedDate: Record<string, string>;
    academicCalendarClosedDate: Record<string, string>;
    lessonSlot: Record<string, string>;
    lesson?: Record<string, string>;
    studentSession?: Record<string, string>;
    reallocation?: Record<string, string>;
  };
}

export interface LessonDiscoveryResult {
  org: { orgId?: string; username?: string; instanceUrl?: string };
  generatedAt: string;
  config: LessonDiscoveryConfig;
}

export interface ImportPlanRecord {
  localRef: string;
  salesforceId?: string;
  fields: Record<string, unknown>;
}

export interface ImportBatch {
  batchId: string;
  artifactKind: ScheduleArtifactKind;
  sobjectApiName: string;
  operation: 'create' | 'update' | 'upsert' | 'delete';
  dependsOn?: string[];
  records: ImportPlanRecord[];
  externalIdField?: string;
}

export interface ScheduleImportPlan {
  planId: string;
  createdAt: string;
  targetOrg: {
    orgId: string;
    username: string;
    instanceUrl?: string;
    isSandbox: boolean;
  };
  sourceDefinitions: LessonScheduleDefinition[];
  batches: ImportBatch[];
  executionPolicy: {
    confirmationPhrase: string;
    productionWrites: 'blocked' | 'allowed';
    blockIfPlaceholdersRemain: boolean;
  };
  validationIssues: ValidationIssue[];
}

export interface ClosedDateImportPlan {
  planId: string;
  createdAt: string;
  targetOrg: ScheduleImportPlan['targetOrg'];
  locationId: string;
  locationName: string;
  academicCalendarId: string;
  sourceDefinitions: ClosedDateDefinition[];
  batches: ImportBatch[];
  executionPolicy: ScheduleImportPlan['executionPolicy'];
  validationIssues: ValidationIssue[];
}

export interface LessonSlotSourceRow {
  localSlotKey: string;
  date: string;
  booth: number;
  period: number;
  seat: 1 | 2;
  studentName: string;
  subject: string;
  grade?: string;
  teacherName?: string;
  lessonKind?: string;
  studentType?: string;
  attendance?: string;
  countTarget?: boolean;
}

export interface LessonSlotImportPlan {
  planId: string;
  createdAt: string;
  targetOrg: ScheduleImportPlan['targetOrg'];
  accountId: string;
  accountName: string;
  sourceRows: LessonSlotSourceRow[];
  batches: ImportBatch[];
  executionPolicy: ScheduleImportPlan['executionPolicy'];
  validationIssues: ValidationIssue[];
}

export interface StudentSessionSourceRow {
  localSlotKey: string;
  date: string;
  studentName: string;
  boothAttendance: string;
  sessionId?: string;
  manaerpAttendance?: string;
  currentManaerpAttendance?: string;
  skipReason?: string;
}

export interface StudentSessionUpdatePlan {
  planId: string;
  createdAt: string;
  targetOrg: ScheduleImportPlan['targetOrg'];
  accountId: string;
  accountName: string;
  sourceRows: StudentSessionSourceRow[];
  matchedCount: number;
  updateCount: number;
  skipCount: number;
  batches: ImportBatch[];
  executionPolicy: ScheduleImportPlan['executionPolicy'];
  validationIssues: ValidationIssue[];
}

export interface StudentSessionCreatePlan {
  planId: string;
  createdAt: string;
  targetOrg: ScheduleImportPlan['targetOrg'];
  accountId: string;
  accountName: string;
  sourceRows: StudentSessionSourceRow[];
  createCount: number;
  skipCount: number;
  batches: ImportBatch[];
  executionPolicy: ScheduleImportPlan['executionPolicy'];
  validationIssues: ValidationIssue[];
}

export interface ReallocationSourceRow {
  localSlotKey: string;
  studentName: string;
  transferFrom: string;
  transferTo: string;
  originalSessionId?: string;
  originalLessonId?: string;
  newLessonId?: string;
  skipReason?: string;
}

export interface ReallocationPlan {
  planId: string;
  createdAt: string;
  targetOrg: ScheduleImportPlan['targetOrg'];
  accountId: string;
  accountName: string;
  sourceRows: ReallocationSourceRow[];
  createCount: number;
  skipCount: number;
  batches: ImportBatch[];
  executionPolicy: ScheduleImportPlan['executionPolicy'];
  validationIssues: ValidationIssue[];
}

export interface ValidationIssue {
  severity: Severity;
  code: string;
  message: string;
  definitionId?: string;
  field?: string;
}

export interface ExecutionRowResult {
  localRef: string;
  success: boolean;
  salesforceId?: string;
  errorMessage?: string;
}

export interface ExecutionBatchLog {
  batchId: string;
  artifactKind: ScheduleArtifactKind;
  sobjectApiName: string;
  operation: ImportBatch['operation'];
  rowResults: ExecutionRowResult[];
}

export interface ExecutionLog {
  planId: string;
  startedAt: string;
  finishedAt?: string;
  success: boolean;
  batchLogs: ExecutionBatchLog[];
  errorMessage?: string;
}

export interface SalesforceApiClient {
  createRecord(sobjectApiName: string, fields: Record<string, unknown>): Promise<{ id: string }>;
  createRecordCollection?(
    sobjectApiName: string,
    records: Record<string, unknown>[],
  ): Promise<Array<{ id?: string; success: boolean; errors?: Array<{ message: string }> }>>;
  updateRecord(sobjectApiName: string, id: string, fields: Record<string, unknown>): Promise<{ id?: string }>;
  upsertRecord(
    sobjectApiName: string,
    externalIdField: string,
    externalIdValue: string,
    fields: Record<string, unknown>,
  ): Promise<{ id: string }>;
  upsertRecordCollection?(
    sobjectApiName: string,
    externalIdField: string,
    records: Record<string, unknown>[],
  ): Promise<Array<{ id?: string; success: boolean; errors?: Array<{ message: string }> }>>;
  deleteRecord(sobjectApiName: string, id: string): Promise<void>;
  query<T = Record<string, unknown>>(soql: string): Promise<{ records: T[] }>;
}

export interface ExecuteOptions {
  confirmed: boolean;
  confirmationPhrase?: string;
  allowProductionWrites?: boolean;
  dryRun?: boolean;
  onBatchStart?: (batch: ImportBatch) => void;
  onBatchFinish?: (batchLog: ExecutionBatchLog) => void;
}

export const SANDBOX_CONFIRMATION_PHRASE = 'EXECUTE SANDBOX';

export const DEFAULT_DISCOVERY_CONFIG: LessonDiscoveryConfig = {
  lessonScheduleObject: 'MANAERP__Lesson_Schedule__c',
  lessonScheduleTeacherObject: 'MANAERP__Lesson_Schedule_Teacher__c',
  lessonScheduleClassroomObject: 'MANAERP__Lesson_Schedule_Classroom__c',
  lessonScheduleClassObject: 'MANAERP__Lesson_Schedule_Class__c',
  closedDateObject: 'MANAERP__Closed_Date__c',
  academicCalendarClosedDateObject: 'MANAERP__Academic_Calendar_Closed_Dates__c',
  locationCourseObject: 'MANAERP__Location_Course__c',
  classObject: 'MANAERP__Class__c',
  classroomObject: 'MANAERP__Classroom__c',
  academicYearObject: 'MANAERP__Academic_Year__c',
  academicCalendarObject: 'MANAERP__Academic_Calendar__c',
  lessonSlotObject: 'Lesson_Slot__c',
  lessonObject: 'MANAERP__Lesson__c',
  studentSessionObject: 'MANAERP__Student_Sessions__c',
  reallocationObject: 'MANAERP__Reallocation__c',
  invoiceBilling: {
    billItemRelationship: 'MANAERP__Invoice_Bill_Items__r',
    billedKomaField: 'TRG_Purchased_Slot__c',
    paidKomaField: 'TRG_Purchased_Slot__c',
    paidKomaWhenField: 'TRG_IF_PaidAmount__c',
  },
  fields: {
    lessonSchedule: {
      name: 'MANAERP__Lesson_Name__c',
      location: 'MANAERP__Account__c',
      academicYear: 'MANAERP__Academic_Year__c',
      startDateTime: 'MANAERP__Start_Date_Time__c',
      endDateTime: 'MANAERP__End_Date_Time__c',
      teachingMethod: 'MANAERP__Teaching_Method__c',
      teachingMedium: 'MANAERP__Teaching_Medium__c',
      locationCourse: 'MANAERP__Location_Course__c',
      capacity: 'MANAERP__Lesson_Capacity__c',
    },
    lessonScheduleTeacher: {
      lessonSchedule: 'MANAERP__Lesson_Schedule__c',
      teacherName: 'MANAERP__Teacher_Name__c',
      teacher: 'MANAERP__Teacher__c',
    },
    lessonScheduleClassroom: {
      lessonSchedule: 'MANAERP__Lesson_Schedule__c',
      classroom: 'MANAERP__Classroom__c',
    },
    lessonScheduleClass: {
      lessonSchedule: 'MANAERP__Lesson_Schedule__c',
      classRef: 'MANAERP__Class__c',
    },
    closedDate: {
      name: 'Name',
      dateTime: 'MANAERP__Date_Time__c',
      academicYear: 'MANAERP__Academic_Year__c',
      academicCalendar: 'MANAERP__Academic_Calendar__c',
    },
    academicCalendarClosedDate: {
      closedDate: 'MANAERP__Closed_Date__c',
      academicCalendar: 'MANAERP__Academic_Calendar__c',
    },
    lessonSlot: {
      account: 'Account__c',
      slotKey: 'Slot_Key__c',
      date: 'Date__c',
      period: 'Period__c',
      booth: 'Booth__c',
      studentName: 'Student_Name__c',
      grade: 'Grade__c',
      subject: 'Subject__c',
      teacherName: 'Teacher_Name__c',
      lessonKind: 'Lesson_Kind__c',
      studentType: 'Student_Type__c',
      attendance: 'Attendance__c',
      capacity: 'Capacity__c',
      countTarget: 'Count_Target__c',
    },
    lesson: {
      lessonDate: 'MANAERP__Lesson_Date__c',
      capacity: 'MANAERP__Lesson_Capacity__c',
      subjectName: 'MANAERP__Subject_Name__c',
      lessonSchedule: 'MANAERP__Lesson_Schedule__c',
      scheduleAccount: 'MANAERP__Lesson_Schedule__r.MANAERP__Account__c',
    },
    studentSession: {
      lesson: 'MANAERP__Lesson__c',
      student: 'MANAERP__Student__c',
      studentName: 'MANAERP__Student_Name__c',
      attendanceStatus: 'MANAERP__Attendance_Status__c',
      attendanceNote: 'MANAERP__Attendance_Note__c',
      studentSessionsRel: 'MANAERP__Student_Sessions__r',
    },
    reallocation: {
      originalSession: 'MANAERP__Original_Student_Sessions__c',
      originalLesson: 'MANAERP__Original_Lesson__c',
      originalLessonDate: 'MANAERP__Original_Lesson_Date__c',
      newLesson: 'MANAERP__New_Lesson__c',
      newLessonDate: 'MANAERP__New_Lesson_Date__c',
      originalStudentName: 'MANAERP__Original_Student_Name__c',
      reallocateStatus: 'MANAERP__Reallocate_Status__c',
      reason: 'MANAERP__Reason__c',
    },
  },
};
