/**
 * 正方教务系统 API 客户端（兼容 façade）
 *
 * 这个类只保留两件事：
 *   1. **会话状态**：本地会话的读写、登录时间、探测/自动重登的编排（`SessionPort`），
 *      以及「业务响应证实失效 → 重登 → 重放一次」的 `withReauth` 边界；
 *   2. **对外兼容的公开方法**：逐个委托给 `infrastructure/jwgl` 下的端点模块。
 *
 * HTTP 细节（Cookie Jar、重试、退避、同源重定向）在
 * `infrastructure/http/authenticated-transport.ts`；远端字段与响应语义在各端点模块与
 * `mappers.ts`/`response-policy.ts` 里，本文件不出现任何远端字段名。
 */
import { AcademiaCourseItem, AcademiaSummary, GpaSummary } from '../../types/academia';
import { LoginResponse, ProfileInfo } from '../../types/identity';
import { CourseListItem, ExamItem, NotificationItem, ScoreItem, SelectedCourseItem } from '../../types/records';
import { ClassScheduleItem, ClassScheduleQuery, ClassScheduleView, ScheduleItem, SelectOption } from '../../types/schedule';
import { SessionLookup, SessionState, RecoveryResult, LocalSessionInfo } from '../../domain/session';
import { SessionManager, SessionPort } from '../../application/session-manager';
import { AuthGateway, JwglPort } from '../../application/ports/jwgl-gateway';
import { BaseUrlPolicy } from '../../config/config';
import { errorMessage, isAmbiguousRejection, isSessionExpired } from '../../domain/errors';
import { credentialsFromEnv } from '../../config/env';
import { FileSessionStore, SessionStore } from '../session/file-session-store';
import { AuthenticatedTransport } from '../http/authenticated-transport';
import { OperationEffect, RetryNotice } from '../http/transport';
import { loginViaScript as loginRequest, probeSession as probeRequest } from './auth';
import {
  fetchProfile, queryCourseList as fetchCourseList, queryExams as fetchExams, queryNotifications as fetchNotifications,
  queryScores as fetchScores, querySelectedCourses as fetchSelectedCourses,
} from './records';
import {
  getBjkbdyOptions as fetchBjkbdyOptions, getClassesByMajor as fetchClasses, getMajorsByCollege as fetchMajors,
  queryClassSchedule as fetchClassSchedule, querySchedule as fetchSchedule,
} from './schedule';
import {
  queryAcademia as fetchAcademia, queryAcademiaCategory as fetchAcademiaCategory, queryGpa as fetchGpa,
} from './academia';
import { downloadAcademiaPdf as fetchAcademiaPdf, downloadSchedulePdf as fetchSchedulePdf } from './document-api';

export interface JwglGatewayOptions extends BaseUrlPolicy {
  sessionStore?: SessionStore;
  sessionManager?: SessionManager;
  /**
   * 每次重试前的结构化通知。**不在这里拼文案**：重试提示是给人看的说明，属于展示层
   * （`cli/create-client.ts` 把它接到 stderr），基础设施只上报发生了什么。
   * 不传则不输出——生产构造点只有 `cli/create-client.ts` 一处，它一定会接。
   */
  onRetry?: (notice: RetryNotice) => void;
}

/**
 * 正方教务系统的**端点适配器**：整个项目里唯一持有传输层与会话状态的类。
 *
 * 它只做两件事（ADR-0006）：
 *   1. 会话状态：本地会话读写、登录时间、探测/自动重登编排（`SessionPort`），以及
 *      「业务响应证实失效 → 重登 → 重放一次」的 `withReauth` 边界；
 *   2. 实现 `JwglPort`：逐个委托给 `infrastructure/jwgl` 下的端点模块。
 *
 * HTTP 细节在 `infrastructure/http/authenticated-transport.ts`；远端字段名与响应语义在
 * 各端点模块与 `mappers.ts`/`response-policy.ts` 里，本文件不出现任何远端字段名。
 */
export class JwglGateway implements JwglPort, AuthGateway, SessionPort {
  private session: { username?: string; loginTime?: Date };
  private readonly sessionStore: SessionStore;
  private readonly sessions: SessionManager;
  private readonly transport: AuthenticatedTransport;

  constructor(
    baseUrl: string = 'https://jwgl.usts.edu.cn/jwglxt',
    options: JwglGatewayOptions = {},
  ) {
    this.session = {};
    this.sessionStore = options.sessionStore ?? new FileSessionStore();
    this.transport = new AuthenticatedTransport(baseUrl, {
      allowCustomHost: options.allowCustomHost,
      allowInsecureHttp: options.allowInsecureHttp,
      onRetry: options.onRetry,
      onCookiesChanged: () => {
        // Cookie 轮换不应使一次已成功的查询失败；持久化采用尽力策略。
        if (this.session.username) {
          try { this.saveSession(); } catch { /* 下次显式登录时会报告存储错误 */ }
        }
      },
    });
    this.sessions = options.sessionManager ?? new SessionManager(this);
  }

