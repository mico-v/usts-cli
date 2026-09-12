/**
 * 会话状态的稳定领域契约。
 *
 * 关键点：会话有效性必须由「主动探测得到的正面证据」决定，而不是由
 * 「响应体里没出现某个关键字」推测。所以这里用三态而不是布尔值：
 *
 *   - `valid`   ：受保护接口返回了可解析的业务数据（正面证据）
 *   - `expired` ：重定向到登录页 / 响应体出现登录页标记（正面证据）
 *   - `unknown` ：网络不可达、WAF 连接重置等，**无法判断**
 *
 * `unknown` 绝不能当成 `expired` 处理：把网络抖动当成会话失效会触发一次注定
 * 失败的重新登录，而 WAF 对短时间内的重复登录会直接重置连接，最终用户看到的
 * 是「账号密码错误」——比原本的问题更糟。
 */
export type SessionState = 'valid' | 'expired' | 'unknown';

/** 会话查找结果：比 `SessionState` 多一个「本地压根没有会话」的情形。 */
export type SessionLookup = SessionState | 'missing';

/** 尝试自动恢复会话的结果，用于给出可操作的提示。 */
export type RecoveryReason =
  /** 环境变量里没有可用于重登的凭据 */
  | 'credentials'
  /** 有凭据但登录失败（账号密码错误、验证码、WAF 限流等） */
  | 'failed'
  /** 刚失败过，处于冷却期，避免连续登录把账号打进验证码/限流 */
  | 'cooldown';

export interface RecoveryResult {
  ok: boolean;
  reason?: RecoveryReason;
  message?: string;
}

/**
 * 本地会话概要，**不发网络请求**。
 *
 * `loggedIn` 只表示本地存有一份可用的会话文件，不代表服务端仍然认它——
 * 服务端是否有效只能由主动探测回答（`SessionState`）。交互式界面用它做即时状态显示，
 * 真正的校验留给异步探针。
 */
export interface LocalSessionInfo {
  loggedIn: boolean;
  username?: string;
  loginTime?: Date;
}
