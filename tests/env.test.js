const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { loadEnv } = require('../dist/lib/env');

function withConfigFile(t, content) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usts-env-test-'));
  const file = path.join(root, '.env');
  fs.writeFileSync(file, content);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return file;
}

test('loadEnv injects ordinary keys but refuses trust-relaxing switches', (t) => {
  const file = withConfigFile(t, [
    '# 注释行',
    '',
    'USTS_USERNAME=20230001',
    'USTS_PASSWORD=secret',
    'USTS_ALLOW_CUSTOM_HOST=1',
    'USTS_ALLOW_INSECURE_HTTP=1',
  ].join('\n'));

  const env = {};
  const result = loadEnv({ env, filePath: file });

  assert.equal(result.loaded, true);
  assert.deepEqual(result.injected.sort(), ['USTS_PASSWORD', 'USTS_USERNAME']);
  assert.deepEqual(
    result.rejected.sort(),
    ['USTS_ALLOW_CUSTOM_HOST', 'USTS_ALLOW_INSECURE_HTTP'],
    '会放宽信任边界的开关必须被拒绝',
  );
  assert.equal(env.USTS_USERNAME, '20230001');
  assert.equal(env.USTS_ALLOW_CUSTOM_HOST, undefined, '被拒绝的键不得进入进程环境');
  assert.equal(env.USTS_ALLOW_INSECURE_HTTP, undefined);
});

test('loadEnv does not override values already present in the environment', (t) => {
  const file = withConfigFile(t, 'USTS_USERNAME=from-file\n');
  const env = { USTS_USERNAME: 'from-shell' };
  loadEnv({ env, filePath: file });
  assert.equal(env.USTS_USERNAME, 'from-shell', '真实环境变量优先，与 dotenv 行为一致');
});

test('loadEnv strips quotes and ignores malformed lines', (t) => {
  const file = withConfigFile(t, [
    "USTS_USERNAME='quoted'",
    'USTS_PASSWORD="also-quoted"',
    'NOPE',
    '=novalue',
  ].join('\n'));
  const env = {};
  loadEnv({ env, filePath: file });
  assert.equal(env.USTS_USERNAME, 'quoted');
  assert.equal(env.USTS_PASSWORD, 'also-quoted');
});

test('loadEnv reports a missing config file without throwing', () => {
  const result = loadEnv({ env: {}, filePath: path.join(os.tmpdir(), 'usts-does-not-exist', '.env') });
  assert.equal(result.loaded, false);
  assert.deepEqual(result.injected, []);
  assert.deepEqual(result.rejected, []);
});
