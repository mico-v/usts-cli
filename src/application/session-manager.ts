/**
 * 会话状态机
 *
 * 职责：回答「现在这份会话还能不能用」，并在失效时尝试自动重新登录。
 * 所有的 I/O（Cookie 读写、探针请求、登录）都通过 `SessionPort` 交给适配器，
 * 因此这里可以独立于 HTTP 层做单元测试。
 *
 * 三条设计约束（都源自实测到的服务端行为）：
 *
 * 1. **主动探测要有信任窗口**。刚登录完立刻跑命令不该再多发一次探针请求；
 *    但隔夜之后再跑就必须探一次，否则注定白跑一趟业务请求。
 * 2. **探测结果 `unknown` 一律 fail-open**。网络抖动不等于会话失效，
 *    放行业务请求、由业务响应兜底，好过因为一次抖动触发一次注定失败的登录。
 * 3. **恢复必须单飞 + 冷却**。WAF 对短时间内的重复登录做连接层重置
 *    （见 CLAUDE.md），并发的失败请求各自发起一次登录会直接把账号打进限流。
 */
import { RecoveryResult, SessionLookup, SessionState } from '../domain/session';
import { LoginResponse } from '../types/identity';

/** 会话状态机需要的 I/O 能力，由适配器（`infrastructure/jwgl/gateway.ts` 的 `JwglGateway`）实现。 */
export interface SessionPort {
  /** 只从本地恢复会话，不发起网络请求。 */
  restoreSession(): boolean;
  /** 上次成功登录的时间戳（毫秒）；未知时返回 undefined。 */
  lastLoginAt(): number | undefined;
  /** 主动请求受保护接口，返回三态结论。 */
  probeSession(): Promise<SessionState>;
  /**
   * 仅使用环境变量中的凭据重新登录。
   * 没有凭据时必须返回 `AUTHENTICATION_REQUIRED`，**不得**触发交互式输入——
   * 自动重登发生在命令执行中途，此时弹提示会破坏调用方的语义。
   */
  loginFromEnvironment(): Promise<LoginResponse>;
}

export interface SessionManagerOptions {
  /** 信任窗口：登录/校验成功后的这段时间内不再主动探测。 */
  trustWindowMs?: number;
  /** 恢复失败后的冷却时间，避免连续登录触发验证码与 WAF 限流。 */
  recoveryCooldownMs?: number;
  /** 时钟注入，便于稳定测试。 */
  now?: () => number;
}

