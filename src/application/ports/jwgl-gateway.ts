import {
  AcademiaCourseItem,
  AcademiaSummary,
  ClassScheduleItem,
  ClassScheduleQuery,
  ClassScheduleView,
  CourseListItem,
  ExamItem,
  GpaSummary,
  LoginResponse,
  NotificationItem,
  ProfileInfo,
  ScheduleItem,
  ScoreItem,
  SelectOption,
  SelectedCourseItem,
} from '../../types/api';

export interface SessionGateway {
  restoreSession(): boolean;
}

export interface AuthGateway extends SessionGateway {
  validateSession(): Promise<boolean>;
  setCookies(raw: string): void;
  saveSession(): void;
  loginViaScript(username: string, password: string): Promise<LoginResponse>;
}

export interface ScoresGateway extends SessionGateway {
  queryScores(xnm?: string, xqm?: string, extra?: Record<string, string>): Promise<ScoreItem[]>;
}

export interface ExamsGateway extends SessionGateway {
  queryExams(xnm?: string, xqm?: string): Promise<ExamItem[]>;
}

export interface CourseListGateway extends SessionGateway {
  queryCourseList(xnm?: string, xqm?: string): Promise<CourseListItem[]>;
}

export interface ScheduleGateway extends SessionGateway {
  querySchedule(xnm?: string, xqm?: string): Promise<ScheduleItem[]>;
}

export interface ProfileGateway extends SessionGateway {
  queryProfile(): Promise<ProfileInfo>;
}

export interface ClassScheduleGateway extends SessionGateway {
  getBjkbdyOptions(): Promise<ClassScheduleView>;
  getMajorsByCollege(jgId: string): Promise<SelectOption[]>;
  getClassesByMajor(jgId: string, zyhId: string, njdmId: string): Promise<SelectOption[]>;
  queryClassSchedule(query: ClassScheduleQuery): Promise<{ items: ClassScheduleItem[]; practice: string[] }>;
}

export interface NotificationsGateway extends SessionGateway {
  queryNotifications(): Promise<NotificationItem[]>;
}

export interface GpaGateway extends SessionGateway {
  queryGpa(): Promise<GpaSummary>;
}

export interface AcademiaGateway extends SessionGateway {
  queryAcademia(): Promise<AcademiaSummary>;
  queryAcademiaCategory(categoryId: string): Promise<AcademiaCourseItem[]>;
}

export interface SelectedCoursesGateway extends SessionGateway {
  querySelectedCourses(xnm?: string, xqm?: string): Promise<SelectedCourseItem[]>;
}

export interface ScheduleDocumentGateway extends SessionGateway {
  downloadSchedulePdf(xnm: string, xqm: string, name?: string): Promise<Buffer>;
}

export interface AcademiaDocumentGateway extends SessionGateway {
  downloadAcademiaPdf(): Promise<Buffer>;
}
