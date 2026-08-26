// 正方教务系统 API 客户端
import { AxiosInstance, AxiosResponse } from 'axios';
import { LoginResponse, ScoreItem, ScheduleItem, ProfileInfo, ExamItem, CourseListItem, SelectOption, ClassScheduleQuery, ClassScheduleItem, ClassScheduleView, NotificationItem, GpaSummary, AcademiaSummary, AcademiaCategory, AcademiaCourseItem, SelectedCourseItem } from '../types/api';
import { BaseUrlPolicy, assertSameOriginUrl, normalizeBaseUrl } from '../config/config';
import { AppError, errorMessage, isAppError } from '../domain/errors';
import { currentTerm } from '../domain/term';
import { CookieJar } from '../infrastructure/http/cookie-jar';
import { createHttpClient, executeWithRetry, OperationEffect } from '../infrastructure/http/transport';
import { FileSessionStore, SessionStore } from '../infrastructure/session/file-session-store';
import { cleanHtml, extractVisibleText, matchText, parseJsonValue, recordArray, toNumber } from '../infrastructure/jwgl/value';
import { mapAcademiaCourseItem, mapClassScheduleItem, mapScheduleItem, mapScoreItem, mapSelectedCourseItem } from '../infrastructure/jwgl/mappers';
import { assertPdfResponse, assertReadableResponse } from '../infrastructure/jwgl/response-policy';
import { encryptPassword } from '../infrastructure/jwgl/rsa';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class JwglClient {
  private session: { username?: string; loginTime?: Date };
  private cookies: CookieJar;
  private readonly sessionStore: SessionStore;
  private baseUrl: string;
  private cookieUrl: string;
  private http: AxiosInstance;

  constructor(
    baseUrl: string = 'https://jwgl.usts.edu.cn/jwglxt',
    options: BaseUrlPolicy & { sessionStore?: SessionStore } = {},
  ) {
    this.baseUrl = normalizeBaseUrl(baseUrl, options);
    this.cookieUrl = `${this.baseUrl}/`;
    this.session = {};
    this.cookies = new CookieJar(this.cookieUrl);
    this.sessionStore = options.sessionStore ?? new FileSessionStore();
    // maxRedirects:0 + validateStatus 全收，便于自行判断登录/重定向结果
    this.http = createHttpClient(this.baseUrl);
    this.http.defaults.headers.common['User-Agent'] = UA;
    this.http.interceptors.response.use((response) => {
      const changed = this.storeCookies(response.headers);
      if (changed && this.session.username) {
        // Cookie 轮换不应使一次已成功的查询失败；持久化采用尽力策略。
        try { this.saveSession(); } catch { /* 下次显式登录时会报告存储错误 */ }
      }
      return response;
    });
  }

  // 直接注入已认证的 Cookie（例如 USTS_COOKIES 或持久化文件）
  setCookies(raw: string): void {
    this.cookies.importCookieHeader(raw, this.cookieUrl);
  }

  private storeCookies(headers: any): boolean {
    const setCookie = headers && (headers['set-cookie'] as string[] | undefined);
    if (!setCookie) return false;
    let changed = false;
    for (const c of Array.isArray(setCookie) ? setCookie : [String(setCookie)]) {
      changed = this.cookies.setCookie(c, this.cookieUrl) || changed;
    }
    return changed;
  }

  private cookieHeader(url = this.cookieUrl): string {
    return this.cookies.header(url);
  }

  /**
   * 纯脚本登录（2026-08 实测）。经典正方 RSA 登录 + 「双 POST 重试」。
   *
   * USTS 前置瑞数 JSLUID WAF 会重置「会话内首次登录 POST」：
   *   第一次 POST 总被 302 跳回登录页（Set-Cookie 轮换 JSESSIONID），
   *   同一 cookie jar 上第二次 POST 即可成功跳到 index_initMenu。
   *   （实测 zfn_api 原样 body {csrftoken,yhm,mm} 单 mm 也能成功，重试是关键。）
   * 出现验证码（账号被连续失败锁出）时无法自动处理 → 提示改用 USTS_COOKIES/capture。
   */
  async loginViaScript(username: string, password: string): Promise<LoginResponse> {
    try {
      // 1. 取登录页，解析 csrftoken，检测验证码
      const pageResp = await this.requestWithRetry(() =>
        this.http.get('/xtgl/login_slogin.html', { headers: { Cookie: this.cookieHeader() } }),
      );
      this.storeCookies(pageResp.headers);
      if (pageResp.status >= 300 && pageResp.status < 400) {
        return { success: false, errorCode: 'RATE_LIMITED', message: '登录页被重定向，可能被 WAF 拦截，请稍后重试或改用 USTS_COOKIES' };
      }
      const html = typeof pageResp.data === 'string' ? pageResp.data : '';
      const csrfMatch = html.match(/id="csrftoken"[^>]*value="([^"]*)"/);
      const csrf = csrfMatch ? csrfMatch[1] : '';
      if (!csrf) return { success: false, errorCode: 'PROTOCOL_CHANGED', message: '登录页缺少 csrftoken，接口可能已变更' };
      if (/id="yzm"|name="yzm"/.test(html)) {
        return { success: false, errorCode: 'CAPTCHA_REQUIRED', message: '账号当前需要图形验证码，无法自动登录。请把浏览器 Cookie 粘贴到 USTS_COOKIES 后运行 usts login，或用 npm run capture 人工登录' };
      }

      // 2. 取 RSA 公钥（必须与登录 POST 保持同一会话）
      const keyResp = await this.requestWithRetry(() =>
        this.http.get('/xtgl/login_getPublicKey.html', {
          headers: { Cookie: this.cookieHeader(), Referer: `${this.baseUrl}/xtgl/login_slogin.html` },
        }),
      );
      this.storeCookies(keyResp.headers);
      const keyJson: any = keyResp.data;
      if (!keyJson || !keyJson.modulus || !keyJson.exponent) {
        return { success: false, errorCode: 'PROTOCOL_CHANGED', message: '获取 RSA 公钥失败，请稍后重试' };
      }
      const mm = encryptPassword(password, keyJson.modulus, keyJson.exponent);

      // 3. 提交登录（首 POST 会被 WAF 重置会话 → 同一 cookie jar 重试一次）
      const postLogin = () => {
        const body = new URLSearchParams();
        body.append('csrftoken', csrf);
        body.append('language', 'zh_CN');
        body.append('ydType', '');
        body.append('yhm', username);
        body.append('mm', mm);
        body.append('mm', mm); // 浏览器会提交两次 mm（可见框 + 隐藏框）
        return this.http.post(`/xtgl/login_slogin.html?time=${Date.now()}`, body.toString(), {
          headers: {
            Cookie: this.cookieHeader(),
            Referer: `${this.baseUrl}/xtgl/login_slogin.html`,
            Origin: this.baseUrl,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
        });
      };
      let resp = await this.requestWithRetry(postLogin);
      this.storeCookies(resp.headers);
      let location: string = resp.headers['location'] || '';
      if (!/index_initMenu/.test(location)) {
        await new Promise((r) => setTimeout(r, 1000));
        resp = await this.requestWithRetry(postLogin);
        this.storeCookies(resp.headers);
        location = resp.headers['location'] || '';
      }

      if (/index_initMenu/.test(location)) {
        this.session.username = username;
        this.session.loginTime = new Date();
        this.saveSession();
        return { success: true, message: '登录成功', data: { username } };
      }
      const body = typeof resp.data === 'string' ? resp.data : '';
      if (/用户名或密码/.test(body)) return { success: false, errorCode: 'INVALID_CREDENTIALS', message: '用户名或密码不正确' };
      return { success: false, errorCode: 'REMOTE_SERVER_ERROR', message: '登录失败：未跳转到主菜单，请检查账号密码后重试' };
    } catch (cause: unknown) {
      return {
        success: false,
        errorCode: isAppError(cause) ? cause.code : 'UNKNOWN_ERROR',
        message: `登录异常：${errorMessage(cause)}`,
      };
    }
  }

  // 会话持久化：保存到安全的用户状态目录
  saveSession(): void {
    this.sessionStore.save({
      schemaVersion: 1,
      origin: new URL(this.baseUrl).origin,
      cookies: this.cookies.serialize(),
      username: this.session.username,
      loginTime: this.session.loginTime?.toISOString(),
    });
  }

  // 从用户状态目录恢复会话（兼容迁移旧版 .session.json，不发起网络请求）
  restoreSession(): boolean {
    if (this.cookies.size > 0) return true;
    const data = this.sessionStore.load();
    if (!data) return false;
    const origin = new URL(this.baseUrl).origin;
    if (data.origin && data.origin !== origin) return false;
    this.cookies = new CookieJar(this.cookieUrl);
    this.cookies.restore(data.cookies);
    this.session.username = data.username;
    this.session.loginTime = data.loginTime ? new Date(data.loginTime) : undefined;
    // 旧版 cwd/.session.json 没有 origin；成功读取后按新契约迁移到安全状态目录。
    if (!data.origin && this.cookies.size > 0) this.saveSession();
    return this.cookies.size > 0;
  }

  // 通过访问受保护页面验证会话是否有效（最可靠的判断方式）
  async validateSession(): Promise<boolean> {
    return this.verifySession();
  }

  private async verifySession(): Promise<boolean> {
    try {
      const resp: AxiosResponse = await this.http.get('/xsxxxggl/xsxxwh_cxXsxx.html', {
        headers: { Cookie: this.cookieHeader() },
      });
      // 未登录会被重定向到登录页（302）或返回登录页 HTML；
      // 注意：带 gnmkdm 前直接 GET 常返回“错误提示”页（参数缺失），这不代表会话失效
      if (resp.status >= 300 && resp.status < 400) return false;
      const html: string = typeof resp.data === 'string' ? resp.data : '';
      return !/用户登录|请先登录|登录超时|login_slogin/.test(html);
    } catch {
      return false;
    }
  }

  // WAF 会对短时间内的重复请求做连接层重置（ERR_CONNECTION_CLOSED），
  // 对连接类错误做有限次退避重试（登录 POST 已在 loginViaScript 内双 POST 重试）。
  private async requestWithRetry(
    fn: () => Promise<AxiosResponse>,
    effect: OperationEffect = 'read',
  ): Promise<AxiosResponse> {
    return executeWithRetry(fn, { effect });
  }

  // ===== 查询类功能 =====
  // 正方 V9 列表接口统一规律：POST 到 <dataPath>?doType=query&gnmkdm=<功能码>，
  // 请求体携带查询参数 + 经典 jqGrid 分页字段 + queryModel 分页参数（见 postGrid 注释），
  // 返回 { items:[...], totalCount:N }（成绩/考试/选课名单均已在 live 站点实测）。

  /**
   * 计算当前学年/学期，作为命令默认值。
   * 与教务网页默认保持一致（2026-08 抓包实测：网页缺省落在 xnm=今年, xqm=3）：
   *   - 8 月 ~ 12 月：今年 → 第一学期 (xqm=3，即将/正在进行的秋季学期)
   *   - 2 月 ~ 7 月：上一学年 → 第二学期 (xqm=12)
   *   - 1 月：上一学年 → 第一学期 (xqm=3)
   */
  static currentTerm(): { xnm: string; xqm: string } {
    const term = currentTerm();
    return { xnm: term.academicYear, xqm: term.semester };
  }

  /**
   * 列表查询（2026-08 抓包 + axios 实测）：
   *  URL 带 ?doType=query&gnmkdm=<功能码>（不传 su，服务端按会话识别用户）。
   *  body 必须同时包含两套分页参数才能通过校验并真正分页：
   *    - 经典 jqGrid 字段 page/rows/sidx/sord（缺了会返回“错误提示”页）
   *    - queryModel.showCount / queryModel.currentPage（服务端实际用它分页，
   *      忽略 page/rows；showCount=5000 时一次取全）
   *  响应为 { items:[...], totalCount:N }。
   */
  private async postGrid(
    dataPath: string,
    gnmkdm: string,
    extra: Record<string, string> = {},
  ): Promise<any[]> {
    const all: any[] = [];
    const ROWS = '100';      // 经典字段，用于通过校验
    const SHOW_COUNT = '5000'; // 服务端实际每页条数
    let page = 1;
    // 自动翻页：直到取完 totalCount 返回的全部记录
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const body = new URLSearchParams({
        ...extra,
        _search: 'false',
        nd: String(Date.now()),
        page: String(page),
        rows: ROWS,
        sidx: '',
        sord: 'asc',
        'queryModel.showCount': SHOW_COUNT,
        'queryModel.currentPage': String(page),
      });
      const url = `${dataPath}?doType=query&gnmkdm=${gnmkdm}`;
      const resp: AxiosResponse = await this.requestWithRetry(() =>
        this.http.post(url, body.toString(), {
          headers: {
            Cookie: this.cookieHeader(),
            Referer: `${this.baseUrl}${dataPath}`,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-Requested-With': 'XMLHttpRequest',
          },
        }),
      );
      assertReadableResponse(resp);
      let data: any = resp.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          // 服务端返回非 JSON（错误提示页等）不是正常空数据；首页即失败直接报错
          if (all.length === 0) throw new AppError('PROTOCOL_CHANGED', '查询失败：服务端未返回数据（可能会话失效或接口被拒）');
          break;
        }
      }
      const before = all.length;
      const items = recordArray(data?.items);
      all.push(...items);
      const total = Number(data && data.totalCount) || 0;
      // 没有更多页、已取完、或本页未返回新数据（防止服务端忽略分页导致死循环）
      if (items.length === 0 || (total > 0 && all.length >= total) || all.length === before) break;
      page++;
    }
    return all;
  }

  /** 学生成绩查询；主接口为空时自动回退到备用接口 cjcx_cxDgXscj.html（2026-08 实测可用） */
  async queryScores(xnm = '', xqm = '', extra: Record<string, string> = {}): Promise<ScoreItem[]> {
    let items = await this.postGrid('/cjcx/cjcx_cxXsgrcj.html', 'N305005', { xnm, xqm, ...extra });
    if (items.length === 0) {
      // 备用接口（学生个人成绩另一 action），防止主接口异常/改版导致取不到
      items = await this.postGrid('/cjcx/cjcx_cxDgXscj.html', 'N305005', { xnm, xqm, ...extra });
    }
    return items.map(mapScoreItem);
  }

  /** 考试信息查询（真实 action 带 Index 后缀，2026-08 实测） */
  async queryExams(xnm = '', xqm = ''): Promise<ExamItem[]> {
    return (await this.postGrid('/kwgl/kscx_cxXsksxxIndex.html', 'N358105', { xnm, xqm })) as ExamItem[];
  }

  /** 选课名单查询（真实 action 带 Index 后缀，2026-08 实测） */
  async queryCourseList(xnm = '', xqm = ''): Promise<CourseListItem[]> {
    return (await this.postGrid('/xkcx/xkmdcx_cxXkmdcxIndex.html', 'N255010', { xnm, xqm })) as CourseListItem[];
  }

  /** 个人信息查询（GET 详情页，解析 标签->值 结构） */
  async queryProfile(): Promise<ProfileInfo> {
    const username = this.session.username || '';
    const url = `/xsxxxggl/xsgrxxwh_cxXsgrxx.html?gnmkdm=N100801&su=${encodeURIComponent(username)}`;
    const resp = await this.requestWithRetry(() =>
      this.http.get(url, {
        headers: { Cookie: this.cookieHeader(), Referer: `${this.baseUrl}/xtgl/index_initMenu.html` },
      }),
    );
    assertReadableResponse(resp);
    const html: string = typeof resp.data === 'string' ? resp.data : '';
    // 详情页结构：<label>姓名：</label> ... <p class="form-control-static">张三</p>
    const pairs: Record<string, string> = {};
    const labelRe = /<label[^>]*>([^<]+?)[：:]\s*<\/label>/g;
    let lm: RegExpExecArray | null;
    while ((lm = labelRe.exec(html))) {
      const label = lm[1].trim();
      const anchor = lm.index + lm[0].length;
      const pIdx = html.indexOf('<p class="form-control-static">', anchor);
      if (pIdx < 0) continue;
      const end = html.indexOf('</p>', pIdx);
      const val = html.substring(pIdx + '<p class="form-control-static">'.length, end).trim();
      if (val && !pairs[label]) pairs[label] = val;
    }
    const get = (...names: string[]): string => names.map((n) => pairs[n]).find((v) => v) || '';
    // 部分字段值写在 id="col_xxx_id" 的 div 内
    const colVal = (id: string): string => {
      const m = html.match(new RegExp(`id="${id}"[^>]*>\\s*<p class="form-control-static">([\\s\\S]*?)<\\/p>`, 'i'));
      return m ? m[1].trim() : '';
    };
    const studentId = get('学号') || username;
    const grade = get('年级') || '';
    const enrollmentYear = Number(grade) || Number(String(studentId).slice(0, 4)) || 0;
    return {
      username,
      studentId,
      displayName: get('姓名'),
      className: get('班级') || colVal('col_bh_id'),
      college: get('学院', '院系') || colVal('col_jg_id'),
      major: get('专业') || colVal('col_zy_id'),
      grade,
      enrollmentYear,
      idCard: get('身份证', '身份证号'),
      phone: get('手机', '手机号码', '联系电话'),
      email: get('邮箱', '电子邮箱', 'E-mail', 'email'),
    };
  }

  /**
   * 个人课表查询（2026-08 抓包实测）：
   *  直接 POST /kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151，请求体极简。
   *  返回 { xsxx:{...}, sjkList:[...] }；有固定排课的条目带 xqj(星期)/jc(节次)，
   *  实践课、MOOC 等无固定节次的条目不带，落入“无固定时间”分组。
   */
  async querySchedule(xnm = '', xqm = ''): Promise<ScheduleItem[]> {
    const dataPath = '/kbcx/xskbcx_cxXsgrkb.html';
    const body = new URLSearchParams({
      xnm, xqm, kzlx: 'ck', xsdm: '', kclbdm: '', kclxdm: '',
    });
    const resp = await this.requestWithRetry(() =>
      this.http.post(`${dataPath}?gnmkdm=N2151`, body.toString(), {
        headers: {
          Cookie: this.cookieHeader(),
          Referer: `${this.baseUrl}/kbcx/xskbcx_cxXskbcxIndex.html`,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
      }),
    );
    assertReadableResponse(resp);

    const data: any = parseJsonValue(resp.data, '个人课表响应');
    return recordArray(data?.sjkList).map(mapScheduleItem);
  }

  // ===== 班级课表（bjkbdy，2026-08 抓包实测）=====

  /**
   * 解析班级课表视图页里的选单选项（学院/校区/年级/培养层次内嵌在 HTML 里，
   * 专业/班级需再通过 comm_* 接口级联加载）。同时返回页面默认选中的年级/校区。
   */
  async getBjkbdyOptions(): Promise<ClassScheduleView> {
    const path = '/kbdy/bjkbdy_cxBjkbdyIndex.html';
    const resp = await this.requestWithRetry(() =>
      this.http.get(`${path}?gnmkdm=N214505`, {
        headers: { Cookie: this.cookieHeader(), Referer: `${this.baseUrl}${path}` },
      }),
    );
    assertReadableResponse(resp);
    const html = typeof resp.data === 'string' ? resp.data : String(resp.data);

    const grab = (name: string): { value: string; label: string; selected: boolean }[] => {
      const i = html.indexOf(`name="${name}"`);
      if (i < 0) return [];
      const end = html.indexOf('</select>', i);
      const seg = html.slice(i, end < 0 ? i + 400 : end);
      return [...seg.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)]
        .map((o) => ({
          value: (o[1].match(/value="([^"]*)"/) || [])[1] || '',
          label: o[2].trim(),
          selected: /selected/.test(o[1]),
        }))
        .filter((o) => o.value);
    };
    const toOpt = (list: { value: string; label: string }[]): SelectOption[] => list.map((o) => ({ value: o.value, label: o.label }));
    const grades = grab('njdm_id');
    const campuses = grab('xqh_id');
    return {
      colleges: toOpt(grab('jg_id')),
      campuses: toOpt(campuses),
      grades: toOpt(grades),
      pyccdms: toOpt(grab('pyccdm')),
      defaultGrade: grades.find((o) => o.selected)?.value || '',
      defaultCampus: campuses.find((o) => o.selected)?.value || '',
    };
  }

  /** 专业下拉：comm_cxZydmList.html?jg_id=<学院> */
  async getMajorsByCollege(jgId: string): Promise<SelectOption[]> {
    const resp = await this.requestWithRetry(() =>
      this.http.get('/xtgl/comm_cxZydmList.html', {
        params: { jg_id: jgId, zyh_id_cx: '', '_': Date.now(), gnmkdm: 'N214505' },
        headers: { Cookie: this.cookieHeader(), Referer: `${this.baseUrl}/kbdy/bjkbdy_cxBjkbdyIndex.html`, 'X-Requested-With': 'XMLHttpRequest' },
      }),
    );
    assertReadableResponse(resp);
    const arr = Array.isArray(resp.data) ? resp.data : (resp.data && resp.data.items) || [];
    return arr.map((m: any) => ({ value: m.zyh_id, label: m.zymc, meta: m }));
  }

  /** 班级下拉：comm_cxBjdmList.html?jg_id&zyh_id&njdm_id（meta 带 bh 编号/zymc/jgmc/njmc） */
  async getClassesByMajor(jgId: string, zyhId: string, njdmId: string): Promise<SelectOption[]> {
    const resp = await this.requestWithRetry(() =>
      this.http.get('/xtgl/comm_cxBjdmList.html', {
        params: { jg_id: jgId, zyh_id: zyhId, bh_id: '', njdm_id: njdmId, '_': Date.now(), gnmkdm: 'N214505' },
        headers: { Cookie: this.cookieHeader(), Referer: `${this.baseUrl}/kbdy/bjkbdy_cxBjkbdyIndex.html`, 'X-Requested-With': 'XMLHttpRequest' },
      }),
    );
    assertReadableResponse(resp);
    const arr = Array.isArray(resp.data) ? resp.data : (resp.data && resp.data.items) || [];
    return arr.map((c: any) => ({ value: c.bh_id, label: c.bj, meta: c }));
  }

  /**
   * 班级课表查询：POST bjkbdy_cxBjKb.html?gnmkdm=N214505。
   * 关键：bh（班级编号）必须与 bhId 对应，否则返回空；xb 描述字段（zymc/jgmc/bj 等）也要带齐。
   * 返回 { items: kbList 中有固定排课的条目, practice: 实践课摘要 }。
   */
  async queryClassSchedule(q: ClassScheduleQuery): Promise<{ items: ClassScheduleItem[]; practice: string[] }> {
    const xqmmc: Record<string, string> = { '3': '1', '12': '2', '16': '3' };
    const body = new URLSearchParams({
      xnm: q.xnm, xqm: q.xqm,
      xnmc: `${q.xnm}-${Number(q.xnm) + 1}`,
      xqmmc: xqmmc[q.xqm] || '1',
      xqh_id: q.xqhId, njdm_id: q.njdmId, zyh_id: q.zyhId, bh_id: q.bhId,
      tjkbzdm: '1', tjkbzxsdm: '0',
      zymc: q.zymc, jgmc: q.jgmc, njmc: q.njmc, bj: q.bj, bh: q.bh,
      jsxm: '', lxdh: '', zs: '', zxszjjs: 'false',
      xsdm: '', kclxdm: '', kclbdm: '', kbsjlyqz: '', yf: '',
      kzlx: 'ck',
    });
    const path = '/kbdy/bjkbdy_cxBjKb.html';
    const resp = await this.requestWithRetry(() =>
      this.http.post(`${path}?gnmkdm=N214505`, body.toString(), {
        headers: {
          Cookie: this.cookieHeader(),
          Referer: `${this.baseUrl}/kbdy/bjkbdy_cxBjkbdyIndex.html`,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
      }),
    );
    assertReadableResponse(resp);
    const data: any = parseJsonValue(resp.data, '班级课表响应');
    const list = recordArray(data.kbList);
    // 过滤“未排地点”占位条目
    const items = list.filter((it) => it.cdmc && it.cdmc !== '未排地点').map(mapClassScheduleItem);
    const practice: string[] = recordArray(data.sjkList)
      .map((it: any) => it.qtkcgs || it.sjkcgs || '')
      .filter(Boolean);
    return { items, practice };
  }

  /** 首页待办/通知查询（只读）。接口字段在不同模块版本中可能略有差异，保留 raw。 */
  async queryNotifications(): Promise<NotificationItem[]> {
    const path = '/xtgl/index_cxDbsy.html';
    const body = new URLSearchParams({
      sfyy: '0', flag: '1', _search: 'false', nd: String(Date.now()),
      'queryModel.showCount': '1000', 'queryModel.currentPage': '1',
      'queryModel.sortName': 'cjsj', 'queryModel.sortOrder': 'desc', time: '0',
    });
    const resp = await this.requestWithRetry(() => this.http.post(`${path}?doType=query`, body.toString(), {
      headers: {
        Cookie: this.cookieHeader(),
        Referer: `${this.baseUrl}/xtgl/index_initMenu.html`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
    }));
    assertReadableResponse(resp);
    const data: any = parseJsonValue(resp.data, '通知响应');
    const list = recordArray(Array.isArray(data) ? data : data?.items);
    return list.map((it: any) => {
      const content = String(it.xxnr ?? it.content ?? '');
      const title = String(it.xxbt ?? it.title ?? it.bt ?? '');
      return {
        id: it.id ?? it.dbid ?? it.tzid,
        title,
        type: it.type ?? it.lx ?? undefined,
        content,
        createdAt: it.cjsj ?? it.createTime ?? it.sj,
        unread: it.sfyy === '1' || it.sfyy === 1 || it.isRead === false,
        url: it.url ?? it.href ?? it.ckurl,
        raw: it,
      };
    });
  }

  /** 学业情况页面概览；不依赖 zfn_api 对固定 font 节点的脆弱假设。 */
  async queryGpa(): Promise<GpaSummary> {
    const path = '/xsxy/xsxyqk_cxXsxyqkIndex.html';
    const resp = await this.requestWithRetry(() => this.http.get(`${path}?gnmkdm=N105515&layout=default`, {
      headers: { Cookie: this.cookieHeader(), Referer: `${this.baseUrl}/xtgl/index_initMenu.html` },
    }));
    assertReadableResponse(resp);
    const html = String(resp.data || '');
    const visible = cleanHtml(html);
    const texts = extractVisibleText(html);
    const fontValues = [...html.matchAll(/<font[^>]*size=["']?2px["']?[^>]*>([\s\S]*?)<\/font>/gi)]
      .map((m) => toNumber(cleanHtml(m[1])))
      .filter((v): v is number => v !== undefined);
    const numbers = (patterns: RegExp[]): number | undefined => {
      for (const pattern of patterns) {
        const m = visible.match(pattern);
        if (!m) continue;
        const n = Number(m[1]);
        if (Number.isFinite(n)) return n;
      }
      return undefined;
    };
    return {
      gpa: numbers([/(?:平均绩点|GPA)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)/i]) ?? fontValues[2],
      averageScore: numbers([/(?:平均分|平均成绩)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)/]),
      totalCredits: numbers([/(?:总学分|计划学分)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)/]),
      earnedCredits: numbers([/(?:获得学分|已修学分|修得学分)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)/]),
      rawText: texts,
    };
  }

  /** 学业情况主页面摘要及课程分类。分类详情以后按需扩展，避免一次请求过多。 */
  async queryAcademia(): Promise<AcademiaSummary> {
    const path = '/xsxy/xsxyqk_cxXsxyqkIndex.html';
    const resp = await this.requestWithRetry(() => this.http.get(`${path}?gnmkdm=N105515&layout=default`, {
      headers: { Cookie: this.cookieHeader(), Referer: `${this.baseUrl}/xtgl/index_initMenu.html` },
    }));
    assertReadableResponse(resp);
    const html = String(resp.data || '');
    const text = extractVisibleText(html);
    const sid = matchText(html, /id=["']xh_id["'][^>]*value=["']([^"']+)["']/i) || this.session.username;

    // 分类树（页面为前端 JS 模板拼装，节点形如：
    //   "名称&nbsp;" + $.i18n.get('yqxf')/* 要求学分 */ + ":N&nbsp;" + ... + "<span id='showKc<ID>'>")
    const categories: AcademiaCategory[] = [];
    const nodeRe =
      /"([^"]+?)&nbsp;"\s*\+\s*\$\.i18n\.get\('yqxf'\)\/\* 要求学分 \*\/\s*\+\s*":([0-9.]+)&nbsp;"\s*\+\s*\$\.i18n\.get\('hdxf'\)\/\* 获得学分 \*\/\s*\+\s*":([0-9.]+)&nbsp;&nbsp;"\s*\+\s*\$\.i18n\.get\('whdxf'\)\/\* 未获得学分 \*\/\s*\+\s*":([0-9.]+)&nbsp;"\s*\+\s*"<span id='showKc([^']*)'>/g;
    let m: RegExpExecArray | null;
    while ((m = nodeRe.exec(html))) {
      const name = (m[1] || '').trim();
      if (!name || /\$|\.i18n|span|id=/.test(name)) continue;
      categories.push({
        name,
        id: m[5] || undefined,
        requiredCredits: toNumber(m[2]),
        earnedCredits: toNumber(m[3]),
        missingCredits: toNumber(m[4]),
        detailAvailable: !!m[5],
        raw: [m[1], m[2], m[3], m[4], m[5]],
      });
    }

    const summaryText = text.join(' ');
    const stat = (pattern: RegExp): number | undefined => toNumber(matchText(summaryText, pattern));
    return {
      studentId: sid,
      gpa: toNumber(matchText(summaryText, /(?:平均学分绩点（GPA）|平均绩点|GPA)[^0-9]*([0-9]+(?:\.[0-9]+)?)/i)),
      plannedCourses: stat(/计划总课程\s*(\d+)\s*门/),
      passedCourses: stat(/计划总课程\s*\d+\s*门\s*通过\s*(\d+)\s*门/),
      failedCourses: stat(/未通过\s*(\d+)\s*门/),
      unlearnedCourses: stat(/未修\s*(\d+)\s*门/),
      inProgressCourses: stat(/在读\s*(\d+)\s*门/),
      unplannedPassedCourses: stat(/计划外：\s*通过\s*(\d+)\s*门/),
      unplannedFailedCourses: stat(/计划外：\s*通过\s*\d+\s*门，?\s*未通过\s*(\d+)\s*门/),
      categories,
      rawText: text,
    };
  }

  /** 学业分类明细：按分类 id 拉取课程列表（xsxyqk_cxJxzxjhxfyqKcxx.html，2026-08 实测 18/31 个叶子分类有数据） */
  async queryAcademiaCategory(xfyqjdId: string): Promise<AcademiaCourseItem[]> {
    if (!xfyqjdId) return [];
    const resp = await this.requestWithRetry(() =>
      this.http.post('/xsxy/xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515', new URLSearchParams({ xfyqjd_id: xfyqjdId }).toString(), {
        headers: {
          Cookie: this.cookieHeader(),
          Referer: `${this.baseUrl}/xsxy/xsxyqk_cxXsxyqkIndex.html`,
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
        },
      }),
    );
    assertReadableResponse(resp);
    const data = parseJsonValue(resp.data, '学业分类响应');
    return recordArray(data).map(mapAcademiaCourseItem);
  }

  /** 查询已选课程；当前项目只保留查询接口，不实现选课/退课。 */
  async querySelectedCourses(xnm = '', xqm = ''): Promise<SelectedCourseItem[]> {
    const path = '/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html';
    const body = new URLSearchParams({ xkxnm: xnm, xkxqm: xqm });
    const resp = await this.requestWithRetry(() => this.http.post(`${path}?gnmkdm=N253512`, body.toString(), {
      headers: {
        Cookie: this.cookieHeader(),
        Referer: `${this.baseUrl}/xsxk/zzxkyzb_cxZzxkYzbIndex.html`,
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest',
      },
    }));
    assertReadableResponse(resp);
    const data: any = parseJsonValue(resp.data, '已选课程响应');
    return recordArray(Array.isArray(data) ? data : data?.items).map(mapSelectedCourseItem);
  }

  /** 下载个人课表 PDF（只读；学期使用当前 USTS xqm 编码）。 */
  async downloadSchedulePdf(xnm: string, xqm: string, name = '导出'): Promise<Buffer> {
    const originTerm: Record<string, string> = { '3': '1', '12': '2', '16': '3' };
    const displayTerm = originTerm[xqm] || xqm || '1';
    const body = new URLSearchParams({
      xm: name,
      xnm,
      xqm,
      xnmc: `${xnm}-${Number(xnm) + 1}`,
      xqmmc: displayTerm,
      jgmc: 'undefined',
      xxdm: '',
      'xszd.sj': 'true',
      'xszd.cd': 'true',
      'xszd.js': 'true',
      'xszd.jszc': 'false',
      'xszd.jxb': 'true',
      'xszd.xkbz': 'true',
      'xszd.kcxszc': 'true',
      'xszd.zhxs': 'true',
      'xszd.zxs': 'true',
      'xszd.khfs': 'true',
      'xszd.xf': 'true',
      'xszd.skfsmc': 'false',
      kzlx: 'dy',
    });
    const policyPath = '/kbdy/bjkbdy_cxXnxqsfkz.html';
    const filePath = '/kbcx/xskbcx_cxXsShcPdf.html';
    const policy = await this.requestWithRetry(() => this.http.post(`${policyPath}?gnmkdm=N2151`, body.toString(), {
      headers: this.formHeaders(`${this.baseUrl}${policyPath}`),
    }));
    assertReadableResponse(policy, '课表 PDF 预检');
    const file = await this.requestWithRetry(() => this.http.post(`${filePath}?doType=table`, body.toString(), {
      headers: this.formHeaders(`${this.baseUrl}${filePath}`),
      responseType: 'arraybuffer',
    }));
    const bytes = Buffer.from(file.data);
    assertPdfResponse(file.status, bytes);
    return bytes;
  }

  /** 下载成绩总表 PDF（只读；正方打印模块的多步生成链）。 */
  async downloadAcademiaPdf(): Promise<Buffer> {
    const params = { gnmkdm: 'N558020' };
    const data: Record<string, string> = {
      gsdygx: '10628-zw-mrgs', ids: '', bdykcxzDms: '', cytjkcxzDms: '',
      cytjkclbDms: '', cytjkcgsDms: '', bjgbdykcxzDms: '', bjgbdyxxkcxzDms: '',
      djksxmDms: '', cjbzmcDms: '', cjdySzxs: '', wjlx: 'pdf',
    };
    const post = async (path: string, form: Record<string, string>, ref = path): Promise<AxiosResponse> => {
      const resp = await this.requestWithRetry(() => this.http.post(path, new URLSearchParams(form).toString(), {
        params,
        headers: this.formHeaders(`${this.baseUrl}${ref}`),
      }));
      assertReadableResponse(resp, '成绩总表生成');
      return resp;
    };
    await post('/bysxxcx/xscjzbdy_dyXscjzbView.html', params);
    await post('/bysxxcx/xscjzbdy_dyCjdyszxView.html', { xh: '' });
    const noType = { ...data };
    delete noType.wjlx;
    await post('/xtgl/bysxxcx/xscjzbdy_cxXsCount.html', noType);
    await post('/bysxxcx/xscjzbdy_cxGswjlx.html', noType);
    await post('/common/common_cxJwxtxx.html', params);
    const fileResp = await post('/bysxxcx/xscjzbdy_dyList.html', noType);
    const fileText = String(fileResp.data || '');
    if (/错误|error_title/i.test(fileText)) throw new AppError('REMOTE_SERVER_ERROR', '成绩总表 PDF 生成失败');
    const pdfPath = fileText.replace('#成功', '').replace(/"/g, '').trim().replace(/\\/g, '/');
    if (!pdfPath) throw new AppError('PROTOCOL_CHANGED', '成绩总表 PDF 未返回下载路径');
    await post('/xtgl/progress_cxProgressStatus.html', { key: 'score_print_processed', ...params });
    const downloadUrl = assertSameOriginUrl(pdfPath, this.baseUrl);
    const download = await this.requestWithRetry(() => this.http.get(downloadUrl, {
      headers: this.formHeaders(downloadUrl),
      responseType: 'arraybuffer',
      timeout: 32000,
    }));
    const bytes = Buffer.from(download.data);
    assertPdfResponse(download.status, bytes);
    return bytes;
  }

  private formHeaders(referer: string): Record<string, string> {
    return {
      Cookie: this.cookieHeader(referer),
      Referer: referer,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    };
  }

}
