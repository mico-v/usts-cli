const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { JwglGateway } = require('../dist/infrastructure/jwgl/gateway');

const BASE_PATH = '/jwglxt';

function parseCookies(raw) {
  const out = {};
  for (const part of String(raw || '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) out[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return out;
}

/**
 * 假正方服务器：只实现本用例需要的最小契约。
 * 会话是否有效由服务端侧的 session 集合决定——正是这个集合在模拟「服务端会话过期」。
 *
 * `staleResponse` 对应两种真实的失效表现：
 *   - 'redirect'：视图页重定向到登录页（302）
 *   - 'unauthorized'：数据 Action 返回 HTTP 901 + 空 body（2026-09 实测的生产行为）
 *
 * `pdfRedirect` 用于覆盖下载链的跳转与内容校验：
 *   - 'none'：直接返回 PDF
 *   - 'same-origin'：302 到同源文件路径（应当被跟随）
 *   - 'cross-origin'：302 到外部主机（必须拒绝，绝不能把会话 Cookie 带过去）
 *   - 'html'：200 但返回 HTML（内容校验应当报协议错误）
 */
function createFakeJwgl({ staleResponse = 'redirect', pdfRedirect = 'none' } = {}) {
  const state = { loginPosts: 0, scoresPosts: 0, pdfFollowedHops: 0, sessions: new Set() };
  // 下一次成绩请求的「人为拒绝」，用于构造「被拒但原因不明」的场景
  state.nextRejection = null;
  const PDF_BYTES = Buffer.from('%PDF-1.4\n%fake schedule\n%%EOF\n');
  const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 1024 });
  const jwk = publicKey.export({ format: 'jwk' });
  const toBase64 = (value) => Buffer.from(value, 'base64url').toString('base64');

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (status, body, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/plain', ...headers });
      res.end(body);
    };
    const expire = () => (staleResponse === 'unauthorized'
      ? send(901, '')
      : send(302, '', { Location: `${BASE_PATH}/xtgl/login_slogin.html` }));

    if (url.pathname === `${BASE_PATH}/xtgl/login_slogin.html` && req.method === 'GET') {
      return send(200, '<html><body><input id="csrftoken" value="tok-1"></body></html>', { 'Content-Type': 'text/html' });
    }
    if (url.pathname === `${BASE_PATH}/xtgl/login_getPublicKey.html`) {
      return send(200, JSON.stringify({ modulus: toBase64(jwk.n), exponent: toBase64(jwk.e) }), { 'Content-Type': 'application/json' });
    }
    if (url.pathname === `${BASE_PATH}/xtgl/login_slogin.html` && req.method === 'POST') {
      state.loginPosts += 1;
      const sid = `sid-${state.loginPosts}`;
      state.sessions.add(sid);
      return send(302, '', {
        Location: `${BASE_PATH}/xtgl/index_initMenu.html`,
        'Set-Cookie': `JSESSIONID=${sid}; Path=${BASE_PATH}`,
      });
    }
    if (url.pathname === `${BASE_PATH}/cjcx/cjcx_cxXsgrcj.html`) {
      state.scoresPosts += 1;
      if (state.nextRejection) {
        const rejection = state.nextRejection;
        state.nextRejection = null;
        return send(200, rejection, { 'Content-Type': rejection.startsWith('{') ? 'application/json' : 'text/html' });
      }
      const sid = parseCookies(req.headers.cookie).JSESSIONID;
      if (!sid || !state.sessions.has(sid)) return expire();
      return send(200, JSON.stringify({
        items: [{ kcmc: '编译原理', kch: 'CS01', xf: '3', cj: '92', jd: '4.0' }],
        totalCount: 1,
      }), { 'Content-Type': 'application/json' });
    }
    // ---- 课表 PDF 下载链（policy 预检 + 文件生成）----
    if (url.pathname === `${BASE_PATH}/kbdy/bjkbdy_cxXnxqsfkz.html`) {
      return send(200, '{}', { 'Content-Type': 'application/json' });
    }
    if (url.pathname === `${BASE_PATH}/kbcx/xskbcx_cxXsShcPdf.html`) {
      if (pdfRedirect === 'same-origin') return send(302, '', { Location: `${BASE_PATH}/files/schedule.pdf` });
      if (pdfRedirect === 'cross-origin') return send(302, '', { Location: 'https://evil.example/schedule.pdf' });
      if (pdfRedirect === 'html') return send(200, '<html><body>错误提示</body></html>', { 'Content-Type': 'text/html' });
      return send(200, PDF_BYTES, { 'Content-Type': 'application/pdf' });
    }
    if (url.pathname === `${BASE_PATH}/files/schedule.pdf`) {
      state.pdfFollowedHops += 1;
      return send(200, PDF_BYTES, { 'Content-Type': 'application/pdf' });
    }
    send(404, 'not found');
  });

  return { state, server, jwk };
}

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function withEnv(overrides) {
  const saved = new Map();
  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, process.env[key]);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  return () => {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
}

