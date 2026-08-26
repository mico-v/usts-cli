export type AppErrorCode =
  | 'CONFIGURATION_ERROR'
  | 'AUTHENTICATION_REQUIRED'
  | 'SESSION_EXPIRED'
  | 'INVALID_CREDENTIALS'
  | 'CAPTCHA_REQUIRED'
  | 'RATE_LIMITED'
  | 'NETWORK_UNAVAILABLE'
  | 'REQUEST_TIMEOUT'
  | 'REMOTE_SERVER_ERROR'
  | 'PROTOCOL_CHANGED'
  | 'FILE_SYSTEM_ERROR'
  | 'CANCELLED'
  | 'UNKNOWN_ERROR';

export interface AppErrorOptions {
  cause?: unknown;
  retryable?: boolean;
  details?: Record<string, unknown>;
}

/** 跨基础设施、应用层和 CLI 使用的稳定错误契约。 */
export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;

  constructor(code: AppErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
    this.cause = options.cause;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function errorMessage(value: unknown, fallback = '未知错误'): string {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === 'string' && value) return value;
  return fallback;
}

export function exitCodeForError(value: unknown): number {
  if (!isAppError(value)) return 1;
  switch (value.code) {
    case 'CONFIGURATION_ERROR': return 2;
    case 'AUTHENTICATION_REQUIRED':
    case 'SESSION_EXPIRED':
    case 'INVALID_CREDENTIALS':
    case 'CAPTCHA_REQUIRED': return 3;
    case 'RATE_LIMITED':
    case 'NETWORK_UNAVAILABLE':
    case 'REQUEST_TIMEOUT':
    case 'REMOTE_SERVER_ERROR': return 4;
    case 'PROTOCOL_CHANGED': return 5;
    case 'FILE_SYSTEM_ERROR': return 6;
    case 'CANCELLED': return 130;
    default: return 1;
  }
}
