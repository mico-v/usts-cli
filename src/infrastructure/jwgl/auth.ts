import { AuthenticatedTransport, FORM_CONTENT_TYPE } from '../http/authenticated-transport';
import { LoginResponse } from '../../types/api';
import { SessionState } from '../../domain/session';
import { errorMessage, isAppError } from '../../domain/errors';
import { currentTerm } from '../../domain/term';
import { formBody } from './form';
import { classifyResponse } from './response-policy';
import { encryptPassword } from './rsa';

/** 探针使用成绩查询接口：它就是各命令真正依赖的那条契约，能返回可解析包裹体才算「有效」。 */
const PROBE_PATH = '/cjcx/cjcx_cxXsgrcj.html';
const PROBE_GNMKDM = 'N305005';

/**
 * 主动探测会话是否有效。
 *
 * 只把**正面证据**当作结论：
 *   - 跳转登录页 / 响应体是登录页 / `HTTP 901` → `expired`
 *   - 受保护接口返回可解析的 `{items,totalCount}` → `valid`
 *   - 其余（网络不可达、WAF 重置、无法解释的响应）→ `unknown`
 *
 * `unknown` 绝不升级为 `expired`：把网络抖动当成失效会触发一次注定失败的登录，
 * 而 WAF 对短时间内的重复登录直接重置连接，用户最终看到的是「账号密码错误」。
 *
 * 这个函数**不触发自动重登**，因此可以安全地用于回答「用户给的这份凭据能不能用」。
 */
export async function probeSession(t: AuthenticatedTransport): Promise<SessionState> {
  if (t.cookieCount === 0) return 'expired';
  const term = currentTerm();
  try {
    const resp = await t.requestWithRetry(() =>
      t.http.post(`${PROBE_PATH}?doType=query&gnmkdm=${PROBE_GNMKDM}`, formBody({
        xnm: term.academicYear, xqm: term.semester,
        _search: 'false', nd: String(Date.now()),
        page: '1', rows: '1', sidx: '', sord: 'asc',
        'queryModel.showCount': '1', 'queryModel.currentPage': '1',
      }), {
        headers: {
          Cookie: t.cookieHeader(),
          Referer: `${t.baseUrl}${PROBE_PATH}`,
          'Content-Type': FORM_CONTENT_TYPE,
          'X-Requested-With': 'XMLHttpRequest',
        },
      }),
    );
    if (classifyResponse(resp) === 'session-expired') return 'expired';
    let data: unknown = resp.data;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return 'unknown'; }
    }
    if (data && typeof data === 'object' && ('items' in data || 'totalCount' in data)) return 'valid';
    return 'unknown';
  } catch {
    // 网络不可达 / WAF 连接重置：判不出来，不据此重登。
    return 'unknown';
  }
}

/**
 * 纯脚本登录（2026-08 实测）。经典正方 RSA 登录 + 「双 POST 重试」。
 *
 * USTS 前置瑞数 JSLUID WAF 会重置「会话内首次登录 POST」：
 *   第一次 POST 总被 302 跳回登录页（Set-Cookie 轮换 JSESSIONID），
 *   同一 cookie jar 上第二次 POST 即可成功跳到 index_initMenu。
 *   （实测 zfn_api 原样 body {csrftoken,yhm,mm} 单 mm 也能成功，重试是关键。）
 * 出现验证码（账号被连续失败锁出）时无法自动处理 → 提示改用 USTS_COOKIES/capture。
 *
 * 只负责协议本身；登录成功后「记录登录时间、持久化会话」由调用方（façade）完成。
 */
export async function loginViaScript(
  t: AuthenticatedTransport,
  username: string,
  password: string,
): Promise<LoginResponse> {
  try {
    // 1. 取登录页，解析 csrftoken，检测验证码
    const pageResp = await t.requestWithRetry(
      () => t.http.get('/xtgl/login_slogin.html', { headers: { Cookie: t.cookieHeader() } }),
      'auth',
    );
    t.storeCookies(pageResp.headers);
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
    const keyResp = await t.requestWithRetry(
      () => t.http.get('/xtgl/login_getPublicKey.html', {
        headers: { Cookie: t.cookieHeader(), Referer: `${t.baseUrl}/xtgl/login_slogin.html` },
      }),
      'auth',
    );
    t.storeCookies(keyResp.headers);
    const keyJson: any = keyResp.data;
    if (!keyJson || !keyJson.modulus || !keyJson.exponent) {
      return { success: false, errorCode: 'PROTOCOL_CHANGED', message: '获取 RSA 公钥失败，请稍后重试' };
    }
    const mm = encryptPassword(password, keyJson.modulus, keyJson.exponent);

    const postLogin = () => {
      const body = new URLSearchParams();
      body.append('csrftoken', csrf);
      body.append('language', 'zh_CN');
      body.append('ydType', '');
      body.append('yhm', username);
      body.append('mm', mm);
      body.append('mm', mm); // 浏览器会提交两次 mm（可见框 + 隐藏框）
      return t.http.post(`/xtgl/login_slogin.html?time=${Date.now()}`, body.toString(), {
        headers: {
          Cookie: t.cookieHeader(),
          Referer: `${t.baseUrl}/xtgl/login_slogin.html`,
          Origin: t.baseUrl,
          'Content-Type': FORM_CONTENT_TYPE,
          'X-Requested-With': 'XMLHttpRequest',
        },
      });
    };

    // 3. 提交登录。首次 POST 会被 WAF 重置会话 → 同一 cookie jar 重试一次。
    let resp = await t.requestWithRetry(postLogin, 'auth');
    t.storeCookies(resp.headers);
    let location: string = resp.headers['location'] || '';
    const firstBody = typeof resp.data === 'string' ? resp.data : '';
    // 凭据错误/验证码是确定性失败，重试只会把失败次数翻倍（连续 3 次触发验证码锁定）。
    const definitiveFailure = /用户名或密码|验证码/.test(firstBody);
    if (!/index_initMenu/.test(location) && !definitiveFailure) {
      await new Promise((r) => setTimeout(r, 1000));
      resp = await t.requestWithRetry(postLogin, 'auth');
      t.storeCookies(resp.headers);
      location = resp.headers['location'] || '';
    }

    if (/index_initMenu/.test(location)) {
      return { success: true, message: '登录成功', data: { username } };
    }
    const body = typeof resp.data === 'string' ? resp.data : firstBody;
    if (/用户名或密码/.test(body)) return { success: false, errorCode: 'INVALID_CREDENTIALS', message: '用户名或密码不正确' };
    if (/验证码/.test(body)) return { success: false, errorCode: 'CAPTCHA_REQUIRED', message: '账号需要图形验证码，请改用 USTS_COOKIES 或 npm run capture 人工登录' };
    return { success: false, errorCode: 'REMOTE_SERVER_ERROR', message: '登录失败：未跳转到主菜单，请检查账号密码后重试' };
  } catch (cause: unknown) {
    return {
      success: false,
      errorCode: isAppError(cause) ? cause.code : 'UNKNOWN_ERROR',
      message: `登录异常：${errorMessage(cause)}`,
    };
  }
}
