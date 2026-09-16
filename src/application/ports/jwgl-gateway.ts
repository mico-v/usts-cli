/**
 * 应用端口（ADR-0006）
 *
 * 命令与用例只依赖**窄接口**，不依赖适配器类：这样单测可以用假网关，不需要 HTTP、
 * 不需要假服务器。
 *
 * 端口不逐个手写，而是从 `JwglPort`（完整网关表面）用 `Pick` 派生：手写 13 个
 * 「会话能力 + 一个方法」的接口会随命令数线性增长，而 `Pick` 零运行时代价、
 * 单测里的 fake 依旧只需要实现用到的那一两个方法。
 */
import { AcademiaCourseItem, AcademiaSummary, GpaSummary } from '../../types/academia';
import { LoginResponse, ProfileInfo } from '../../types/identity';
import { CourseListItem, ExamItem, NotificationItem, ScoreItem, SelectedCourseItem } from '../../types/records';
import { ClassScheduleItem, ClassScheduleQuery, ClassScheduleView, ScheduleItem, SelectOption } from '../../types/schedule';
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

/**
 * 认证与会话管理：登录/登出/注入 Cookie。
 * 比 `SessionGateway` 宽，只有 `cli/login.ts` 与 `cli/logout.ts` 需要。
 */
export interface AuthGateway extends SessionGateway {
  setCookies(raw: string): void;
  /** 清空 Cookie Jar（注入的 Cookie 不可用时，避免污染后续的账号密码登录）。 */
  clearCookies(): void;
  /** 记录一次成功认证（登录时间/学号），供会话信任窗口使用。 */
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

/** 完整网关表面：命令级端口全部由它 `Pick` 派生。 */
export interface JwglPort extends SessionGateway {
  /** 学生成绩（主接口被拒时适配器内部回退备用接口） */
  queryScores(xnm?: string, xqm?: string, extra?: Record<string, string>): Promise<ScoreItem[]>;
  queryExams(xnm?: string, xqm?: string): Promise<ExamItem[]>;
  queryCourseList(xnm?: string, xqm?: string): Promise<CourseListItem[]>;
  /** 个人信息（顺带补上学号：注入的 Cookie 会话没有学号） */
  queryProfile(): Promise<ProfileInfo>;
  querySchedule(xnm?: string, xqm?: string): Promise<ScheduleItem[]>;
  /** 班级课表视图页的选单选项 */
  getBjkbdyOptions(): Promise<ClassScheduleView>;
  getMajorsByCollege(jgId: string): Promise<SelectOption[]>;
  getClassesByMajor(jgId: string, zyhId: string, njdmId: string): Promise<SelectOption[]>;
  queryClassSchedule(query: ClassScheduleQuery): Promise<{ items: ClassScheduleItem[]; practice: string[] }>;
  queryNotifications(): Promise<NotificationItem[]>;
  queryGpa(): Promise<GpaSummary>;
  queryAcademia(): Promise<AcademiaSummary>;
  queryAcademiaCategory(categoryId: string): Promise<AcademiaCourseItem[]>;
  querySelectedCourses(xnm?: string, xqm?: string): Promise<SelectedCourseItem[]>;
  downloadSchedulePdf(xnm: string, xqm: string, name?: string): Promise<Buffer>;
  downloadAcademiaPdf(): Promise<Buffer>;
}

/** 会话能力的键集合：每个命令级端口都带上它，因为命令入口都要 `ensureSession`。 */
type SessionCapability = keyof SessionGateway;

export type ScoresGateway = Pick<JwglPort, SessionCapability | 'queryScores'>;
export type ExamsGateway = Pick<JwglPort, SessionCapability | 'queryExams'>;
export type CourseListGateway = Pick<JwglPort, SessionCapability | 'queryCourseList'>;
export type ProfileGateway = Pick<JwglPort, SessionCapability | 'queryProfile'>;
export type ScheduleGateway = Pick<JwglPort, SessionCapability | 'querySchedule'>;
export type ClassScheduleGateway = Pick<
  JwglPort,
  SessionCapability | 'getBjkbdyOptions' | 'getMajorsByCollege' | 'getClassesByMajor' | 'queryClassSchedule'
>;
export type NotificationsGateway = Pick<JwglPort, SessionCapability | 'queryNotifications'>;
export type GpaGateway = Pick<JwglPort, SessionCapability | 'queryGpa'>;
export type AcademiaGateway = Pick<JwglPort, SessionCapability | 'queryAcademia' | 'queryAcademiaCategory'>;
export type SelectedCoursesGateway = Pick<JwglPort, SessionCapability | 'querySelectedCourses'>;
export type ScheduleDocumentGateway = Pick<JwglPort, SessionCapability | 'downloadSchedulePdf'>;
export type AcademiaDocumentGateway = Pick<JwglPort, SessionCapability | 'downloadAcademiaPdf'>;
