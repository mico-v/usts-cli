import * as fs from 'node:fs';
import * as path from 'node:path';
import { AppError } from '../domain/errors';
import { envFilePath } from './paths';
import { launchEnvironment } from './trust';

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
  // 信任开关只认**真实进程环境**：配置文件不得自行解除这条约束（见 config/trust.ts）。
  const trusted = launchEnvironment();
  const allowCustomHost = policy.allowCustomHost ?? trusted.USTS_ALLOW_CUSTOM_HOST === '1';
  const allowInsecureHttp = policy.allowInsecureHttp ?? trusted.USTS_ALLOW_INSECURE_HTTP === '1';
  if (url.protocol !== 'https:' && !allowInsecureHttp) {
    throw new AppError('CONFIGURATION_ERROR', '教务系统地址必须使用 HTTPS；开发环境需显式设置 USTS_ALLOW_INSECURE_HTTP=1');
  }
  if (url.hostname !== TRUSTED_HOST && !allowCustomHost) {
    throw new AppError(
      'CONFIGURATION_ERROR',
      `拒绝向未信任主机 ${url.hostname} 发送凭证；如确为开发环境，请显式设置 USTS_ALLOW_CUSTOM_HOST=1（该开关只能来自环境变量，不能写在配置文件里）`,
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

/** 文件是否「看起来像」本工具的配置（含 USTS_ 前缀的赋值行）。只看大小和首几行级别的内容。 */
function looksLikeUstsConfig(file: string): boolean {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > 64 * 1024) return false;
    return fs.readFileSync(file, 'utf8').split(/\r?\n/).some((line) => /^\s*USTS_[A-Z0-9_]+\s*=/.test(line));
  } catch {
    return false;
  }
}

/**
 * 启动告警。
 *
 * 重点是第二种：当前目录里有一份「看起来像配置、但不会被读取」的 `.env`。
 * 那是最容易造成误解的情形——用户以为它生效了，实际 CLI 用的是用户配置目录。
 */
export function configWarnings(cwd = process.cwd()): string[] {
  const warnings: string[] = [];
  const file = envFilePath(launchEnvironment());

  try {
    const mode = fs.statSync(file).mode & 0o777;
    if ((mode & 0o077) !== 0) warnings.push(`配置文件权限为 ${mode.toString(8)}，建议执行 chmod 600 ${file}`);
  } catch {
    // 配置文件可选。
  }

  const stale = path.resolve(cwd, '.env');
  if (stale !== file && looksLikeUstsConfig(stale)) {
    warnings.push(
      `未读取 ${stale}：配置文件现在只在 ${file} 查找（也可用 USTS_ENV_FILE 显式指定）。请把文件移到该位置。`,
    );
  }
  return warnings;
}

export function loadConfig(): AppConfig {
  return {
    baseUrl: normalizeBaseUrl(process.env.USTS_BASE_URL || DEFAULT_BASE_URL),
    warnings: configWarnings(),
  };
}
