import { AxiosInstance, AxiosResponse } from 'axios';
import { BaseUrlPolicy, assertSameOriginUrl, normalizeBaseUrl } from '../../config/config';
import { AppError } from '../../domain/errors';
import { CookieJar, StoredCookie } from './cookie-jar';
import { createHttpClient, executeWithRetry, DOWNLOAD_REQUEST_TIMEOUT_MS, OperationEffect, RetryNotice } from './transport';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

export const FORM_CONTENT_TYPE = 'application/x-www-form-urlencoded;charset=UTF-8';
const MAX_DOWNLOAD_HOPS = 3;

/**
 * 响应类型。供上传模块标注签名，这样 `infrastructure/jwgl` 只依赖本模块、
 * 不直接依赖 axios（`tools/lint.mjs` 会把 axios 限制在 http 基础设施与 façade 内）。
 */
export type TransportResponse = AxiosResponse;

export interface TransportOptions extends BaseUrlPolicy {
  /** 每次重试前的结构化通知。文案属于展示层，因此由调用方决定怎么呈现。 */
  onRetry?: (notice: RetryNotice) => void;
  /** 响应轮换了 Cookie 时回调，供上层尽力持久化会话。 */
  onCookiesChanged?: () => void;
}

/**
 * 带会话的 HTTP 传输层。
 *
 * 只负责「把带 Cookie 的请求发出去、把响应拿回来」：Cookie Jar、重试与退避、同源
 * 重定向跟随、表单请求头。响应**语义**（会话是否失效、请求是否被拒）由
 * `infrastructure/jwgl` 判定，端点模块也只从这里拿 I/O。
 */
export class AuthenticatedTransport {
  readonly baseUrl: string;
  readonly http: AxiosInstance;
  private jar: CookieJar;
  private readonly cookieUrl: string;
  private readonly onRetry?: (notice: RetryNotice) => void;
  private readonly onCookiesChanged?: () => void;

  constructor(baseUrl: string = 'https://jwgl.usts.edu.cn/jwglxt', options: TransportOptions = {}) {
    this.baseUrl = normalizeBaseUrl(baseUrl, options);
    this.cookieUrl = `${this.baseUrl}/`;
    this.jar = new CookieJar(this.cookieUrl);
    this.onRetry = options.onRetry;
    this.onCookiesChanged = options.onCookiesChanged;
    // maxRedirects:0 + validateStatus 全收，便于自行判断登录/重定向结果
    this.http = createHttpClient(this.baseUrl);
    this.http.defaults.headers.common['User-Agent'] = UA;
  }

  get cookieCount(): number {
    return this.jar.size;
  }

  importCookies(raw: string): void {
    this.jar.importCookieHeader(raw, this.cookieUrl);
  }

  clearCookies(): void {
    this.jar = new CookieJar(this.cookieUrl);
  }

  serializeCookies(): StoredCookie[] {
    return this.jar.serialize();
  }

  restoreCookies(value: unknown): void {
    this.jar = new CookieJar(this.cookieUrl);
    this.jar.restore(value);
  }

  cookieHeader(url = this.cookieUrl): string {
    return this.jar.header(url);
  }

  /** 存下响应里的 Set-Cookie；返回是否发生了变化。 */
  storeCookies(headers: any): boolean {
    const setCookie = headers && (headers['set-cookie'] as string[] | undefined);
    if (!setCookie) return false;
    let changed = false;
    for (const c of Array.isArray(setCookie) ? setCookie : [String(setCookie)]) {
      changed = this.jar.setCookie(c, this.cookieUrl) || changed;
    }
    return changed;
  }

  formHeaders(referer: string): Record<string, string> {
    return {
      Cookie: this.cookieHeader(referer),
      Referer: referer,
      'Content-Type': FORM_CONTENT_TYPE,
      'X-Requested-With': 'XMLHttpRequest',
    };
  }

  /**
   * 发一次请求，按 effect 的传输策略重试，并收集响应里轮换的 Cookie。
   * WAF 会对短时间内的重复请求做连接层重置，策略与退避见 `transport.ts`。
   */
  async requestWithRetry(fn: () => Promise<AxiosResponse>, effect: OperationEffect = 'read'): Promise<AxiosResponse> {
    const resp = await executeWithRetry(fn, { effect, onRetry: this.onRetry });
    if (this.storeCookies(resp.headers)) this.onCookiesChanged?.();
    return resp;
  }

  /** 同源 GET，手动跟随重定向：每一跳都重新校验同源，绝不把会话 Cookie 带到外部主机。 */
  async getFollowingSameOrigin(target: string, responseType: 'arraybuffer'): Promise<AxiosResponse> {
    let url = target;
    for (let hop = 0; hop <= MAX_DOWNLOAD_HOPS; hop++) {
      const current = url;
      const resp = await this.requestWithRetry(() => this.http.get(current, {
        headers: this.formHeaders(current),
        responseType,
        timeout: DOWNLOAD_REQUEST_TIMEOUT_MS,
      }), 'download');
      if (resp.status < 300 || resp.status >= 400) return resp;
      const location = resp.headers['location'];
      if (typeof location !== 'string' || !location) return resp;
      url = assertSameOriginUrl(location, current);
    }
    throw new AppError('PROTOCOL_CHANGED', '下载地址重定向次数过多');
  }
}