  // ===== SessionPort：会话状态机依赖的 I/O =====

  /** 从用户状态目录恢复会话（不发起网络请求）。 */
  restoreSession(): boolean {
    if (this.transport.cookieCount > 0) return true;
    const data = this.sessionStore.load();
    if (!data) return false;
    // 必须与当前配置同源。缺 origin 的会话无从判断归属，同样拒绝——
    // 旧版 cwd/.session.json 就是这种形态，已按 ADR-0004 退役，不再读取也不再提升。
    if (data.origin !== new URL(this.transport.baseUrl).origin) return false;
    this.transport.restoreCookies(data.cookies);
    this.session.username = data.username;
    this.session.loginTime = data.loginTime ? new Date(data.loginTime) : undefined;
    return this.transport.cookieCount > 0;
  }

  lastLoginAt(): number | undefined {
    return this.session.loginTime?.getTime();
  }

  /** 主动探测；**从不触发自动重登**，因此能如实回答「当前这份凭据能不能用」。 */
  async probeSession(): Promise<SessionState> {
    return probeRequest(this.transport);
  }

  async loginFromEnvironment(): Promise<LoginResponse> {
    const credentials = credentialsFromEnv();
    if (!credentials) {
      return {
        success: false,
        errorCode: 'AUTHENTICATION_REQUIRED',
        message: '未配置 USTS_USERNAME/USTS_PASSWORD，无法自动重新登录',
      };
    }
    return this.loginViaScript(credentials.username, credentials.password);
  }

  // ===== 会话：对外接口 =====

  /**
   * 恢复会话并主动校验（必要时自动重新登录）。
   * 命令入口用它替代「只恢复本地 cookie 就开跑」。并发调用会合并成同一次。
   */
  async ensureValidSession(): Promise<SessionLookup> {
    return this.sessions.ensure();
  }

  /** 最近一次自动重登的结果，供上层给出可操作提示。 */
  lastRecovery(): RecoveryResult | undefined {
    return this.sessions.lastRecovery();
  }

  /** 本地会话概要（不发网络请求），供交互式界面显示即时状态。 */
  localSession(): LocalSessionInfo {
    const loggedIn = this.restoreSession();
    return { loggedIn, username: this.session.username, loginTime: this.session.loginTime };
  }

  /**
   * 退出登录：清空内存 Cookie 与持久化会话，并让在途的探测/重登结果作废。
   *
   * **只做本地清理**。正方没有可安全调用的登出接口（路径需抓包确认），因此这里不猜测
   * 路径去发请求；服务端会话会在其有效期内继续可用，需要立即失效只能在浏览器里退出。
   */
  logout(): boolean {
    const removed = this.sessionStore.remove();
    this.transport.clearCookies();
    this.session = {};
    this.sessions.reset();
    return removed;
  }

  /** 直接注入已认证的 Cookie（例如 USTS_COOKIES 或持久化文件） */
  setCookies(raw: string): void {
    this.transport.importCookies(raw);
  }

  /** 清空 Cookie Jar；注入的 Cookie 不可用时要先清掉，否则会污染后续登录。 */
  clearCookies(): void {
    this.transport.clearCookies();
  }

  /** 记录一次成功认证；同时开启信任窗口，避免紧接着的命令再发一次探针请求。 */
  markAuthenticated(username?: string): void {
    if (username) this.session.username = username;
    this.session.loginTime = new Date();
    this.sessions.markVerified();
  }

  /** 会话持久化：保存到安全的用户状态目录 */
  saveSession(): void {
    this.sessionStore.save({
      schemaVersion: 1,
      origin: new URL(this.transport.baseUrl).origin,
      cookies: this.transport.serializeCookies(),
      username: this.session.username,
      loginTime: this.session.loginTime?.toISOString(),
    });
  }

  /**
   * 纯脚本登录。协议本身在 `infrastructure/jwgl/auth.ts`；这里只补上
   * 「记录登录时间 + 持久化」这两件属于会话状态的事。
   */
  async loginViaScript(username: string, password: string): Promise<LoginResponse> {
    const result = await loginRequest(this.transport, username, password);
    if (!result.success) return result;
    this.markAuthenticated(username);
    try {
      this.saveSession();
    } catch (cause) {
      // 登录已成功但会话没落盘：如实说明，别把它报成「登录失败」。
      return {
        success: false,
        errorCode: 'FILE_SYSTEM_ERROR',
        message: `登录成功，但无法保存会话：${errorMessage(cause)}`,
      };
    }
    return result;
  }