/** 与网页一致：正方会话通常在数小时~数天内失效，5 分钟内的复用无需探测。 */
export const DEFAULT_TRUST_WINDOW_MS = 5 * 60 * 1000;
/** WAF 限流需要等待 30~60 秒，冷却取同一量级。 */
export const DEFAULT_RECOVERY_COOLDOWN_MS = 60 * 1000;

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export class SessionManager {
  private verifiedAt: number | undefined;
  private recovery: Promise<RecoveryResult> | undefined;
  private ensuring: Promise<SessionLookup> | undefined;
  private lastFailureAt: number | undefined;
  private lastResult: RecoveryResult | undefined;
  /** 登出会递增它，用于让在途的探测/重登结果作废。 */
  private epoch = 0;
  /** 业务响应已证实失效：在重新验证成功前，任何信任窗口都不再适用。 */
  private invalidated = false;
  private readonly trustWindowMs: number;
  private readonly recoveryCooldownMs: number;
  private readonly now: () => number;

  constructor(private readonly port: SessionPort, options: SessionManagerOptions = {}) {
    this.trustWindowMs = options.trustWindowMs
      ?? positiveInteger(process.env.USTS_SESSION_TRUST_MS, DEFAULT_TRUST_WINDOW_MS);
    this.recoveryCooldownMs = options.recoveryCooldownMs ?? DEFAULT_RECOVERY_COOLDOWN_MS;
    this.now = options.now ?? (() => Date.now());
  }

  /** 信任窗口内视为有效：刚登录完或刚探测过。 */
  private trusted(): boolean {
    if (this.invalidated) return false;
    const now = this.now();
    if (this.verifiedAt !== undefined && now - this.verifiedAt < this.trustWindowMs) return true;
    const loginAt = this.port.lastLoginAt();
    return loginAt !== undefined && now - loginAt < this.trustWindowMs;
  }

  /** 记下一次成功的校验/登录，开启信任窗口。 */
  markVerified(): void {
    this.verifiedAt = this.now();
    this.lastFailureAt = undefined;
    this.invalidated = false;
  }

  /**
   * 业务响应已证实会话失效：清掉信任窗口。
   * 否则「刚探测通过」或「刚登录」的缓存会让同一次运行里后续请求继续被误判为有效。
   */
  markExpired(): void {
    this.verifiedAt = undefined;
    this.invalidated = true;
  }

  /**
   * 确保会话可用。
   * - `missing`：本地没有会话
   * - `valid`  ：探测到正面证据，或处于信任窗口内，或已自动重登成功
   * - `unknown`：无法判断（网络问题），调用方应放行并由业务响应兜底
   * - `expired`：确认失效且自动重登没能成功
   *
   * 并发调用会合并成同一次：交互式界面会在用户选择菜单时就预检一次，命令入口随后
   * 还会再调一次，各发一次探针既浪费也会招来 WAF 限流。
   */
  async ensure(force = false): Promise<SessionLookup> {
    if (!this.port.restoreSession()) return 'missing';
    if (!force && this.trusted()) return 'valid';
    if (!this.ensuring) {
      const attempt = this.runEnsure();
      this.ensuring = attempt;
      this.retire(attempt, 'ensuring');
    }
    return this.ensuring;
  }

  private async runEnsure(): Promise<SessionLookup> {
    const epoch = this.epoch;
    const state = await this.port.probeSession();
    if (epoch !== this.epoch) return 'missing'; // 期间登出了
    if (state === 'valid') {
      this.markVerified();
      return 'valid';
    }
    if (state === 'unknown') return 'unknown';

    this.verifiedAt = undefined;
    const recovery = await this.recover();
    if (epoch !== this.epoch) return 'missing';
    return recovery.ok ? 'valid' : 'expired';
  }

  /** 尝试结束后清空在途标记；只清自己那一次，避免把 reset 之后新建的尝试清掉。 */
  private retire<T>(attempt: Promise<T>, slot: 'ensuring' | 'recovery'): void {
    const clear = () => { if (this[slot] === attempt) this[slot] = undefined; };
    void attempt.then(clear, clear);
  }

  /**
   * 登出：丢弃全部记忆状态。
   * `epoch` 递增会让在途的探测/重登结果作废——否则一次后台自动重登可能在登出之后
   * 才返回，把刚清掉的会话又"恢复"回来。
   */
  reset(): void {
    this.epoch += 1;
    this.verifiedAt = undefined;
    this.invalidated = false;
    this.lastFailureAt = undefined;
    this.lastResult = undefined;
    this.recovery = undefined;
    this.ensuring = undefined;
  }

  /**
   * 会话被判失效后主动确认一次。
   * 用于「业务响应看起来被拒，但无法确定是不是会话问题」的歧义场景：
   * 与其猜，不如探一次拿正面证据。
   */
  async confirmExpired(): Promise<boolean> {
    return (await this.port.probeSession()) === 'expired';
  }

  /** 自动重新登录；并发调用共享同一次尝试。 */
  async recover(): Promise<RecoveryResult> {
    const now = this.now();
    if (this.lastFailureAt !== undefined && now - this.lastFailureAt < this.recoveryCooldownMs) {
      return { ok: false, reason: 'cooldown', message: '刚刚的自动登录失败，稍后再试' };
    }
    if (!this.recovery) {
      const attempt = this.runRecovery();
      this.recovery = attempt;
      this.retire(attempt, 'recovery');
    }
    return this.recovery;
  }

  private async runRecovery(): Promise<RecoveryResult> {
    const epoch = this.epoch;
    const result = await this.port.loginFromEnvironment();
    if (epoch !== this.epoch) {
      // 期间登出了：丢掉这次登录结果，别把已清掉的会话恢复回来。
      return { ok: false };
    }
    if (result.success) {
      this.lastResult = { ok: true };
      this.markVerified();
      return this.lastResult;
    }
    this.lastFailureAt = this.now();
    const reason = result.errorCode === 'AUTHENTICATION_REQUIRED' ? 'credentials' : 'failed';
    this.lastResult = { ok: false, reason, message: result.message };
    return this.lastResult;
  }

  /** 最近一次自动重登的结果，供上层给出可操作的提示。 */
  lastRecovery(): RecoveryResult | undefined {
    return this.lastResult;
  }
}
