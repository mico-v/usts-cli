import { AppError } from '../../domain/errors';

const SESSION_MARKERS = /用户登录|请先登录|登录超时|login_slogin/;

export interface ReadableResponse {
  status: number;
  data: unknown;
}

export function responseText(response: ReadableResponse): string {
  return typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
}

export function assertReadableResponse(response: ReadableResponse, operation = '查询'): void {
  if (response.status >= 300 && response.status < 400) {
    throw new AppError('SESSION_EXPIRED', '会话已失效，请重新运行 usts login');
  }
  const raw = responseText(response);
  if (SESSION_MARKERS.test(raw)) throw new AppError('SESSION_EXPIRED', '会话已失效，请重新运行 usts login');
  if (response.status === 429) {
    throw new AppError('RATE_LIMITED', '请求过于频繁，请等待 30~60 秒后重试', { retryable: true });
  }
  if (response.status >= 400) {
    throw new AppError('REMOTE_SERVER_ERROR', `${operation}失败：HTTP ${response.status}`, { retryable: response.status >= 500 });
  }
}

export function assertPdfResponse(status: number, bytes: Buffer): void {
  if (status >= 300 && status < 400) throw new AppError('SESSION_EXPIRED', '会话已失效，请重新运行 usts login');
  const prefix = bytes.subarray(0, 4096).toString('utf8');
  if (SESSION_MARKERS.test(prefix)) throw new AppError('SESSION_EXPIRED', '会话已失效，请重新运行 usts login');
  if (status === 429) throw new AppError('RATE_LIMITED', '请求过于频繁，请等待 30~60 秒后重试', { retryable: true });
  if (status >= 400) throw new AppError('REMOTE_SERVER_ERROR', `PDF 下载失败：HTTP ${status}`, { retryable: status >= 500 });
  if (!bytes.subarray(0, 5).toString('ascii').startsWith('%PDF-')) {
    throw new AppError('PROTOCOL_CHANGED', '服务端未返回有效 PDF 文件');
  }
}
