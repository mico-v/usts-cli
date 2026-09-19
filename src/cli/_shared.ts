import { error } from './logger';
import { AppError, errorMessage, exitCodeForError, isAppError } from '../domain/errors';
import { SessionLookup } from '../domain/session';
import { redactSecret } from '../shared/sanitize';
import { SessionGateway } from '../application/ports/jwgl-gateway';

/**
 * 交互式输入的前提检查。
 *
 * `inquirer` 在 stdin 不是终端（管道、`</dev/null`、CI）时会抛 `ERR_USE_AFTER_CLOSE`，
 * 而且崩溃前已经先往 stdout 吐了半截提示符，把管道输出也弄脏。需要在用户输入之前
 * 就给出可操作的提示，说明改用哪个非交互参数或环境变量。
 */
export function assertInteractiveTerminal(what: string, alternative: string): void {
  if (process.stdin.isTTY) return;
  throw new AppError(
    'CONFIGURATION_ERROR',
    `${what}需要交互式终端，但当前 stdin 不是终端。${alternative}`,
  );
}

/**
 * 数值型选项的解析（commander 的 option 回调）。
 * 非法值当场报参数错误，而不是把 `NaN` 一路带进请求参数——那样失败会伪装成「没有数据」。
 */
export function numericOption(value: string, label: string, minimum = 0): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum) {
    throw new AppError('CONFIGURATION_ERROR', `${label}必须是不小于 ${minimum} 的整数：${value}`);
  }
  return parsed;
}

/**
 * 会话不可用时给用户看的文案；可用（`valid`/`unknown`）时返回 `null`。
 * 命令入口与交互式预检共用同一处文案，避免两边漂移。
 *
 * 结论一律映射到 `AUTHENTICATION_REQUIRED`（退出码 3，见 `docs/contracts/cli.md`）：
 * `missing` 是「本地根本没有会话」，其余是会话失效——两类都是「需要先登录」的凭据问题。
 * 远端错误（网络、限流）不在这里判：它们由业务响应按 `AppError` 的稳定错误码上报。
 */
export function sessionProblem(client: SessionGateway, state: SessionLookup): string | null {
  if (state === 'valid' || state === 'unknown') return null;
  if (state === 'missing') return '未找到会话，请先运行 usts login 登录';

  const recovery = client.lastRecovery();
  if (recovery?.reason === 'credentials') {
    return '会话已失效，且未配置 USTS_USERNAME/USTS_PASSWORD 无法自动重新登录。请运行 usts login，或在配置文件中配置账号密码';
  }
  if (recovery?.reason === 'failed') {
    return `会话已失效，自动重新登录也失败：${recovery.message || '未知原因'}。请运行 usts login 检查账号密码`;
  }
  if (recovery?.reason === 'cooldown') {
    return '会话已失效，且上一次自动登录刚刚失败，正在冷却中。请稍后重试或运行 usts login';
  }
  return '会话已失效，请重新运行 usts login';
}

/**
 * 恢复会话并主动校验有效性。
 *
 * 与旧实现的区别：不再「本地有 Cookie 就直接开跑」。校验收敛到 `ensureValidSession()`，
 * 由它按信任窗口决定是否发一次探针请求，并在确认失效时自动重新登录。
 * 这里只负责把结论翻译成给用户看的话和退出码。
 *
 * `json` 必须传：会话失败是最需要机器判定的场景（脚本要先看「登录了没」再决定往下走），
 * 只写一行中文的话管道消费方拿不到任何可判定的东西。文案本身由 `reportCommandError`
 * 统一脱敏（消息里可能带 token）。
 */
export async function ensureSession(
  client: SessionGateway,
  options: { json?: boolean; command?: string } = {},
): Promise<boolean> {
  const problem = sessionProblem(client, await client.ensureValidSession());
  if (!problem) return true;

  reportCommandError(new AppError('AUTHENTICATION_REQUIRED', problem), '会话不可用', options);
  return false;
}

/**
 * 统一 CLI 错误输出和退出码。
 *
 * `src/` 里所有抛出都是带稳定错误码的 `AppError`（`executeWithRetry` 也会把传输层
 * 异常包成 `AppError`），因此非 `AppError` 只可能是内部 bug —— 直接归 `UNKNOWN_ERROR`。
 * 这里**不再**按中文消息反推错误码：那种分类层只会在真正出 bug 时给出错误结论，
 * 而且违反「不能用中文字符串作为跨层契约」（docs/architecture.md 规则 4）。
 */
export function reportCommandError(
  value: unknown,
  fallback = '操作失败',
  options: { json?: boolean; command?: string } = {},
): void {
  const normalized = isAppError(value)
    ? value
    : new AppError('UNKNOWN_ERROR', errorMessage(value, fallback), { cause: value });
  process.exitCode = exitCodeForError(normalized);
  // 错误消息里可能夹带带 token 的 URL；输出前统一脱敏。
  const message = redactSecret(errorMessage(normalized, fallback));
  if (options.json) {
    const appError = normalized;
    console.error(JSON.stringify({
      schemaVersion: 1,
      command: options.command || 'unknown',
      error: { code: appError.code, message, retryable: appError.retryable },
    }, null, 2));
  } else {
    console.error(error(message));
  }
}