/** 搭建一台假服务器 + 一个已写入「过期会话」的客户端。 */
async function setup(t, { trustMs = '0', credentials = true, staleResponse = 'redirect', pdfRedirect = 'none' } = {}) {
  const { state, server } = createFakeJwgl({ staleResponse, pdfRedirect });
  const port = await listen(server);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usts-recovery-'));
  const stateDir = path.join(root, 'state');
  const baseUrl = `http://127.0.0.1:${port}${BASE_PATH}`;

  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(path.join(stateDir, 'session.json'), JSON.stringify({
    schemaVersion: 1,
    origin: `http://127.0.0.1:${port}`,
    cookies: [{ name: 'JSESSIONID', value: 'stale', domain: '127.0.0.1', path: BASE_PATH, hostOnly: true, secure: false }],
    username: '20230001',
    // 很久以前登录：不在信任窗口内，必须真的去探测
    loginTime: new Date(0).toISOString(),
  }));

  const restoreEnv = withEnv({
    USTS_ALLOW_CUSTOM_HOST: '1',
    USTS_ALLOW_INSECURE_HTTP: '1',
    USTS_STATE_DIR: stateDir,
    USTS_SESSION_TRUST_MS: trustMs,
    USTS_USERNAME: credentials ? '20230001' : undefined,
    USTS_PASSWORD: credentials ? 'secret' : undefined,
  });

  t.after(() => {
    restoreEnv();
    server.close();
    fs.rmSync(root, { recursive: true, force: true });
  });

  return { client: new JwglGateway(baseUrl), state, baseUrl, stateDir };
}

test('会话失效时自动重新登录并重放原查询', async (t) => {
  const { client, state } = await setup(t);

  const items = await client.queryScores('2026', '3');

  assert.equal(items.length, 1);
  assert.equal(items[0].courseName, '编译原理');
  assert.equal(state.loginPosts, 1, '应当恰好自动登录一次');
  // 第一次被 302 打回（模拟会话过期），重登后重放一次
  assert.equal(state.scoresPosts, 2, '原查询应当被重放且只重放一次');
});

test('数据接口返回 HTTP 901 时同样识别为会话失效并自动重登', async (t) => {
  // 这是 2026-09 实测的生产行为：数据 Action 未认证返回 901 + 空 body
  const { client, state } = await setup(t, { staleResponse: 'unauthorized' });

  const items = await client.queryScores('2026', '3');

  assert.equal(items.length, 1);
  assert.equal(state.loginPosts, 1);
  assert.equal(state.scoresPosts, 2);
});

test('进入命令前主动探测到 901，也会先重登再查询（多花一次探针，不白跑业务请求）', async (t) => {
  const { client, state } = await setup(t, { staleResponse: 'unauthorized' });

  assert.equal(await client.ensureValidSession(), 'valid');
  assert.equal(state.loginPosts, 1);

  const items = await client.queryScores('2026', '3');
  assert.equal(items.length, 1);
  assert.equal(state.loginPosts, 1, '探测阶段已经重登过，业务请求不必再登一次');
});

