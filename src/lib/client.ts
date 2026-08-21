// 正方教务系统 API 客户端
import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { SessionState, LoginResponse, ScoreItem, ScheduleItem, ProfileInfo, ExamItem, CourseListItem, SelectOption, ClassScheduleQuery, ClassScheduleItem, ClassScheduleView, NotificationItem, GpaSummary, AcademiaSummary, AcademiaCategory, AcademiaCourseItem, SelectedCourseItem } from '../types/api';

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
        return { success: false, message: '登录页被重定向，可能被 WAF 拦截，请稍后重试或改用 USTS_COOKIES' };
      }
      const html = typeof pageResp.data === 'string' ? pageResp.data : '';
      const csrfMatch = html.match(/id="csrftoken"[^>]*value="([^"]*)"/);
      const csrf = csrfMatch ? csrfMatch[1] : '';
      if (!csrf) return { success: false, message: '登录页缺少 csrftoken，接口可能已变更' };
      if (/id="yzm"|name="yzm"/.test(html)) {
        return { success: false, message: '账号当前需要图形验证码，无法自动登录。请把浏览器 Cookie 粘贴到 USTS_COOKIES 后运行 usts login，或用 npm run capture 人工登录' };
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
        return { success: false, message: '获取 RSA 公钥失败，请稍后重试' };
      }
      const mm = this.encryptPassword(password, keyJson.modulus, keyJson.exponent);

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
      if (/用户名或密码/.test(body)) return { success: false, message: '用户名或密码不正确' };
      return { success: false, message: '登录失败：未跳转到主菜单，请检查账号密码后重试' };
    } catch (e: any) {
      return { success: false, message: `登录异常：${e?.message || '未知错误'}` };
    }
  }

  // RSA(PKCS#1 v1.5) 加密密码（公钥 modulus/exponent 为 base64），返回 base64 密文
  private encryptPassword(password: string, modulus: string, exponent: string): string {
    const toInt = (b: Buffer): Buffer => {
      let s = b;
      while (s.length > 1 && s[0] === 0) s = s.subarray(1);
      if ((s[0] & 0x80) !== 0) s = Buffer.concat([Buffer.from([0]), s]);
      return s;
    };
    const tlv = (tag: number, content: Buffer): Buffer => {
      const len = content.length;
      if (len < 0x80) return Buffer.concat([Buffer.from([tag, len]), content]);
      const lb: number[] = [];
      let n = len;
      while (n > 0) {
        lb.unshift(n & 0xff);
        n >>>= 8;
      }
      return Buffer.concat([Buffer.from([tag, 0x80 | lb.length, ...lb]), content]);
    };
    const seq = tlv(0x30, Buffer.concat([
      tlv(0x02, toInt(Buffer.from(modulus, 'base64'))),
      tlv(0x02, toInt(Buffer.from(exponent, 'base64'))),
    ]));
    const b64 = seq.toString('base64').match(/.{1,64}/g)!.join('\n');
    const pem = '-----BEGIN RSA PUBLIC KEY-----\n' + b64 + '\n-----END RSA PUBLIC KEY-----';
    return crypto.publicEncrypt(
      { key: pem, padding: crypto.constants.RSA_PKCS1_PADDING },
      Buffer.from(password),
    ).toString('base64');
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
  // 对连接类错误做有限次退避重试（登录 POST 已在 loginViaScript 内双 POST 重试）。
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

  /** 学生成绩查询；主接口为空时自动回退到备用接口 cjcx_cxDgXscj.html（2026-08 实测可用） */
  async queryScores(xnm = '', xqm = '', extra: Record<string, string> = {}): Promise<ScoreItem[]> {
    const mapItem = (it: any): ScoreItem => ({
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
    });
    let items = await this.postGrid('/cjcx/cjcx_cxXsgrcj.html', 'N305005', { xnm, xqm, ...extra });
    if (items.length === 0) {
      // 备用接口（学生个人成绩另一 action），防止主接口异常/改版导致取不到
      items = await this.postGrid('/cjcx/cjcx_cxDgXscj.html', 'N305005', { xnm, xqm, ...extra });
    }
    return items.map(mapItem);
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
    this.assertReadableResponse(resp);
    const data: any = this.parseResponseData(resp);
    const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
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
    this.assertReadableResponse(resp);
    const html = String(resp.data || '');
    const visible = this.cleanHtml(html);
    const texts = this.extractVisibleText(html);
    const fontValues = [...html.matchAll(/<font[^>]*size=["']?2px["']?[^>]*>([\s\S]*?)<\/font>/gi)]
      .map((m) => this.toNumber(this.cleanHtml(m[1])))
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
    this.assertReadableResponse(resp);
    const html = String(resp.data || '');
    const text = this.extractVisibleText(html);
    const sid = this.matchText(html, /id=["']xh_id["'][^>]*value=["']([^"']+)["']/i) || this.session.username;

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
        requiredCredits: JwglClient.toNum(m[2]),
        earnedCredits: JwglClient.toNum(m[3]),
        missingCredits: JwglClient.toNum(m[4]),
        detailAvailable: !!m[5],
        raw: [m[1], m[2], m[3], m[4], m[5]],
      });
    }

    const summaryText = text.join(' ');
    const stat = (pattern: RegExp): number | undefined => this.toNumber(this.matchText(summaryText, pattern));
    return {
      studentId: sid,
      gpa: this.toNumber(this.matchText(summaryText, /(?:平均学分绩点（GPA）|平均绩点|GPA)[^0-9]*([0-9]+(?:\.[0-9]+)?)/i)),
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
    this.assertReadableResponse(resp);
    let data: any = resp.data;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch { return []; } }
    if (!Array.isArray(data)) return [];
    return data.map((it: any) => ({
      courseId: it.KCH || '',
      title: it.KCMC || '',
      englishTitle: it.KCYWMC || '',
      status: it.XDZT != null ? String(it.XDZT) : undefined,
      credit: JwglClient.toNum(it.XF),
      category: it.KCLBMC || '',
      nature: it.KCXZMC || '',
      grade: it.CJ ?? '',
      maxGrade: it.MAXCJ ?? '',
      gpa: JwglClient.toNum(it.JD),
      displayTerm: [it.JYXDXNMC, it.JYXDXQMC].filter(Boolean).join('·'),
      planned: it.SFJHKC === '是',
      hours: it.XSXXXX || '',
      raw: it,
    }));
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
    this.assertReadableResponse(resp);
    const data: any = this.parseResponseData(resp);
    const list: any[] = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
    return list.map((it: any) => ({
      courseId: it.kch_id ?? it.kch,
      classId: it.jxb_id ?? it.jxbid,
      executionId: it.do_jxb_id ?? it.dojxbid,
      title: it.kcmc ?? it.kchmc,
      teacherId: this.matchText(String(it.jsxx ?? ''), /([0-9]+)\s*\//),
      teacher: this.matchText(String(it.jsxx ?? ''), /\/([^/]+)\//) ?? it.jsmc ?? it.jsxm,
      credit: this.toNumber(it.xf),
      category: it.kklxmc ?? it.kclbmc,
      capacity: this.toNumber(it.jxbrs),
      selectedNumber: this.toNumber(it.yxzrs),
      place: this.cleanHtml(String(it.jxdd ?? '')),
      time: this.cleanHtml(String(it.sksj ?? '')).replace(/\s*<br\s*\/?>\s*/gi, '、'),
      optional: it.zixf === 1 || it.zixf === '1' || it.zixf === true,
      waiting: it.sxbj,
      raw: it,
    }));
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
    this.assertReadableResponse(policy);
    const file = await this.requestWithRetry(() => this.http.post(`${filePath}?doType=table`, body.toString(), {
      headers: this.formHeaders(`${this.baseUrl}${filePath}`),
      responseType: 'arraybuffer',
    }));
    const bytes = Buffer.from(file.data);
    this.assertPdfResponse(file.status, bytes);
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
      this.assertReadableResponse(resp);
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
    if (/错误|error_title/i.test(fileText)) throw new Error('成绩总表 PDF 生成失败');
    const pdfPath = fileText.replace('#成功', '').replace(/"/g, '').trim().replace(/\\/g, '/');
    if (!pdfPath) throw new Error('成绩总表 PDF 未返回下载路径');
    await post('/xtgl/progress_cxProgressStatus.html', { key: 'score_print_processed', ...params });
    const downloadUrl = /^https?:\/\//i.test(pdfPath) ? pdfPath : this.resolveDownloadUrl(pdfPath);
    const download = await this.requestWithRetry(() => this.http.get(downloadUrl, {
      headers: this.formHeaders(downloadUrl),
      responseType: 'arraybuffer',
      timeout: 32000,
    }));
    const bytes = Buffer.from(download.data);
    this.assertPdfResponse(download.status, bytes);
    return bytes;
  }

  private resolveDownloadUrl(value: string): string {
    const clean = value.trim();
    if (clean.startsWith('/')) return new URL(clean, `${this.baseUrl}/`).toString();
    return new URL(clean, `${this.baseUrl}/`).toString();
  }

  private formHeaders(referer: string): Record<string, string> {
    return {
      Cookie: this.cookieHeader(),
      Referer: referer,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    };
  }

  private assertPdfResponse(status: number, bytes: Buffer): void {
    if (status >= 300 && status < 400) throw new Error('会话已失效，请重新运行 usts login');
    const prefix = bytes.subarray(0, 4096).toString('utf8');
    if (/用户登录|请先登录|登录超时|login_slogin/.test(prefix)) throw new Error('会话已失效，请重新运行 usts login');
    if (status >= 400) throw new Error(`PDF 下载失败：HTTP ${status}`);
    if (!bytes.subarray(0, 5).toString('ascii').startsWith('%PDF-')) throw new Error('服务端未返回有效 PDF 文件');
  }

  private assertReadableResponse(resp: AxiosResponse): void {
    if (resp.status >= 300 && resp.status < 400) throw new Error('会话已失效，请重新运行 usts login');
    const raw = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    if (/用户登录|请先登录|登录超时|login_slogin/.test(raw)) throw new Error('会话已失效，请重新运行 usts login');
    if (resp.status >= 400) throw new Error(`查询失败：HTTP ${resp.status}`);
  }

  private parseResponseData(resp: AxiosResponse): any {
    if (typeof resp.data !== 'string') return resp.data;
    try { return JSON.parse(resp.data || '{}'); } catch { throw new Error('查询失败：服务端未返回有效 JSON'); }
  }

  private cleanHtml(value: string): string {
    return value
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>(\s*)/gi, ' ')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractVisibleText(html: string): string[] {
    return this.cleanHtml(html).split(/\s{2,}|\n+/).map((s) => s.trim()).filter(Boolean).slice(0, 200);
  }

  private matchText(value: string, pattern: RegExp): string | undefined {
    const m = value.match(pattern);
    return m?.[1]?.trim() || undefined;
  }

  private toNumber(value: any): number | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const m = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!m) return undefined;
    const n = Number(m[0]);
    return Number.isFinite(n) ? n : undefined;
  }
}
