const test = require('node:test');
const assert = require('node:assert/strict');

const { executeWithRetry, createHttpClient, DEFAULT_REQUEST_TIMEOUT_MS, DOWNLOAD_REQUEST_TIMEOUT_MS } = require('../dist/infrastructure/http/transport');
const { formatRetryNotice } = require('../dist/lib/client');

/** axios 的真实超时错误形状：code 是 ECONNABORTED，而 message 里并不含 code 文本。 */
function timeoutError() {
  return Object.assign(new Error('timeout of 15000ms exceeded'), { code: 'ECONNABORTED' });
}

function connectionError() {
  return Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' });
}

function alwaysThrows(error) {
  return async () => { throw error; };
}

async function attemptsUntilFailure(error, options) {
  let attempts = 0;
  await assert.rejects(executeWithRetry(async () => {
    attempts += 1;
    throw error;
  }, options));
  return attempts;
}

test('read operations retry retryable connection failures', async () => {
  let attempts = 0;
  const result = await executeWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) throw new Error('ECONNRESET');
    return { status: 200 };
  }, { effect: 'read', sleep: async () => {}, random: () => 0 });
  assert.equal(result.status, 200);
  assert.equal(attempts, 3);
});

test('mutation operations are never retried automatically', async () => {
  assert.equal(
    await attemptsUntilFailure(connectionError(), { effect: 'mutation', sleep: async () => {} }),
    1,
  );
});

test('read operations retry a request timeout', async () => {
  // 回归用例：旧实现只拿正则匹配错误 message，而 axios 超时的 message 是
  // "timeout of Nms exceeded"（不含 ETIMEDOUT/ECONNABORTED 字样），于是最常见的
  // 那类失败反而从不重试——一次 30 秒静默挂起后直接报错。
  let attempts = 0;
  const notices = [];
  const result = await executeWithRetry(async () => {
    attempts += 1;
    if (attempts < 2) throw timeoutError();
    return { status: 200 };
  }, { effect: 'read', sleep: async () => {}, random: () => 0, onRetry: (notice) => notices.push(notice) });

  assert.equal(result.status, 200);
  assert.equal(attempts, 2);
  assert.deepEqual(notices, [{
    attempt: 2,
    maxAttempts: 3,
    kind: 'timeout',
    reason: 'timeout of 15000ms exceeded',
    delayMs: 250,
  }]);
});

test('超时用短退避，连接重置用长退避', async () => {
  const delaysFor = async (error) => {
    const delays = [];
    await attemptsUntilFailure(error, {
      effect: 'read',
      sleep: async (ms) => { delays.push(ms); },
      random: () => 0,
    });
    return delays;
  };
  // 超时通常是对端静默丢弃了这条连接：立刻换一条重试即可，久等无益。
  assert.deepEqual(await delaysFor(timeoutError()), [250, 250]);
  // 连接重置更可能是 WAF 限流，必须退避，否则越试越糟。
  assert.deepEqual(await delaysFor(connectionError()), [3000, 6000]);
});

test('auth 不重试超时：重发的登录 POST 会重复计入失败次数', async () => {
  assert.equal(
    await attemptsUntilFailure(timeoutError(), { effect: 'auth', sleep: async () => {} }),
    1,
    '超时的登录 POST 可能已经在服务端生效，重发会把账号更快推向验证码锁定',
  );
});

test('download 允许重试超时，但只给两次机会', async () => {
  assert.equal(
    await attemptsUntilFailure(timeoutError(), { effect: 'download', sleep: async () => {} }),
    2,
    'PDF 生成链单步超时值得换连接重试一次，但不能无限拖长',
  );
});

test('不可重试的传输错误立即抛出', async () => {
  const fatal = Object.assign(new Error('self-signed certificate'), { code: 'DEPTH_ZERO_SELF_SIGNED_CERT' });
  assert.equal(await attemptsUntilFailure(fatal, { effect: 'read', sleep: async () => {} }), 1);
  await assert.rejects(
    executeWithRetry(alwaysThrows(fatal), { effect: 'read', sleep: async () => {} }),
    (error) => error.code === 'NETWORK_UNAVAILABLE' && error.retryable === false,
  );
});

test('重试提示文案说明发生了什么以及还要等多久', () => {
  assert.equal(
    formatRetryNotice({ attempt: 2, maxAttempts: 3, kind: 'timeout', reason: 'x', delayMs: 250 }),
    '请求超时，正在重试（2/3）…',
  );
  assert.equal(
    formatRetryNotice({ attempt: 3, maxAttempts: 3, kind: 'connection', reason: 'x', delayMs: 6000 }),
    '连接被重置，6 秒后重试（3/3）…',
  );
  // 不足 1 秒的退避不能显示成「0 秒」
  assert.match(
    formatRetryNotice({ attempt: 2, maxAttempts: 3, kind: 'connection', reason: 'x', delayMs: 400 }),
    /1 秒后重试/,
  );
});

test('单次请求超时不会长到像卡死，下载另有更长的上限', () => {
  assert.ok(DEFAULT_REQUEST_TIMEOUT_MS <= 20_000, '一次静默等待超过 20 秒就会被当成死机');
  assert.ok(DOWNLOAD_REQUEST_TIMEOUT_MS >= DEFAULT_REQUEST_TIMEOUT_MS, 'PDF 生成确实更慢，需要更宽的上限');
  assert.equal(createHttpClient('https://example.test').defaults.timeout, DEFAULT_REQUEST_TIMEOUT_MS);
});