  /**
   * 业务响应证实会话已失效时，自动重登并**重放一次**整个操作。
   *
   * 重放边界故意放在「公开方法」而不是「单个 HTTP 请求」上：PDF 那类多步生成链
   * 只能整链重跑，从中间续跑会得到错的结果。`mutation` 一律不重放。
   */
  private async withReauth<T>(effect: OperationEffect, operation: () => Promise<T>, replayBudget = 1): Promise<T> {
    try {
      return await operation();
    } catch (cause) {
      if (effect === 'mutation' || replayBudget <= 0) throw cause;
      // 被拒但原因不明时，不猜——探一次拿正面证据再决定。
      const expired = isSessionExpired(cause)
        || (isAmbiguousRejection(cause) && await this.sessions.confirmExpired());
      if (!expired) throw cause;
      this.sessions.markExpired();
      if (!(await this.sessions.recover()).ok) throw cause;
      return this.withReauth(effect, operation, replayBudget - 1);
    }
  }

  // ===== 查询类功能：委托给端点模块，重放边界留在这一层 =====

  /** 学生成绩查询 */
  async queryScores(xnm = '', xqm = '', extra: Record<string, string> = {}): Promise<ScoreItem[]> {
    return this.withReauth('read', () => fetchScores(this.transport, xnm, xqm, extra));
  }

  /** 考试信息查询 */
  async queryExams(xnm = '', xqm = ''): Promise<ExamItem[]> {
    return this.withReauth('read', () => fetchExams(this.transport, xnm, xqm));
  }

  /** 选课名单查询 */
  async queryCourseList(xnm = '', xqm = ''): Promise<CourseListItem[]> {
    return this.withReauth('read', () => fetchCourseList(this.transport, xnm, xqm));
  }

  /** 个人信息查询（顺带补上学号：注入的 Cookie 会话没有学号） */
  async queryProfile(): Promise<ProfileInfo> {
    return this.withReauth('read', async () => {
      const username = this.session.username || '';
      const profile = await fetchProfile(this.transport, username);
      if (!this.session.username && profile.studentId) {
        this.session.username = profile.studentId;
        try { this.saveSession(); } catch { /* 尽力持久化 */ }
      }
      return profile;
    });
  }

  /** 个人课表查询 */
  async querySchedule(xnm = '', xqm = ''): Promise<ScheduleItem[]> {
    return this.withReauth('read', () => fetchSchedule(this.transport, xnm, xqm));
  }

  /** 班级课表视图页的选单选项 */
  async getBjkbdyOptions(): Promise<ClassScheduleView> {
    return this.withReauth('read', () => fetchBjkbdyOptions(this.transport));
  }

  /** 专业下拉（按学院） */
  async getMajorsByCollege(jgId: string): Promise<SelectOption[]> {
    return this.withReauth('read', () => fetchMajors(this.transport, jgId));
  }

  /** 班级下拉（按学院/专业/年级） */
  async getClassesByMajor(jgId: string, zyhId: string, njdmId: string): Promise<SelectOption[]> {
    return this.withReauth('read', () => fetchClasses(this.transport, jgId, zyhId, njdmId));
  }

  /** 班级课表查询 */
  async queryClassSchedule(q: ClassScheduleQuery): Promise<{ items: ClassScheduleItem[]; practice: string[] }> {
    return this.withReauth('read', () => fetchClassSchedule(this.transport, q));
  }

  /** 首页通知/待办查询 */
  async queryNotifications(): Promise<NotificationItem[]> {
    return this.withReauth('read', () => fetchNotifications(this.transport));
  }

  /** 学业成绩概览（GPA/学分） */
  async queryGpa(): Promise<GpaSummary> {
    return this.withReauth('read', () => fetchGpa(this.transport));
  }

  /** 学业情况摘要与课程分类 */
  async queryAcademia(): Promise<AcademiaSummary> {
    return this.withReauth('read', () => fetchAcademia(this.transport, this.session.username || ''));
  }

  /** 学业分类明细 */
  async queryAcademiaCategory(xfyqjdId: string): Promise<AcademiaCourseItem[]> {
    if (!xfyqjdId) return [];
    return this.withReauth('read', () => fetchAcademiaCategory(this.transport, xfyqjdId));
  }

  /** 查询已选课程；当前项目只保留查询接口，不实现选课/退课。 */
  async querySelectedCourses(xnm = '', xqm = ''): Promise<SelectedCourseItem[]> {
    return this.withReauth('read', () => fetchSelectedCourses(this.transport, xnm, xqm));
  }

  /** 下载个人课表 PDF（只读；学期使用当前 USTS xqm 编码）。 */
  async downloadSchedulePdf(xnm: string, xqm: string, name = '导出'): Promise<Buffer> {
    return this.withReauth('download', () => fetchSchedulePdf(this.transport, xnm, xqm, name));
  }

  /**
   * 下载成绩总表 PDF（只读；正方打印模块的六步生成链）。
   * 会话失效时的重放由 `withReauth` 在**整个方法**这一层做（见其注释）。
   */
  async downloadAcademiaPdf(): Promise<Buffer> {
    return this.withReauth('download', () => fetchAcademiaPdf(this.transport));
  }
}
