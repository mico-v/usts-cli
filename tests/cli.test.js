const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { loginCommand } = require('../dist/commands/login');

const ENTRY = path.resolve(__dirname, '../dist/index.js');
const INHERITED_USTS_KEYS = Object.keys(process.env).filter((key) => key.startsWith('USTS_'));

/**
 * 在隔离的 cwd + 状态目录 + 配置目录里跑一次 CLI。
 * 开发机上真实的会话、配置与凭据都必须挡在外面，否则这些用例不确定。
 */
function runCli(t, root, { args = ['scores'], env = {} } = {}) {
  const childEnv = { ...process.env, NO_COLOR: '1' };
  for (const key of INHERITED_USTS_KEYS) delete childEnv[key];
  delete childEnv.NODE_TEST_CONTEXT;
  Object.assign(childEnv, {
    USTS_STATE_DIR: path.join(root, 'state'),
    USTS_CONFIG_DIR: path.join(root, 'config'),
  }, env);

  const result = spawnSync(process.execPath, [ENTRY, ...args], { cwd: root, env: childEnv, encoding: 'utf8' });
  if (result.error?.code === 'EPERM') {
    t.skip('当前沙箱禁止创建子进程；CI 环境会执行此测试');
    return null;
  }
  return result;
}

function writeConfig(root, content) {
  const dir = path.join(root, 'config');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, '.env'), content);
}

