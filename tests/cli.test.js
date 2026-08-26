const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('commands without a session use the authentication exit code', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usts-cli-test-'));
  try {
    const entry = path.resolve(__dirname, '../dist/index.js');
    const childEnv = { ...process.env, USTS_STATE_DIR: path.join(root, 'state'), NO_COLOR: '1' };
    delete childEnv.NODE_TEST_CONTEXT;
    const result = spawnSync(process.execPath, [entry, 'scores'], {
      cwd: root,
      env: childEnv,
      encoding: 'utf8',
    });
    if (result.error?.code === 'EPERM') {
      t.skip('当前沙箱禁止创建子进程；CI 环境会执行此测试');
      return;
    }
    assert.equal(result.status, 3);
    assert.match(result.stderr, /未找到会话/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
