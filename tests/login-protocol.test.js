const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

const { loginViaScript } = require('../dist/infrastructure/jwgl/auth');
const { AuthenticatedTransport } = require('../dist/infrastructure/http/authenticated-transport');

/**
 * 登录协议本身（`loginViaScript`）的测试。
 *
 * 这段逻辑此前**零覆盖**，而它恰恰是最不能出错的一处：它决定了往 `yzcskz=3` 验证码锁定
 * 推进几步。`tests/jwgl-integration.test.js` 的假服务器第一次登录 POST 就成功，所以
 * 「WAF 重置首次 POST → 原样重试一次」与「确定性失败绝不重试」这两个分支从未被执行过。
 *
 * 三条实测规律（见 CLAUDE.md）在这里逐条锁住：
 *   1. 首次 POST 被 WAF 重置（302 回登录页、无 index_initMenu）→ 同 cookie jar 重试一次；
 *   2. 响应里已含凭据错误/验证码 → **不重试**（重试只会让失败计数翻倍）；
 *   3. 验证码出现在登录页（`input#yzm`）→ 直接报 CAPTCHA_REQUIRED，不发登录 POST。
 */
const BASE_PATH = '/jwglxt';
const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
const jwk = publicKey.export({ format: 'jwk' });
const b64 = (v) => Buffer.from(v, 'base64url').toString('base64');

/**
 * 假正方登录服务器。
 * `postBehavior` 决定每次登录 POST 的响应；按顺序取，用完后重复最后一项。
 */
function createServer({ postBehavior, loginPageHtml }) {
  const state = { loginPosts: 0, getPage: 0, publicKey: 0 };
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body, headers = {}) => { res.writeHead(status, { 'Content-Type': 'text/plain', ...headers }); res.end(body); };
    const p = url.pathname;

    if (p === `${BASE_PATH}/xtgl/login_slogin.html` && req.method === 'GET') {
      state.getPage += 1;
      return send(200, loginPageHtml ?? '<html><input id="csrftoken" value="tok-1"></html>', { 'Content-Type': 'text/html' });
    }
    if (p === `${BASE_PATH}/xtgl/login_getPublicKey.html`) {
      state.publicKey += 1;
      return send(200, JSON.stringify({ modulus: b64(jwk.n), exponent: b64(jwk.e) }), { 'Content-Type': 'application/json' });
    }
    if (p === `${BASE_PATH}/xtgl/login_slogin.html` && req.method === 'POST') {
      state.loginPosts += 1;
      const behavior = postBehavior[Math.min(state.loginPosts - 1, postBehavior.length - 1)];
      return behavior(send);
    }
    send(404, 'not found');
  });
  return { state, server };
}

async function withServer(options, fn) {
  const { state, server } = createServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const saved = { ...process.env };
  const TOUCHED = ['USTS_ALLOW_CUSTOM_HOST', 'USTS_ALLOW_INSECURE_HTTP'];
  Object.assign(process.env, { USTS_ALLOW_CUSTOM_HOST: '1', USTS_ALLOW_INSECURE_HTTP: '1' });
  try {
    const transport = new AuthenticatedTransport(`http://127.0.0.1:${port}${BASE_PATH}`);
    return await fn(transport, state);
  } finally {
    for (const key of TOUCHED) { if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key]; }
    server.close();
  }
}

const OK = (send) => send(302, '', {
  Location: `${BASE_PATH}/xtgl/index_initMenu.html`,
  'Set-Cookie': `JSESSIONID=live-sid; Path=${BASE_PATH}`,
});
const RESET_BY_WAF = (send) => send(302, '', {
  Location: `${BASE_PATH}/xtgl/login_slogin.html`,
  'Set-Cookie': `JSESSIONID=rotated; Path=${BASE_PATH}`,
});
const BAD_CREDENTIALS = (send) => send(200, '<html>用户名或密码不正确</html>', { 'Content-Type': 'text/html' });
const NEEDS_CAPTCHA = (send) => send(200, '<html>请输入验证码</html>', { 'Content-Type': 'text/html' });

