const test = require('node:test');
const assert = require('node:assert/strict');

const { SessionManager } = require('../dist/application/session-manager');

/** 可观测的假 SessionPort：记录调用次数，其余行为按用例覆写。 */
function makePort(overrides = {}) {
  const port = {
    restoreCalls: 0,
    probeCalls: 0,
    loginCalls: 0,
    loginAt: undefined,
    probeResults: ['valid'],
    loginResults: [],
    restoreSession() {
      this.restoreCalls += 1;
      return true;
    },
    lastLoginAt() {
      return this.loginAt;
    },
    async probeSession() {
      this.probeCalls += 1;
      return this.probeResults.length > 1 ? this.probeResults.shift() : this.probeResults[0];
    },
    async loginFromEnvironment() {
      this.loginCalls += 1;
      return this.loginResults.length
        ? this.loginResults.shift()
        : { success: true, message: 'ok' };
    },
    ...overrides,
  };
  return port;
}

function makeManager(port, options = {}) {
  let clock = options.start ?? 1_000_000;
  const manager = new SessionManager(port, {
    trustWindowMs: options.trustWindowMs ?? 0,
    recoveryCooldownMs: options.recoveryCooldownMs ?? 60_000,
    now: () => clock,
    ...options.manager,
  });
  return { manager, advance: (ms) => { clock += ms; } };
}

test('没有本地会话时返回 missing，且不发起任何请求', async () => {
  const port = makePort({ restoreSession: () => false });
  const { manager } = makeManager(port);
  assert.equal(await manager.ensure(), 'missing');
  assert.equal(port.probeCalls, 0);
});

test('信任窗口内直接复用，不做主动探测', async () => {
  const port = makePort();
  const { manager } = makeManager(port, { trustWindowMs: 5 * 60 * 1000 });
  port.loginAt = 1_000_000 - 1000; // 1 秒前刚登录
  assert.equal(await manager.ensure(), 'valid');
  assert.equal(port.probeCalls, 0);

  // 窗口过期后必须探测
  const { manager: stale, advance } = makeManager(port, { trustWindowMs: 1000 });
  port.loginAt = 1_000_000;
  advance(5000);
  assert.equal(await stale.ensure(), 'valid');
  assert.equal(port.probeCalls, 1);
});

test('探测到 expired 时自动重新登录并回到 valid', async () => {
  const port = makePort({ probeResults: ['expired'] });
  const { manager } = makeManager(port);
  assert.equal(await manager.ensure(), 'valid');
  assert.equal(port.loginCalls, 1);
});

test('探测到 expired 且没有可用凭据时返回 expired，并带上可操作的原因', async () => {
  const port = makePort({
    probeResults: ['expired'],
    loginResults: [{ success: false, errorCode: 'AUTHENTICATION_REQUIRED', message: '未配置账号密码' }],
  });
  const { manager } = makeManager(port);
  assert.equal(await manager.ensure(), 'expired');
  assert.equal(manager.lastRecovery().reason, 'credentials');
});

test('探测结果为 unknown（网络异常）时不触发重登，按 fail-open 放行', async () => {
  const port = makePort({ probeResults: ['unknown'] });
  const { manager } = makeManager(port);
  assert.equal(await manager.ensure(), 'unknown');
  assert.equal(port.loginCalls, 0);
});

test('并发恢复只发起一次登录', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const port = makePort({
    async loginFromEnvironment() {
      this.loginCalls += 1;
      await gate;
      return { success: true, message: 'ok' };
    },
  });
  const { manager } = makeManager(port);
  const attempts = Promise.all([manager.recover(), manager.recover(), manager.recover()]);
  release();
  const results = await attempts;
  assert.equal(port.loginCalls, 1);
  assert.deepEqual(results.map((r) => r.ok), [true, true, true]);
});

test('恢复失败后进入冷却期，避免连续登录把账号打进验证码锁定', async () => {
  const port = makePort({
    loginResults: [{ success: false, errorCode: 'INVALID_CREDENTIALS', message: '密码错误' }],
  });
  const { manager } = makeManager(port);
  const first = await manager.recover();
  assert.equal(first.ok, false);
  assert.equal(first.reason, 'failed');

  const second = await manager.recover();
  assert.equal(second.reason, 'cooldown');
  assert.equal(port.loginCalls, 1, '冷却期内不得再次发起登录');
});

test('markExpired 清除信任窗口，markVerified 恢复它', async () => {
  const port = makePort();
  port.loginAt = 1_000_000;
  const { manager } = makeManager(port, { trustWindowMs: 60_000 });
  assert.equal(await manager.ensure(), 'valid');
  assert.equal(port.probeCalls, 0);

  manager.markExpired();
  await manager.ensure();
  assert.equal(port.probeCalls, 1, '业务已证实失效后必须重新探测');

  manager.markVerified();
  await manager.ensure();
  assert.equal(port.probeCalls, 1);
});

test('confirmExpired 只在拿到失效的正面证据时为 true', async () => {
  const expired = makeManager(makePort({ probeResults: ['expired'] })).manager;
  assert.equal(await expired.confirmExpired(), true);

  const unknown = makeManager(makePort({ probeResults: ['unknown'] })).manager;
  assert.equal(await unknown.confirmExpired(), false, '探测不出结论时不得当成失效');

  const valid = makeManager(makePort({ probeResults: ['valid'] })).manager;
  assert.equal(await valid.confirmExpired(), false);
});

test('并发 ensure 合并成同一次探测', async () => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const port = makePort({
    async probeSession() {
      this.probeCalls += 1;
      await gate;
      return 'valid';
    },
  });
  const { manager } = makeManager(port);

  // 交互式界面在用户选菜单时预检，命令入口随后还会调一次——不能各发一次探针
  const results = Promise.all([manager.ensure(), manager.ensure(), manager.ensure()]);
  release();
  assert.deepEqual(await results, ['valid', 'valid', 'valid']);
  assert.equal(port.probeCalls, 1);
});

test('reset（登出）之后，在途的重登结果不再恢复会话', async () => {
  let entered;
  let release;
  const enteredLogin = new Promise((resolve) => { entered = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  const port = makePort({
    probeResults: ['expired'],
    async loginFromEnvironment() {
      this.loginCalls += 1;
      entered();
      await gate;
      return { success: true, message: 'ok' };
    },
  });
  const { manager } = makeManager(port, { trustWindowMs: 60_000 });

  const pending = manager.ensure();
  await enteredLogin;
  manager.reset();               // 用户在此期间点了「退出登录」
  release();

  assert.equal(await pending, 'missing', '登出后在途的自动登录必须作废');

  // 且这次被丢弃的登录不得留下信任窗口：下一次仍要真的探测
  const before = port.probeCalls;
  await manager.ensure();
  assert.equal(port.probeCalls, before + 1, '登出后必须重新探测');
});
