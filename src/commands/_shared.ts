import { error } from '../lib/logger';
import { AppError, errorMessage, exitCodeForError, isAppError } from '../domain/errors';
import { currentTerm } from '../domain/term';
import { SessionGateway } from '../application/ports/jwgl-gateway';

/** 只恢复本地会话；业务请求负责识别过期，避免每条命令多一次远端预检。 */
export async function ensureSession(client: SessionGateway): Promise<boolean> {
  if (!client.restoreSession()) {
    console.error(error('未找到会话，请先运行 usts login 登录'));
    process.exitCode = 3;
    return false;
  }
  return true;
}

/** 统一 CLI 错误输出和退出码；兼容尚未迁移为 AppError 的旧错误。 */
export function reportCommandError(
  value: unknown,
  fallback = '操作失败',
  options: { json?: boolean; command?: string } = {},
): void {
  let normalized = value;
  if (!isAppError(value)) {
    const message = errorMessage(value, fallback);
    if (/会话已失效|请先登录|未找到会话/.test(message)) normalized = new AppError('SESSION_EXPIRED', message, { cause: value });
    else if (/验证码/.test(message)) normalized = new AppError('CAPTCHA_REQUIRED', message, { cause: value });
    else if (/HTTP \d+|服务端|远端/.test(message)) normalized = new AppError('REMOTE_SERVER_ERROR', message, { cause: value });
    else normalized = new AppError('UNKNOWN_ERROR', message, { cause: value });
  }
  process.exitCode = exitCodeForError(normalized);
  if (options.json) {
    const appError = normalized as AppError;
    console.error(JSON.stringify({
      schemaVersion: 1,
      command: options.command || 'unknown',
      error: { code: appError.code, message: errorMessage(appError, fallback), retryable: appError.retryable },
    }, null, 2));
  } else {
    console.error(error(errorMessage(normalized, fallback)));
  }
}

/** 学期代码 -> 中文名（短，用于“第X学期”中的 X） */
export function xqmName(xqm?: string): string {
  if (xqm === '3') return '一';
  if (xqm === '12') return '二';
  if (xqm === '16') return '三（小学期）';
  return xqm || '?';
}

/** 学期名（来自接口 xqmmc，值为 1/2/3）-> 中文整名 */
export function semesterLabel(xqmmc?: string): string {
  if (xqmmc === '1') return '第一学期';
  if (xqmmc === '2') return '第二学期';
  if (xqmmc === '3') return '第三学期';
  return xqmmc || '';
}

/** 学年名（来自接口 xnmmc，如 2025-2026）兜底拼装 */
export function academicYearLabel(xnm?: string, xnmmc?: string): string {
  if (xnmmc) return xnmmc;
  const y = Number(xnm);
  if (y) return `${y}-${y + 1}`;
  return xnm || '';
}

/** 学年/学期 → 标题用标签（学期为空 = 全部学期） */
export function termLabel(xnm: string, xqm: string): string {
  const y = academicYearLabel(xnm);
  return xqm ? `${y} 学年 · 第${xqmName(xqm)}学期` : `${y} 学年 · 全部学期`;
}

/**
 * 解析学年/学期参数。
 * 与网页行为一致（2026-08 抓包实测）：
 *   - 什么都不给 → 用 currentTerm() 当前学期
 *   - 只给 -y（学年）→ 学期留空（=“全部学期”），网页选中学年后缺省即全部
 *   - 给了 -y 和 -t → 按给定学期
 */
export function resolveTerm(opts: { xnm?: string; xqm?: string }): { xnm: string; xqm: string } {
  const def = currentTerm();
  const xnm = opts.xnm || def.academicYear;
  const xqm = opts.xqm !== undefined ? opts.xqm : (opts.xnm ? '' : def.semester);
  return { xnm, xqm };
}
