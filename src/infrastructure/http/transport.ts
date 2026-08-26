import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as http from 'node:http';
import * as https from 'node:https';
import { AppError } from '../../domain/errors';

export type OperationEffect = 'read' | 'auth' | 'download' | 'mutation';

export interface RetryOptions {
  effect?: OperationEffect;
  maxAttempts?: number;
  signal?: AbortSignal;
  sleep?: (milliseconds: number) => Promise<void>;
  random?: () => number;
}

const RETRYABLE_NETWORK_ERROR = /ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ERR_CONNECTION|socket hang up/i;

export function createHttpClient(baseUrl: string): AxiosInstance {
  return axios.create({
    baseURL: baseUrl,
    timeout: 30000,
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
  const effect = options.effect ?? 'read';
  const maxAttempts = effect === 'mutation' ? 1 : options.maxAttempts ?? 3;
  const sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const random = options.random ?? Math.random;
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (options.signal?.aborted) throw new AppError('CANCELLED', '请求已取消');
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable = RETRYABLE_NETWORK_ERROR.test(message);
      if (!retryable || attempt >= maxAttempts) {
        if (/timeout|ETIMEDOUT|ECONNABORTED/i.test(message)) {
          throw new AppError('REQUEST_TIMEOUT', '请求超时，请稍后重试', { cause: error, retryable });
        }
        throw new AppError('NETWORK_UNAVAILABLE', `网络请求失败：${message}`, { cause: error, retryable });
      }
      const ceiling = Math.min(12000, 3000 * 2 ** attempt);
      await sleep(Math.max(500, Math.round(ceiling * (0.5 + random() * 0.5))));
    }
  }
  throw new AppError('NETWORK_UNAVAILABLE', '网络请求失败', { cause: lastError });
}