test('自动重登后新会话被持久化，后续运行无需再次登录', async (t) => {
  const { client, state, baseUrl, stateDir } = await setup(t);
  await client.queryScores('2026', '3');

  const saved = JSON.parse(fs.readFileSync(path.join(stateDir, 'session.json'), 'utf8'));
  assert.equal(saved.cookies[0].value, 'sid-1', '持久化的必须是重登后拿到的新会话');

  const reused = new JwglGateway(baseUrl);
  assert.equal(reused.restoreSession(), true);
  const items = await reused.queryScores('2026', '3');
  assert.equal(items.length, 1);
  assert.equal(state.loginPosts, 1, '复用已持久化的会话时不该再登录');
});

test('没有可用凭据时不重登，把会话失效原样报给用户', async (t) => {
  const { client, state } = await setup(t, { credentials: false });

  await assert.rejects(
    () => client.queryScores('2026', '3'),
    (error) => error.code === 'SESSION_EXPIRED',
  );
  assert.equal(state.loginPosts, 0, '无凭据时不得发起登录');
  assert.equal(client.lastRecovery().reason, 'credentials');
});

test('主动校验：探测到失效即自动重登', async (t) => {
  const { client, state } = await setup(t);

  assert.equal(await client.ensureValidSession(), 'valid');
  assert.equal(state.loginPosts, 1);
});

test('预检成功后命令入口不再校验：一次查询最多一次探针请求', async (t) => {
  // 默认量级的信任窗口：预检成功会开启窗口，命令入口随后的校验因此走快路径
  const { client, state } = await setup(t, { trustMs: '300000' });

  // 界面在用户选中「查询」时立刻发起（与菜单、表单提示并行）
  assert.equal(await client.ensureValidSession(), 'valid');
  const probes = state.scoresPosts;
  const logins = state.loginPosts;

  // 用户填完表单 → 命令入口再次校验：必须命中信任窗口，只多出业务请求本身
  const items = await client.queryScores('2026', '3');
  assert.equal(items.length, 1);
  assert.equal(state.scoresPosts, probes + 1, '命令不应因为预检而多出一次探针');
  assert.equal(state.loginPosts, logins, '不应重复登录');
});

test('信任窗口内的会话不做主动探测', async (t) => {
  const { client, state } = await setup(t, { trustMs: '300000' });
  client.markAuthenticated('20230001');

  assert.equal(await client.ensureValidSession(), 'valid');
  assert.equal(state.scoresPosts, 0, '信任窗口内不应发送探针请求');
  assert.equal(state.loginPosts, 0);
});

test('本地没有可用会话时报告 missing，不误报为失效', async (t) => {
  await setup(t);
  // 会话文件绑定 Origin：换了 Base URL 就不再可用，也不该被当成「会话失效」
  const other = new JwglGateway('http://127.0.0.1:1/jwglxt');
  assert.equal(await other.ensureValidSession(), 'missing');
  assert.equal(other.lastRecovery(), undefined, 'missing 不应触发任何重登尝试');
});

test('logout 删除持久化会话，内存 Cookie 也一并清空', async (t) => {
  const { client, stateDir } = await setup(t);
  await client.queryScores('2026', '3'); // 触发自动重登并持久化
  const file = path.join(stateDir, 'session.json');
  assert.equal(fs.existsSync(file), true);
  assert.equal(client.localSession().loggedIn, true);

  assert.equal(client.logout(), true, '应当报告删掉了文件');
  assert.equal(fs.existsSync(file), false);
  assert.equal(client.localSession().loggedIn, false);
  // 只有内存 Cookie 也被清空，这里才会是 missing（否则 restoreSession 会命中 Cookie）
  assert.equal(await client.ensureValidSession(), 'missing');
  assert.equal(client.lastRecovery(), undefined, '登出会连记忆的重登结果一起清掉');
});

