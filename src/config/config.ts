import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppError } from '../domain/errors';

export const DEFAULT_BASE_URL = 'https://jwgl.usts.edu.cn/jwglxt';
const TRUSTED_HOST = 'jwgl.usts.edu.cn';

export interface AppConfig {
  baseUrl: string;
  warnings: string[];
}

export interface BaseUrlPolicy {
  allowCustomHost?: boolean;
  allowInsecureHttp?: boolean;
}

export function normalizeBaseUrl(value: string, policy: BaseUrlPolicy = {}): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch (cause) {
    throw new AppError('CONFIGURATION_ERROR', `USTS_BASE_URL 不是有效 URL：${value}`, { cause });
  }
  const allowCustomHost = policy.allowCustomHost ?? process.env.USTS_ALLOW_CUSTOM_HOST === '1';
  const allowInsecureHttp = policy.allowInsecureHttp ?? process.env.USTS_ALLOW_INSECURE_HTTP === '1';
  if (url.protocol !== 'https:' && !allowInsecureHttp) {
    throw new AppError('CONFIGURATION_ERROR', '教务系统地址必须使用 HTTPS；开发环境需显式设置 USTS_ALLOW_INSECURE_HTTP=1');
  }
  if (url.hostname !== TRUSTED_HOST && !allowCustomHost) {
    throw new AppError(
      'CONFIGURATION_ERROR',
      `拒绝向未信任主机 ${url.hostname} 发送凭证；如确为开发环境，请显式设置 USTS_ALLOW_CUSTOM_HOST=1`,
    );
  }
  url.hash = '';
  url.search = '';
  return url.toString().replace(/\/$/, '');
}

export function assertSameOriginUrl(value: string, baseUrl: string): string {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  const resolved = new URL(value, base);
  if (resolved.protocol !== 'https:' && base.protocol === 'https:') {
    throw new AppError('PROTOCOL_CHANGED', '服务端返回了不安全的 HTTP 下载地址');
  }
  if (resolved.origin !== base.origin) {
    throw new AppError('PROTOCOL_CHANGED', `拒绝携带会话 Cookie 访问跨源下载地址：${resolved.origin}`);
  }
  return resolved.toString();
}

export function configWarnings(cwd = process.cwd()): string[] {
  const warnings: string[] = [];
  const envPath = path.resolve(cwd, '.env');
  try {
    const mode = fs.statSync(envPath).mode & 0o777;
    if ((mode & 0o077) !== 0) warnings.push(`.env 权限为 ${mode.toString(8)}，建议执行 chmod 600 .env`);
  } catch {
    // .env 可选。
  }
  return warnings;
}

export function loadConfig(): AppConfig {
  return {
    baseUrl: normalizeBaseUrl(process.env.USTS_BASE_URL || DEFAULT_BASE_URL),
    warnings: configWarnings(),
  };
}
