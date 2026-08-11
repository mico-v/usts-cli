// 正方教务系统 API 客户端
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { SessionState, LoginResponse, ScoreItem, ScheduleItem, ProfileInfo, ExamItem, CourseListItem, SelectOption, ClassScheduleQuery, ClassScheduleItem, ClassScheduleView } from '../types/api';

const SESSION_FILE = path.resolve(process.cwd(), '.session.json');
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export class JwglClient {
  private session: SessionState;
  private baseUrl: string;
  private http: AxiosInstance;

  constructor(baseUrl: string = 'https://jwgl.usts.edu.cn/jwglxt') {
    this.baseUrl = baseUrl;
    this.session = { cookies: new Map() };
    // maxRedirects:0 + validateStatus 全收，便于自行判断登录/重定向结果
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 30000,
      maxRedirects: 0,
      validateStatus: () => true,
      headers: { 'User-Agent': UA },
    });
  }

  // 直接注入已认证的 Cookie（例如 USTS_COOKIES 或持久化文件）
  setCookies(raw: string): void {
    for (const part of raw.split(';')) {
      const idx = part.indexOf('=');
      if (idx > 0) this.session.cookies.set(part.slice(0, idx).trim(), part.slice(idx + 1).trim());
    }
  }

  private storeCookies(headers: any): void {
    const setCookie = headers && (headers['set-cookie'] as string[] | undefined);
    if (!setCookie) return;
    for (const c of setCookie) {
      const pair = c.split(';')[0];
      const idx = pair.indexOf('=');
      if (idx > 0) this.session.cookies.set(pair.slice(0, idx).trim(), pair.slice(idx + 1).trim());
    }
  }

  private cookieHeader(): string {
    return Array.from(this.session.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join('; ');
  }

  /**
   * 浏览器登录（CAS 统一身份认证，2026-08 实测）。
   * 学校已迁移到 CAS：jwgl 登录页会转到 sso.usts.edu.cn（前置瑞数 JSLUID WAF，
   * 纯 axios 脚本被拦截），故直接用无头浏览器导航到 CAS 登录页登录。
   * 字段：input[name=username] / input[type=password] / 隐藏 captcha_code；
   * 登录按钮 button.login-button（初始带 disabled class）。
   * 出现验证码时无法自动处理 → 提示改用 npm run capture 或 USTS_COOKIES。
   */
  async loginViaBrowser(username: string, password: string): Promise<LoginResponse> {
    let puppeteer: typeof import('puppeteer');
    try {
      puppeteer = await import('puppeteer');
    } catch {
      return { success: false, message: '未安装 puppeteer，无法使用浏览器登录（请 npm install puppeteer）' };
    }

    const host = new URL(this.baseUrl).host;
    const service = `http://${host}/sso/jasiglogin/jwglxt`;
    const casUrl = `https://sso.usts.edu.cn/login?service=${encodeURIComponent(service)}`;

    const maxAttempts = 3;
    let lastErr = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      let browser;
      try {
        browser = await puppeteer.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-blink-features=AutomationControlled'],
        });
        const page = await browser.newPage();
        page.setDefaultTimeout(60000);

        // 等 WAF 挑战 + Angular 渲染出登录表单
        await page.goto(casUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForSelector('input[name="username"]', { timeout: 60000 });
        await new Promise((r) => setTimeout(r, 3000));

        // 用原生 setter + input/change 事件注入（page.type 会被 Angular 重渲染截断）
        const fillForm = (user: string, pass: string) =>
          page.evaluate(
            (u: string, p: string) => {
              const g = globalThis as any;
              const set = (el: any, v: string) => {
                if (!el) return;
                const d = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value') as any;
                d.set.call(el, v);
                el.dispatchEvent(new (g.Event)('input', { bubbles: true }));
                el.dispatchEvent(new (g.Event)('change', { bubbles: true }));
              };
              set(g.document?.querySelector('input[name="username"]'), u);
              set(g.document?.querySelector('input[type="password"]'), p);
            },
            user,
            pass,
          );
        await fillForm(username, password);
        await new Promise((r) => setTimeout(r, 1000));
        // 校验字段已填入（防渲染竞态截断），必要时补填一次
        const filled = await page.evaluate(() => {
          const g = globalThis as any;
          const u = g.document?.querySelector('input[name="username"]');
          const p = g.document?.querySelector('input[type="password"]');
          return !!u && !!p && u.value.length > 0 && p.value.length > 0;
        });
        if (!filled) {
          await new Promise((r) => setTimeout(r, 1500));
          await fillForm(username, password);
        }

        // 若出现可见验证码，无法自动处理 → 给出兜底路径
        const needCaptcha = await page.evaluate(() => {
          const g = globalThis as any;
          const visible = (sel: string) => {
            const el = g.document?.querySelector(sel);
            if (!el) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          };
          return (
            visible('input[name^="captcha"]:not([type="hidden"])') ||
            visible('img[src*="captcha"], img[src*="kaptcha"], img[src*="yzm"], img[src*="verify"]')
          );
        });
        if (needCaptcha) {
          return {
            success: false,
            message: '本次登录需要图形验证码，无法自动完成。请改用 npm run capture 人工登录，或把浏览器 Cookie 粘贴到 USTS_COOKIES 后运行 usts login',
          };
        }

        // 等登录按钮可用并点击
        await page
          .waitForFunction(
            () => {
              const b = (globalThis as any).document?.querySelector('button.login-button');
              return !!b && !b.classList.contains('disabled');
            },
            { timeout: 10000 },
          )
          .catch(() => {});
        const navPromise = page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 45000 }).catch(() => {});
        await page.evaluate(() => {
          const b = (globalThis as any).document?.querySelector('button.login-button');
          if (b && !b.classList.contains('disabled')) b.click();
        });
        await navPromise;

        // CAS → jwgl 换票可能多跳，轮询等待主菜单
        let ok = false;
        for (let i = 0; i < 20 && !ok; i++) {
          await new Promise((r) => setTimeout(r, 2000));
          ok = await page.evaluate(() => (globalThis as any).location.href.includes('index_initMenu')).catch(() => false);
        }
        if (!ok) {
          return { success: false, message: '登录失败：账号或密码不正确，或未跳转到主菜单' };
        }
        const cookies = (await page.cookies())
          .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
          .join('; ');
        this.setCookies(cookies);
        this.session.username = username;
        this.session.loginTime = new Date();
        this.saveSession();
        return { success: true, message: '登录成功', data: { username } };
      } catch (e: any) {
        lastErr = e?.message || '浏览器登录异常';
        // 连接层被 WAF 重置时重试（限流/抖动）
        if (attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, 8000 * attempt));
          continue;
        }
        return { success: false, message: `浏览器登录异常：${lastErr}` };
      } finally {
        if (browser) await browser.close();
      }
    }
    return { success: false, message: `浏览器登录失败：${lastErr}` };
  }

  // 会话持久化：保存 Cookie 到 .session.json
  saveSession(): void {
    const data = {
      cookies: Array.from(this.session.cookies.entries()),
      username: this.session.username,
      loginTime: this.session.loginTime,
    };
    try {
      fs.writeFileSync(SESSION_FILE, JSON.stringify(data));
    } catch {
      /* 忽略写入失败 */
    }
  }

  // 从 .session.json 恢复会话（不发起网络请求）
  restoreSession(): boolean {
    if (!fs.existsSync(SESSION_FILE)) return false;
    try {
      const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
      this.session.cookies = new Map(data.cookies || []);
      this.session.username = data.username;
      this.session.loginTime = data.loginTime ? new Date(data.loginTime) : undefined;
      return this.session.cookies.size > 0;
    } catch {
      return false;
    }
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
  // 对连接类错误做有限次退避重试（登录已在 loginViaBrowser 内单独处理）。
  private async requestWithRetry(fn: () => Promise<AxiosResponse>): Promise<AxiosResponse> {
    const maxAttempts = 3;
    let lastErr: any;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (e: any) {
        lastErr = e;
        const msg = e?.message || '';
        if (attempt < maxAttempts && /ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ERR_CONNECTION|socket hang up/i.test(msg)) {
          await new Promise((r) => setTimeout(r, 6000 * attempt));
          continue;
        }
        throw e;
      }
    }
    throw lastErr;
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
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    if (m >= 8) return { xnm: String(y), xqm: '3' };           // 8~12 月：本学年第一学期
    if (m >= 2) return { xnm: String(y - 1), xqm: '12' };      // 2~7 月：本学年第二学期
    return { xnm: String(y - 1), xqm: '3' };                   // 1 月：上一学年第一学期
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
      if (resp.status >= 300 && resp.status < 400) throw new Error('会话已失效，请重新运行 usts login');
      const raw = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
      if (/login_slogin|请先登录|登录超时/.test(raw)) throw new Error('会话已失效，请重新运行 usts login');
      let data: any = resp.data;
      if (typeof data === 'string') {
        try {
          data = JSON.parse(data);
        } catch {
          // 服务端返回非 JSON（错误提示页等）不是正常空数据；首页即失败直接报错
          if (all.length === 0) throw new Error('查询失败：服务端未返回数据（可能会话失效或接口被拒）');
          break;
        }
      }
      const before = all.length;
      const items = data && Array.isArray(data.items) ? data.items : [];
      all.push(...items);
      const total = Number(data && data.totalCount) || 0;
      // 没有更多页、已取完、或本页未返回新数据（防止服务端忽略分页导致死循环）
      if (items.length === 0 || (total > 0 && all.length >= total) || all.length === before) break;
      page++;
    }
    return all;
  }

  private static toNum(v: any): number | undefined {
    if (v === null || v === undefined || v === '') return undefined;
    const n = Number(v);
    return Number.isNaN(n) ? undefined : n;
  }

  /** 从 jc/jcor（形如 "7-9" 或 "7-9节"）提取起始/结束节次 */
  private static parseSections(jc: any): { start?: number; end?: number } {
    const m = String(jc ?? '').match(/(\d+)\s*[-~]\s*(\d+)/);
    return m ? { start: Number(m[1]), end: Number(m[2]) } : {};
  }

  /** 学生成绩查询 */
  async queryScores(xnm = '', xqm = '', extra: Record<string, string> = {}): Promise<ScoreItem[]> {
    const items = await this.postGrid('/cjcx/cjcx_cxXsgrcj.html', 'N305005', { xnm, xqm, ...extra });
    return items.map((it: any) => ({
      courseName: it.kcmc || '',
      courseCode: it.kch || '',
      courseNature: it.kcxzmc || '',
      credit: JwglClient.toNum(it.xf),
      score: it.cj ?? '',
      score100: it.bfzcj ?? '',
      gpa: JwglClient.toNum(it.jd),
      college: it.jgmc || '',
      teacher: it.jsxm || '',
      assessMethod: it.khfsmc || '',
      examType: it.ksxz || '',
      academicYear: it.xnmmc || '',
      semester: it.xqmmc || '',
      className: it.bj || '',
      major: it.zymc || '',
      teachingClass: it.jxbmc || '',
    }));
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
    const html: string = typeof resp.data === 'string' ? resp.data : '';
    if (/login_slogin|请先登录|登录超时/.test(html)) throw new Error('会话已失效，请重新运行 usts login');
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
    if (resp.status >= 300 && resp.status < 400) throw new Error('会话已失效，请重新运行 usts login');
    const raw = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    if (/请先登录|登录超时|login_slogin/.test(raw)) throw new Error('会话已失效，请重新运行 usts login');

    const data: any = typeof resp.data === 'string' ? JSON.parse(resp.data || '{}') : resp.data;
    const list: any[] = Array.isArray(data?.sjkList) ? data.sjkList : [];
    return list.map((it: any) => {
      const sec = JwglClient.parseSections(it.jc);
      return {
        courseName: it.kcmc || '',
        teacher: it.jsxm || undefined,
        className: it.jxbzh || undefined,          // 教学班
        campus: it.xqmc || undefined,              // 校区，如“石湖”
        credit: JwglClient.toNum(it.xf),
        weeks: it.qsjsz || undefined,              // 上课周次，如“1-17周”
        courseType: it.kclb || undefined,          // 课程类别，如“专业教育课程”
        assessMethod: it.khfsmc || undefined,      // 考核方式
        academicYear: it.xnmc || '',               // 如“2026-2027”
        // 有具体排课时间的条目才带星期/节次（jc 形如 "5-6"）
        weekday: JwglClient.toNum(it.xqj),
        startSection: sec.start,
        endSection: sec.end,
      };
    });
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
    const html = typeof resp.data === 'string' ? resp.data : String(resp.data);
    if (/请先登录|登录超时|login_slogin/.test(html)) throw new Error('会话已失效，请重新运行 usts login');

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
    if (typeof resp.data === 'string' && /login_slogin|请先登录|登录超时/.test(resp.data)) throw new Error('会话已失效，请重新运行 usts login');
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
    if (typeof resp.data === 'string' && /login_slogin|请先登录|登录超时/.test(resp.data)) throw new Error('会话已失效，请重新运行 usts login');
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
    if (resp.status >= 300 && resp.status < 400) throw new Error('会话已失效，请重新运行 usts login');
    const raw = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    if (/请先登录|登录超时|login_slogin/.test(raw)) throw new Error('会话已失效，请重新运行 usts login');
    const data: any = typeof resp.data === 'string' ? JSON.parse(raw || '{}') : resp.data;

    const mapItem = (it: any): ClassScheduleItem => {
      const sec = JwglClient.parseSections(it.jcor || it.jcs);
      return {
        courseName: it.kcmc || '',
        teacher: it.xm || undefined,
        teacherTitle: it.zcmc || undefined,
        jxbmc: it.jxbmc || undefined,
        jxbzc: it.jxbzc || undefined,
        campus: it.xqmc || undefined,
        room: it.cdmc || undefined,
        roomType: it.cdlbmc || undefined,
        credit: JwglClient.toNum(it.xf),
        totalHours: JwglClient.toNum(it.kczxs),
        weeks: it.zcd || undefined,
        assessMethod: it.khfsmc || undefined,
        courseNature: it.kcxzjc || undefined,
        weekday: JwglClient.toNum(it.xqj),
        startSection: sec.start,
        endSection: sec.end,
      };
    };
    const list: any[] = Array.isArray(data.kbList) ? data.kbList : [];
    // 过滤“未排地点”占位条目
    const items = list.filter((it) => it.cdmc && it.cdmc !== '未排地点').map(mapItem);
    const practice: string[] = (Array.isArray(data.sjkList) ? data.sjkList : [])
      .map((it: any) => it.qtkcgs || it.sjkcgs || '')
      .filter(Boolean);
    return { items, practice };
  }
}