test('logout 是幂等的，且不做任何网络请求', async (t) => {
  const { client, state, stateDir } = await setup(t);
  const postsBefore = state.scoresPosts + state.loginPosts;

  assert.equal(client.logout(), true); // 先删掉 setup 写入的那份
  assert.equal(client.logout(), false, '第二次没有文件可删，同样视为成功');
  assert.equal(fs.existsSync(path.join(stateDir, 'session.json')), false);

  assert.equal(state.scoresPosts + state.loginPosts, postsBefore, 'logout 必须是纯本地操作');
});

test('本地会话概要只反映本地状态，不发请求', async (t) => {
  const { client, state } = await setup(t);
  const before = state.scoresPosts + state.loginPosts;
  // setup 写入的会话带 origin 且用户名已知，但服务端并不认它
  assert.deepEqual(
    { loggedIn: client.localSession().loggedIn, username: client.localSession().username },
    { loggedIn: true, username: '20230001' },
  );
  assert.equal(state.scoresPosts + state.loginPosts, before, 'localSession 不得触发任何请求');
});

test('响应被拒但会话其实有效时，探测确认后如实报协议错误，不白白重登', async (t) => {
  const { client, state } = await setup(t);
  // 先登录拿到有效会话
  await client.queryScores('2026', '3');
  const loginsBefore = state.loginPosts;
  const recoveryBefore = client.lastRecovery();

  // 模拟一次「被拒但原因不明」：200 + {"status":910}，既不是 302 也不是可解析的列表
  state.nextRejection = '{"status":910}';
  await assert.rejects(
    () => client.queryScores('2026', '3'),
    (error) => error.code === 'PROTOCOL_CHANGED',
  );
  assert.equal(state.loginPosts, loginsBefore, '探测确认会话仍有效时不得触发重登');
  assert.deepEqual(client.lastRecovery(), recoveryBefore, '不应新增任何重登尝试');
});

test('错误提示页同样先探测确认，再决定是否重登', async (t) => {
  const { client, state } = await setup(t);
  await client.queryScores('2026', '3');
  const loginsBefore = state.loginPosts;

  state.nextRejection = '<html><body>错误提示</body></html>';
  await assert.rejects(
    () => client.queryScores('2026', '3'),
    (error) => error.code === 'PROTOCOL_CHANGED',
  );
  assert.equal(state.loginPosts, loginsBefore);
});

// ===== PDF 下载链：多步 POST + 同源跳转 + 内容校验（此前零覆盖）=====

test('课表 PDF：正常下载返回 %PDF- 内容', async (t) => {
  const { client } = await setup(t);

  const bytes = await client.downloadSchedulePdf('2026', '3');

  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('课表 PDF：同源重定向被跟随', async (t) => {
  const { client, state } = await setup(t, { pdfRedirect: 'same-origin' });

  const bytes = await client.downloadSchedulePdf('2026', '3');

  assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-');
  assert.equal(state.pdfFollowedHops, 1, '应当跟随一次同源跳转后拿到文件');
});

test('课表 PDF：跨源重定向被拒绝，且不去请求那个外部主机', async (t) => {
  const { client } = await setup(t, { pdfRedirect: 'cross-origin' });

  // 关键判别：若我们真的去请求 evil.example，错误会是 NETWORK_UNAVAILABLE（域名不存在）；
  // 收到 PROTOCOL_CHANGED 说明在发出请求之前就按同源策略拦下了。
  await assert.rejects(
    () => client.downloadSchedulePdf('2026', '3'),
    (error) => error.code === 'PROTOCOL_CHANGED',
  );
});

test('课表 PDF：返回 HTML 而不是 PDF 时报协议错误，而不是当成文件写出去', async (t) => {
  const { client } = await setup(t, { pdfRedirect: 'html' });

  await assert.rejects(
    () => client.downloadSchedulePdf('2026', '3'),
    (error) => error.code === 'PROTOCOL_CHANGED',
  );
});