test('登录：首次 POST 被 WAF 重置时，原样重试一次并成功', async () => {
  await withServer({ postBehavior: [RESET_BY_WAF, OK] }, async (transport, state) => {
    const result = await loginViaScript(transport, '20230001', 'secret');

    assert.equal(result.success, true, `应当重试后成功，实际：${JSON.stringify(result)}`);
    assert.equal(state.loginPosts, 2, '必须恰好两次 POST：被重置一次 + 重试一次');
    // 重试要复用同一个 csrftoken/加密后的密码：重新取公钥会换掉会话绑定
    assert.equal(state.publicKey, 1, '公钥只取一次，两次 POST 复用同一份加密结果');
    assert.equal(state.getPage, 1, '登录页只取一次');
  });
});

test('登录：凭据错误是确定性失败，绝不重试（重试会把失败计数翻倍推向验证码锁定）', async () => {
  await withServer({ postBehavior: [BAD_CREDENTIALS] }, async (transport, state) => {
    const result = await loginViaScript(transport, '20230001', 'wrong');

    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'INVALID_CREDENTIALS');
    assert.equal(state.loginPosts, 1, '确定性失败只能有一次 POST');
  });
});

test('登录：响应提示需要验证码时不重试，报 CAPTCHA_REQUIRED', async () => {
  await withServer({ postBehavior: [NEEDS_CAPTCHA] }, async (transport, state) => {
    const result = await loginViaScript(transport, '20230001', 'secret');

    assert.equal(result.success, false);
    assert.equal(result.errorCode, 'CAPTCHA_REQUIRED');
    assert.equal(state.loginPosts, 1, '验证码是确定性失败，重试只会加重锁定');
  });
});

test('登录：登录页上已有验证码输入框时，连登录 POST 都不该发', async () => {
  await withServer(
    { postBehavior: [OK], loginPageHtml: '<html><input id="yzm" name="yzm"><input id="csrftoken" value="t"></html>' },
    async (transport, state) => {
      const result = await loginViaScript(transport, '20230001', 'secret');

      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'CAPTCHA_REQUIRED');
      assert.equal(state.loginPosts, 0, '检测到验证码就不要再提交凭据（避免继续累加失败次数）');
    },
  );
});

test('登录：两次都被重置时如实报错，不无限重试', async () => {
  await withServer({ postBehavior: [RESET_BY_WAF, RESET_BY_WAF] }, async (transport, state) => {
    const result = await loginViaScript(transport, '20230001', 'secret');

    assert.equal(result.success, false);
    assert.equal(state.loginPosts, 2, '最多两次 POST，绝不继续试');
    assert.equal(result.errorCode, 'REMOTE_SERVER_ERROR');
  });
});

test('登录：登录页缺 csrftoken 时报协议变化，不发登录 POST', async () => {
  await withServer(
    { postBehavior: [OK], loginPageHtml: '<html><body>页面改版了</body></html>' },
    async (transport, state) => {
      const result = await loginViaScript(transport, '20230001', 'secret');

      assert.equal(result.success, false);
      assert.equal(result.errorCode, 'PROTOCOL_CHANGED');
      assert.equal(state.loginPosts, 0);
    },
  );
});

test('登录：公钥接口返回的内容不对时如实报错，不猜测凭据', async () => {
  // 用「返回了 200 但不是公钥」而不是「连接失败」：后者会触发连接层重试（3s 起指数退避），
  // 一条用例要跑十几秒；这里要断言的不变量是一样的——拿不到可用公钥就不能往下走。
  const { server } = createServer({ postBehavior: [OK] });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const saved = { ...process.env };
  Object.assign(process.env, { USTS_ALLOW_CUSTOM_HOST: '1', USTS_ALLOW_INSECURE_HTTP: '1' });
  try {
    const transport = new AuthenticatedTransport(`http://127.0.0.1:${port}${BASE_PATH}`);
    transport.http.get = async (url) => (String(url).includes('login_getPublicKey')
      ? { status: 200, data: {}, headers: {} } // 没有 modulus/exponent
      : { status: 200, data: '<html><input id="csrftoken" value="t"></html>', headers: {} });

    const result = await loginViaScript(transport, '20230001', 'secret');

    assert.equal(result.success, false, '拿不到公钥不能报成功');
    assert.equal(result.errorCode, 'PROTOCOL_CHANGED');
  } finally {
    for (const key of ['USTS_ALLOW_CUSTOM_HOST', 'USTS_ALLOW_INSECURE_HTTP']) {
      if (saved[key] === undefined) delete process.env[key]; else process.env[key] = saved[key];
    }
    server.close();
  }
});