function tempRoot(t, prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('commands without a session use the authentication exit code', (t) => {
  const result = runCli(t, tempRoot(t, 'usts-cli-test-'));
  if (!result) return;
  assert.equal(result.status, 3);
  assert.match(result.stderr, /未找到会话/);
});

test('a legacy cwd/.session.json is never used as a login state', (t) => {
  const root = tempRoot(t, 'usts-cli-legacy-');
  // 旧格式：有 Cookie 但没有 origin，无法判断归属。
  // 放在"当前工作目录"，正是 ADR-0004 退役的那条读取路径。
  fs.writeFileSync(path.join(root, '.session.json'), JSON.stringify({
    cookies: [['JSESSIONID', 'planted-session-id'], ['rememberMe', 'planted']],
    username: '99999999',
    loginTime: '2026-01-01T00:00:00.000Z',
  }));

  const result = runCli(t, root);
  if (!result) return;
  assert.equal(result.status, 3, '不得凭 cwd 里的旧会话文件进入已登录状态');
  assert.match(result.stderr, /未找到会话/);
  assert.match(result.stderr, /不再读取/, '应当提示用户该文件已不再被读取');
  assert.doesNotMatch(result.stderr, /99999999/, '不得把文件里的 username 当作登录身份');
});

test('a .env in the current working directory is not read at all', (t) => {
  const root = tempRoot(t, 'usts-cli-cwdenv-');
  // 若这份文件被读取，baseUrl 会指向 evil.example，于是会在 URL 校验处失败（退出码 2）。
  // 实际不被读取，因此走到"没有会话"（退出码 3）——退出码本身就是判别器。
  fs.writeFileSync(path.join(root, '.env'), [
    'USTS_BASE_URL=https://evil.example/jwglxt',
    'USTS_ALLOW_CUSTOM_HOST=1',
    'USTS_USERNAME=20230001',
    'USTS_PASSWORD=secret',
  ].join('\n'));

  const result = runCli(t, root);
  if (!result) return;
  assert.equal(result.status, 3, 'cwd 的 .env 不得影响 baseUrl');
  assert.match(result.stderr, /未找到会话/);
  assert.match(result.stderr, /未读取/, '应当提示该文件不再被读取，以及配置文件的正确位置');
});

test('a trust-relaxing switch written in the config file is ignored', (t) => {
  const root = tempRoot(t, 'usts-cli-switch-');
  writeConfig(root, [
    'USTS_BASE_URL=https://evil.example/jwglxt',
    'USTS_ALLOW_CUSTOM_HOST=1',
    'USTS_ALLOW_INSECURE_HTTP=1',
  ].join('\n'));

  const result = runCli(t, root);
  if (!result) return;
  assert.equal(result.status, 2, '配置文件不得自行解除「只向受信主机发凭据」的限制');
  assert.match(result.stderr, /未信任主机/);
  assert.match(result.stderr, /已被忽略/, '应当明确告知这些开关被忽略');
});

test('the same switch exported in the real environment is honoured', (t) => {
  const root = tempRoot(t, 'usts-cli-switch-ok-');
  writeConfig(root, 'USTS_BASE_URL=http://127.0.0.1:9/jwglxt\n');

  const result = runCli(t, root, {
    env: { USTS_ALLOW_CUSTOM_HOST: '1', USTS_ALLOW_INSECURE_HTTP: '1' },
  });
  if (!result) return;
  // baseUrl 被接受 → 走到会话检查 → 本地无会话
  assert.equal(result.status, 3);
  assert.match(result.stderr, /未找到会话/);
  assert.doesNotMatch(result.stderr, /未信任主机/);
  assert.doesNotMatch(result.stderr, /已被忽略/);
});

test('USTS_ENV_FILE points the loader at an explicit file', (t) => {
  const root = tempRoot(t, 'usts-cli-envfile-');
  const custom = path.join(root, 'custom.env');
  fs.writeFileSync(custom, 'USTS_BASE_URL=https://evil.example/jwglxt\n');

  const result = runCli(t, root, { env: { USTS_ENV_FILE: custom } });
  if (!result) return;
  // 显式指定的文件确实被读取了 → baseUrl 生效 → 在 URL 校验处失败
  assert.equal(result.status, 2);
  assert.match(result.stderr, /未信任主机/);
});

test('usts logout 删除本地会话并幂等退出', (t) => {
  const root = tempRoot(t, 'usts-cli-logout-');
  const sessionFile = path.join(root, 'state', 'session.json');
  fs.mkdirSync(path.dirname(sessionFile), { recursive: true });
  fs.writeFileSync(sessionFile, JSON.stringify({
    schemaVersion: 1,
    origin: 'https://jwgl.usts.edu.cn',
    cookies: [['JSESSIONID', 'abc']],
    username: '20230001',
  }));

  const first = runCli(t, root, { args: ['logout'] });
  if (!first) return;
  assert.equal(first.status, 0, 'logout 不应该需要有效会话，也不该失败');
  assert.match(first.stdout, /已退出登录/);
  assert.equal(fs.existsSync(sessionFile), false, '会话文件必须被删除');

  const second = runCli(t, root, { args: ['logout'] });
  assert.equal(second.status, 0, 'logout 必须幂等');
  assert.match(second.stdout, /本地没有保存的会话/);

  // 登出之后，查询命令应当回到「未找到会话」
  const query = runCli(t, root);
  assert.equal(query.status, 3);
  assert.match(query.stderr, /未找到会话/);
});

test('交互式菜单在没有终端时给出用法提示，而不是抛 readline 堆栈', (t) => {
  const result = runCli(t, tempRoot(t, 'usts-cli-tty-'), { args: [] });
  if (!result) return;
  assert.equal(result.status, 2, '属于用法错误，不是内部异常');
  assert.match(result.stderr, /需要交互式终端/);
  assert.match(result.stderr, /usts --help/, '要告诉用户该看哪里');
  assert.doesNotMatch(result.stderr, /ERR_USE_AFTER_CLOSE|readline/, '不得泄漏内部堆栈');
  assert.doesNotMatch(result.stdout, /请选择操作/, '不该先渲染菜单再失败');
});

test('usts login 无凭据且没有终端时给出用法提示', (t) => {
  const result = runCli(t, tempRoot(t, 'usts-cli-login-tty-'), { args: ['login'] });
  if (!result) return;
  assert.equal(result.status, 2);
  assert.match(result.stderr, /需要交互式终端/);
  assert.match(result.stderr, /USTS_USERNAME/, '要给出非交互的替代方案');
  assert.doesNotMatch(result.stderr, /ERR_USE_AFTER_CLOSE|readline/);
  assert.doesNotMatch(result.stdout, /请输入学号/, '不该先往 stdout 吐半截提示符');
});

test('usts clsched 无 --bh 且没有终端时提示改用参数', (t) => {
  const result = runCli(t, tempRoot(t, 'usts-cli-clsched-tty-'), { args: ['clsched'] });
  if (!result) return;
  // 参数检查先于会话检查：这种调用在当前环境本来就无法完成
  assert.equal(result.status, 2);
  assert.match(result.stderr, /需要交互式终端/);
  assert.match(result.stderr, /--jg\/--zy\/--bh/);
  assert.doesNotMatch(result.stderr, /ERR_USE_AFTER_CLOSE|readline/);
});

test('login 失败时错误走 stderr，进度提示才走 stdout', async () => {
  // 进程内测（不用子进程）：断言的是输出通道，起服务端会与 spawnSync 死锁。
  const saved = {
    log: console.log,
    error: console.error,
    exitCode: process.exitCode,
    username: process.env.USTS_USERNAME,
    password: process.env.USTS_PASSWORD,
    cookies: process.env.USTS_COOKIES,
  };
  const out = [];
  const err = [];
  console.log = (value) => out.push(String(value));
  console.error = (value) => err.push(String(value));
  process.env.USTS_USERNAME = '20230001';
  process.env.USTS_PASSWORD = 'placeholder';
  delete process.env.USTS_COOKIES;

  try {
    const ok = await loginCommand({
      restoreSession: () => false,
      ensureValidSession: async () => 'missing',
      lastRecovery: () => undefined,
      localSession: () => ({ loggedIn: false }),
      setCookies: () => {},
      clearCookies: () => {},
      markAuthenticated: () => {},
      saveSession: () => {},
      logout: () => false,
      queryProfile: async () => { throw new Error('本用例不该走到 Cookie 分支'); },
      loginViaScript: async () => ({
        success: false,
        errorCode: 'PROTOCOL_CHANGED',
        message: '登录页缺少 csrftoken，接口可能已变更',
      }),
    });

    assert.equal(ok, false);
    assert.equal(process.exitCode, 5, 'PROTOCOL_CHANGED → 退出码 5');
    assert.match(err.join('\n'), /缺少 csrftoken/);
    assert.doesNotMatch(out.join('\n'), /缺少 csrftoken/, '错误不得写进 stdout');
    assert.match(out.join('\n'), /正在通过账号密码登录/, '进度提示仍是命令的正常输出');
  } finally {
    console.log = saved.log;
    console.error = saved.error;
    process.exitCode = saved.exitCode;
    for (const [key, value] of [['USTS_USERNAME', saved.username], ['USTS_PASSWORD', saved.password], ['USTS_COOKIES', saved.cookies]]) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('usts help 提供详细文档：主题、中文别名与命令帮助', (t) => {
  const root = tempRoot(t, 'usts-cli-help-');

  // 不带主题 = 主帮助；必须列出可用主题，而不只是 commands 表
  const overview = runCli(t, root, { args: ['help'] });
  if (!overview) return;
  assert.equal(overview.status, 0);
  assert.match(overview.stdout, /usts help config/);

  const config = runCli(t, root, { args: ['help', 'config'] });
  assert.equal(config.status, 0);
  assert.match(config.stdout, /USTS_USERNAME/, '主题文档要给出可配置项');
  assert.doesNotMatch(config.stdout, /Usage: usts/, '主题文档不是命令帮助');

  const alias = runCli(t, root, { args: ['help', '配置'] });
  assert.equal(alias.status, 0);
  assert.match(alias.stdout, /USTS_USERNAME/, '中文别名要能到达同一个主题');

  const command = runCli(t, root, { args: ['help', 'scores'] });
  assert.equal(command.status, 0);
  assert.match(command.stdout, /Usage: usts scores/, '主题也可以是命令名');

  const unknown = runCli(t, root, { args: ['help', '不存在的主题'] });
  assert.equal(unknown.status, 2, '未知主题属于用法错误');
  assert.match(unknown.stderr, /没有这个帮助主题/);
  assert.doesNotMatch(unknown.stdout, /Usage: usts \[options\]/, '未知主题不该退回主帮助');
});

test('每个命令的 --help 都带有详细说明', (t) => {
  const root = tempRoot(t, 'usts-cli-help-commands-');
  const commands = [
    'login', 'logout', 'scores', 'exams', 'courses', 'schedule', 'clsched', 'profile',
    'gpa', 'notifications', 'academia', 'selected-courses', 'schedule-pdf', 'academia-pdf',
  ];

  for (const name of commands) {
    const result = runCli(t, root, { args: [name, '--help'] });
    if (!result) return;
    assert.equal(result.status, 0, `${name} --help 应当成功`);
    assert.match(result.stdout, /示例:|说明:/, `${name} --help 应当带回详细说明（检查 COMMAND_HELP 是否漏了这一项）`);
    assert.doesNotMatch(result.stdout, /undefined/, `${name} --help 不得漏出内部值`);
  }
});
