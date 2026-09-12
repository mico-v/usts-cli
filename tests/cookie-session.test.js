const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { CookieJar } = require('../dist/infrastructure/http/cookie-jar');
const { FileSessionStore } = require('../dist/infrastructure/session/file-session-store');

test('cookie jar applies secure, domain, path and expiry rules', () => {
  const jar = new CookieJar('https://jwgl.usts.edu.cn/jwglxt/');
  jar.setCookie('JSESSIONID=abc; Path=/jwglxt; Secure; HttpOnly');
  jar.setCookie('expired=x; Path=/; Max-Age=0');
  jar.setCookie('poison=bad; Domain=evil.example; Path=/');
  assert.equal(jar.header('https://jwgl.usts.edu.cn/jwglxt/cjcx/a'), 'JSESSIONID=abc');
  assert.equal(jar.header('http://jwgl.usts.edu.cn/jwglxt/cjcx/a'), '');
  assert.equal(jar.header('https://jwgl.usts.edu.cn/other'), '');
  assert.doesNotMatch(jar.header(), /poison/);
});

test('cookie jar restores legacy name/value tuples', () => {
  const jar = new CookieJar('https://jwgl.usts.edu.cn/jwglxt/');
  jar.restore([['JSESSIONID', 'legacy']]);
  assert.equal(jar.header(), 'JSESSIONID=legacy');
});

test('expiring a cookie removes same-name variants left on other paths', () => {
  const jar = new CookieJar('https://jwgl.usts.edu.cn/jwglxt/');
  jar.setCookie('JSESSIONID=old; Path=/; Secure');
  jar.setCookie('JSESSIONID=new; Path=/jwglxt; Secure');
  assert.match(jar.header('https://jwgl.usts.edu.cn/jwglxt/cjcx/a'), /JSESSIONID=new/);

  // 服务端明确要求删除：同名不同 path 的残留也必须一并清掉，
  // 否则会把两个 JSESSIONID 一起发给服务端。
  jar.setCookie('JSESSIONID=; Path=/jwglxt; Max-Age=0');
  assert.equal(jar.header('https://jwgl.usts.edu.cn/jwglxt/cjcx/a'), '');
  assert.equal(jar.size, 0);
});

test('session store writes private files atomically', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usts-session-test-'));
  const file = path.join(root, 'state', 'session.json');
  try {
    const store = new FileSessionStore(file);
    store.save({
      schemaVersion: 1,
      origin: 'https://jwgl.usts.edu.cn',
      cookies: [['JSESSIONID', 'abc']],
      username: 'student',
    });
    const loaded = store.load();
    assert.equal(loaded.username, 'student');
    if (process.platform !== 'win32') {
      assert.equal(fs.statSync(file).mode & 0o777, 0o600);
      assert.equal(fs.statSync(path.dirname(file)).mode & 0o777, 0o700);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('session store rejects unsupported future schemas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usts-session-schema-'));
  const file = path.join(root, 'session.json');
  try {
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 99, origin: 'https://jwgl.usts.edu.cn', cookies: [] }));
    assert.equal(new FileSessionStore(file).load(), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('session store refuses a session with no origin binding', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'usts-session-origin-'));
  const file = path.join(root, 'session.json');
  try {
    // 旧版 cwd/.session.json 就是这种形态：有 Cookie，但没有 origin。
    // 无法判断归属的会话不能复用（ADR-0004），读取层直接拒绝。
    fs.writeFileSync(file, JSON.stringify({
      cookies: [['JSESSIONID', 'abc']],
      username: 'student',
      loginTime: '2026-08-21T09:31:51.144Z',
    }));
    assert.equal(new FileSessionStore(file).load(), null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
