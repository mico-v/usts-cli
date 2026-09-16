import { AppError } from '../../domain/errors';

/**
 * 登录跳转/登录页的正向特征。
 * 注意这里只用于**判定失效**（出现即失效），不能反过来当作「有效」的证据——
 * 「错误提示」页同样不匹配这些特征，但它也不代表会话可用。
 */
const LOGIN_PATH = /login_slogin|\/xtgl\/login/i;
const SESSION_MARKERS = /用户登录|请先登录|登录超时|login_slogin/;

/**
 * 正方自定义的「未认证」状态码（2026-09 实测）。
 *
 * 对数据 Action 的未认证请求，服务端返回 `HTTP 901` + **空 body** + `Content-Length: 0`
 * （响应头带 `X-Via-JSL`，即瑞数 WAF 之后的应用层判定）。这与「参数被拒」是两回事：
 * 后者返回 `status=910` 或「错误提示」页，且**带 body**。
 * 因此 901 是「会话失效」的正面证据，而不是一个需要猜测的 5xx。
 */
const UNAUTHENTICATED_STATUS = 901;

export interface ReadableResponse {
  status: number;
  data: unknown;
  headers?: Record<string, unknown>;
}

/**
 * 远端响应的分类结论。
 *
 * `ambiguous` 是这套设计的关键：正方在会话失效与「参数缺失/接口改版」两种情况下
 * 都会返回「错误提示」独立页或 `{status:910}` 包裹体，**两者在响应层面不可区分**。
 * 与其用正则猜（猜错的两个方向都代价很高），不如把这个结论标记出来，
 * 交由上层发起一次主动探测拿正面证据。参见 `SessionManager.confirmExpired()`。
 */
export type ResponseVerdict =
  | 'ok'
  /** 有正面证据表明会话失效：重定向到登录页，或响应体是登录页 */
  | 'session-expired'
  /** 请求被拒，但无法区分会话失效与接口被拒/改版，需要探测确认 */
  | 'ambiguous'
  | 'rate-limited'
  | 'server-error';

function headerValue(response: ReadableResponse, name: string): string {
  const headers = response.headers;
  if (!headers) return '';
  const value = headers[name] ?? headers[name.toLowerCase()];
  return typeof value === 'string' ? value : Array.isArray(value) ? String(value[0] ?? '') : '';
}

function responseText(response: ReadableResponse): string {
  return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
}

export function classifyResponse(response: ReadableResponse): ResponseVerdict {
  const { status } = response;
  if (status === UNAUTHENTICATED_STATUS) return 'session-expired';
  if (status >= 300 && status < 400) {
    const location = headerValue(response, 'location');
    // 无 Location 的 3xx 是畸形响应；有 Location 但不指向登录页时也可能是
    // 合法下载跳转或 WAF 挑战页。两种情况都不足以判定失效，交给探测确认。
    if (location && LOGIN_PATH.test(location)) return 'session-expired';
    return 'ambiguous';
  }
  if (status === 429) return 'rate-limited';
  // 401 是认证信号但不构成「会话失效」的证据（也可能是接口权限），交探测确认。
  if (status === 401) return 'ambiguous';
  if (status >= 400) return 'server-error';
  if (SESSION_MARKERS.test(responseText(response))) return 'session-expired';
  return 'ok';
}

/** 构造「被拒但原因不明」的错误；`details.ambiguousSession` 供上层决定是否探测确认。 */
export function ambiguousRejection(operation: string, cause?: unknown): AppError {
  return new AppError(
    'PROTOCOL_CHANGED',
    `${operation}失败：服务端未返回预期内容（会话可能已失效，或接口被拒/改版）`,
    { cause, details: { ambiguousSession: true } },
  );
}

export function assertReadableResponse(response: ReadableResponse, operation = '查询'): void {
  switch (classifyResponse(response)) {
    case 'ok':
      return;
    case 'session-expired':
      throw new AppError('SESSION_EXPIRED', '会话已失效，请重新运行 usts login');
    case 'ambiguous':
      throw ambiguousRejection(operation, response);
    case 'rate-limited':
      throw new AppError('RATE_LIMITED', '请求过于频繁，请等待 30~60 秒后重试', { retryable: true });
    case 'server-error':
      throw new AppError('REMOTE_SERVER_ERROR', `${operation}失败：HTTP ${response.status}`, {
        retryable: response.status >= 500,
      });
  }
}

export function assertPdfResponse(status: number, bytes: Buffer, headers?: Record<string, unknown>): void {
  const response: ReadableResponse = { status, data: '', headers };
  const verdict = classifyResponse(response);
  if (verdict === 'session-expired') throw new AppError('SESSION_EXPIRED', '会话已失效，请重新运行 usts login');
  if (verdict === 'ambiguous' || verdict === 'server-error') {
    throw new AppError(
      verdict === 'ambiguous' ? 'PROTOCOL_CHANGED' : 'REMOTE_SERVER_ERROR',
      `PDF 下载失败：HTTP ${status}`,
      { retryable: status >= 500 },
    );
  }
  if (verdict === 'rate-limited') {
    throw new AppError('RATE_LIMITED', '请求过于频繁，请等待 30~60 秒后重试', { retryable: true });
  }
  // 登录页 HTML 有时以 200 返回，此时状态码层面看不出来，再看正文前缀。
  const prefix = bytes.subarray(0, 4096).toString('utf8');
  if (SESSION_MARKERS.test(prefix)) throw new AppError('SESSION_EXPIRED', '会话已失效，请重新运行 usts login');
  if (!bytes.subarray(0, 5).toString('ascii').startsWith('%PDF-')) {
    throw new AppError('PROTOCOL_CHANGED', '服务端未返回有效 PDF 文件');
  }
}
