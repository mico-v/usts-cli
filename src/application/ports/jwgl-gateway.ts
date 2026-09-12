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
import { LocalSessionInfo, RecoveryResult, SessionLookup, SessionState } from '../../domain/session';

/** 所有业务网关共有的会话能力。 */
export interface SessionGateway {
  /** 只从本地恢复会话，不发起网络请求。 */
  restoreSession(): boolean;
  /**
   * 恢复会话并**主动校验**：必要时发一次探针请求，失效则尝试自动重新登录。
   * 返回 `missing` 表示本地根本没有会话；`unknown` 表示探测不出结论（网络问题），
   * 调用方应当放行并由业务响应兜底。
   *
   * 并发调用会合并成同一次，因此「提前发起预检」不会带来额外请求。
   */
  ensureValidSession(): Promise<SessionLookup>;
  /**
   * 只探测、**从不触发自动重登**，因此能如实回答「当前这份凭据能不能用」。
   * 需要判定「用户给的 Cookie 是否有效」时必须用它——用带重登的调用会把
   * 「密码登录成功」误报成「Cookie 有效」。
   */
  probeSession(): Promise<SessionState>;
  /** 本地会话概要（不发网络请求），供界面显示即时状态。 */
  localSession(): LocalSessionInfo;
  /** 最近一次自动重登的结果，用于给出可操作的错误提示。 */
  lastRecovery(): RecoveryResult | undefined;
}

export interface AuthGateway extends SessionGateway {
  setCookies(raw: string): void;
  /** 清空 Cookie Jar（注入的 Cookie 不可用时，避免污染后续的账号密码登录）。 */
  clearCookies(): void;
  /** 记录一次成功认证（登录时间/学号），供会话信任窗口与 `su` 参数使用。 */
  markAuthenticated(username?: string): void;
  saveSession(): void;
  loginViaScript(username: string, password: string): Promise<LoginResponse>;
  /**
   * 退出登录：清空内存 Cookie 与持久化会话。
   *
   * 只做本地清理——服务端会话不受影响，会在其有效期内继续可用。返回是否删掉了
   * 持久化文件（登出是幂等的，本来就没有也算成功）。
   */
  logout(): boolean;
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
