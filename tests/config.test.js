const test = require('node:test');
const assert = require('node:assert/strict');

const { assertSameOriginUrl, normalizeBaseUrl } = require('../dist/config/config');

test('base URL policy trusts the official HTTPS host by default', () => {
  const policy = { allowCustomHost: false, allowInsecureHttp: false };
  assert.equal(normalizeBaseUrl('https://jwgl.usts.edu.cn/jwglxt/', policy), 'https://jwgl.usts.edu.cn/jwglxt');
  assert.throws(() => normalizeBaseUrl('https://example.com/jwglxt', policy), /未信任主机/);
  assert.throws(() => normalizeBaseUrl('http://jwgl.usts.edu.cn/jwglxt', policy), /必须使用 HTTPS/);
});

test('development overrides must be explicit', () => {
  assert.equal(
    normalizeBaseUrl('http://127.0.0.1:8080/jwglxt', { allowCustomHost: true, allowInsecureHttp: true }),
    'http://127.0.0.1:8080/jwglxt',
  );
});

test('download URLs are constrained to the configured origin', () => {
  const base = 'https://jwgl.usts.edu.cn/jwglxt';
  assert.equal(
    assertSameOriginUrl('/jwglxt/files/a.pdf', base),
    'https://jwgl.usts.edu.cn/jwglxt/files/a.pdf',
  );
  assert.throws(() => assertSameOriginUrl('https://evil.example/a.pdf', base), /跨源下载地址/);
});
