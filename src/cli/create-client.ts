/**
 * CLI 的网关装配点。
 *
 * 重试提示（「请求超时，正在重试（2/3）…」）是给人看的文案，所以归展示层：基础设施
 * 只上报结构化的 `RetryNotice`，这里把它接到 stderr（诊断信息不进 stdout，`--json`
 * 与管道输出才不会被弄脏）。生产构造点只有这一个，两处调用都从这里走。
 */
import { JwglGateway, JwglGatewayOptions } from '../infrastructure/jwgl/gateway';
import { RetryNotice } from '../infrastructure/http/transport';
import { warning } from './logger';

/**
 * 重试提示的文案。
 *
 * 抽成纯函数是为了能直接测文案：静默等待会被用户当成死机（实测他们会以为卡住并
 * 反复按键，终端因此回显一堆转义序列），所以这段文字本身就是修复的一部分。
 */
export function formatRetryNotice(notice: RetryNotice): string {
  return notice.kind === 'timeout'
    ? `请求超时，正在重试（${notice.attempt}/${notice.maxAttempts}）…`
    : `连接被重置，${Math.max(1, Math.round(notice.delayMs / 1000))} 秒后重试（${notice.attempt}/${notice.maxAttempts}）…`;
}

/** 构造网关实例；`onRetry` 默认接到 stderr。 */
export function createClient(baseUrl: string, options: JwglGatewayOptions = {}): JwglGateway {
  return new JwglGateway(baseUrl, {
    ...options,
    onRetry: options.onRetry ?? ((notice) => console.error(warning(formatRetryNotice(notice)))),
  });
}
