import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as http from 'node:http';
import * as https from 'node:https';
import { AppError } from '../../domain/errors';

export type OperationEffect = 'read' | 'auth' | 'download' | 'mutation';

/**
 * 单次请求的超时。正方正常响应在 1~2 秒内，15 秒已是约 10 倍余量；
 * 再长用户只会以为程序卡死（实测 30 秒静默等待就是「像死机」的体感）。
 */
export const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
/** 下载/PDF 生成链允许更久：正方打印模块确实慢。 */
export const DOWNLOAD_REQUEST_TIMEOUT_MS = 45_000;

/**
 * 每种副作用的传输重试策略。
 *
 * `retryTimeouts` 单独区分开是有原因的：**超时的登录 POST 可能已经在服务端成功了**，
 * 重发会让失败计数翻倍、更快撞上验证码锁定（`yzcskz=3`）。登录流程的重复提交由
 * `loginViaScript` 自己按「首次 POST 被 WAF 重置」这一实测规律精确控制，不归这里管。
 */
const RETRY_POLICY: Record<OperationEffect, { attempts: number; retryTimeouts: boolean }> = {
  read: { attempts: 3, retryTimeouts: true },
  auth: { attempts: 3, retryTimeouts: false },
  download: { attempts: 2, retryTimeouts: true },
  mutation: { attempts: 1, retryTimeouts: false },
};

type FailureKind = 'timeout' | 'connection' | 'fatal';

export interface RetryNotice {
  /** 即将进行的尝试序号（从 2 开始） */
  attempt: number;
  maxAttempts: number;
  kind: Exclude<FailureKind, 'fatal'>;
  reason: string;
  delayMs: number;
}

export interface RetryOptions {
  effect?: OperationEffect;
  maxAttempts?: number;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
  /** 每次重试前回调，用于把「正在重试」告诉用户，而不是让终端静默卡住。 */
  onRetry?: (notice: RetryNotice) => void;
}

/**
 * 按错误对象分类传输失败。
 *
 * 必须同时看 `code` 和 `message`：axios 的超时错误 `code` 是 `ECONNABORTED`，
 * 但 message 是 `"timeout of 30000ms exceeded"` —— 只匹配 message 会漏掉它，
 * 结果是最常见的那类失败（连接被对端静默丢弃）反而从不重试。
 */
function classifyFailure(error: unknown): { kind: FailureKind; reason: string } {
  const code = typeof (error as { code?: unknown })?.code === 'string' ? (error as { code: string }).code : '';
  const message = error instanceof Error ? error.message : String(error);

  if (code === 'ECONNABORTED' || code === 'ETIMEDOUT' || /timeout/i.test(message)) {
    return { kind: 'timeout', reason: message };
  }
  if (/ECONNRESET|ECONNREFUSED|EPIPE|ERR_CONNECTION|socket hang up/i.test(`${code} ${message}`)) {
    return { kind: 'connection', reason: message };
  }
  return { kind: 'fatal', reason: message };
}

function toAppError(failure: { kind: FailureKind; reason: string }, cause: unknown): AppError {
  if (failure.kind === 'timeout') {
    return new AppError('REQUEST_TIMEOUT', '请求超时，请稍后重试', { cause, retryable: true });
  }
  return new AppError('NETWORK_UNAVAILABLE', `网络请求失败：${failure.reason}`, {
    cause,
    retryable: failure.kind === 'connection',
  });
}

export function createHttpClient(baseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: DEFAULT_REQUEST_TIMEOUT_MS,
    maxRedirects: 0,
    maxContentLength: 32 * 1024 * 1024,
    maxBodyLength: 4 * 1024 * 1024,
    validateStatus: () => true,
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 1 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 2, maxFreeSockets: 1 }),
  });
}

export async function executeWithRetry<T extends AxiosResponse>(
  operation: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const policy = RETRY_POLICY[options.effect ?? 'read'];
  const maxAttempts = Math.max(1, options.maxAttempts ?? policy.attempts);
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;

  // 写成无限循环、所有出口都是 return/throw：这样不会留下「循环结束后」的收尾分支
  // （那种分支在 maxAttempts >= 1 时永远不可达，只是死代码）。
  for (let attempt = 1; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const failure = classifyFailure(error);
      if (failure.kind === 'fatal') {
        throw toAppError(failure, error);
      }
      const retryAllowed = failure.kind === 'connection' || policy.retryTimeouts;
      if (!retryAllowed || attempt >= maxAttempts) {
        throw toAppError(failure, error);
      }
      // 超时通常意味着这条连接已被对端静默丢弃（WAF 空闲回收不发 FIN）：立刻换一条重试即可，
      // 久等无益。连接被重置更可能是限流，必须退避，否则只会越试越糟。
      const delayMs = failure.kind === 'timeout'
        ? 250 + Math.round(250 * random())
        : Math.max(500, Math.round(Math.min(12000, 3000 * 2 ** attempt) * (0.5 + random() * 0.5)));
      options.onRetry?.({
        attempt: attempt + 1,
        maxAttempts,
        kind: failure.kind,
        reason: failure.reason,
        delayMs,
      });
      await sleep(delayMs);
    }
  }
}
