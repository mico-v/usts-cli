const test = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeTerminalText, redactSecret } = require('../dist/shared/sanitize');
const { exitCodeForError, AppError } = require('../dist/domain/errors');
const { resolveTerm, validateTerm, TERM_CODES } = require('../dist/domain/term');
const { printTable } = require('../dist/cli/format');
const { capture } = require('./capture');

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const RLO = String.fromCharCode(0x202e);
const ZWSP = String.fromCharCode(0x200b);

test('终端净化：ANSI / 双向覆盖 / 零宽 / C0-C1 控制符都被移除，正文保留', () => {
  const evil = `课程${ESC}[2J清屏${RLO}反转${ZWSP}零宽${BEL}响铃`;
  const clean = sanitizeTerminalText(evil);

  for (const [name, ch] of [['ESC', ESC], ['RLO', RLO], ['零宽', ZWSP], ['BEL', BEL]]) {
    assert.ok(!clean.includes(ch), `${name} 必须被移除`);
  }
  assert.match(clean, /课程/, '正文不能一起丢掉');
  assert.match(clean, /清屏/);
  assert.equal(sanitizeTerminalText(undefined), '', 'undefined 归一成空串');
  assert.equal(sanitizeTerminalText('多\t行\n文本'), '多\t行\n文本', '制表符与换行保留');
});

test('脱敏：Cookie 头的每一段、rememberMe、超长数字串都要盖住', () => {
  // 只脱第一段会漏掉 __jsluid_s —— 它同样是可用的会话凭据
  const header = 'Cookie: JSESSIONID=abc123def456; __jsluid_s=deadbeef99';
  const redacted = redactSecret(header);
  assert.ok(!redacted.includes('abc123def456'), 'JSESSIONID 的值必须被盖住');
  assert.ok(!redacted.includes('deadbeef99'), '__jsluid_s 也必须被盖住（原来只脱第一段时会漏）');
  assert.match(redacted, /__jsluid_s=\[REDACTED\]/);

  assert.match(redactSecret('rememberMe=QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo'), /rememberMe=\[REDACTED\]/);
  assert.match(redactSecret('password=hunter2'), /password=\[REDACTED\]/);
  assert.ok(!redactSecret('学号 20990000001 不该明文').includes('20990000001'), '学号必须脱敏');
  assert.ok(!redactSecret('token=QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo').includes('QUJDREVGR0hJSktMTU5PUFFSU1RVVldYWVo'), '裸 token 也要盖');
});

test('脱敏：不误伤日期与课程名（原来的 8-12 位数字规则会把它们抹掉）', () => {
  for (const keep of ['日期 2026-09-19', '课程 编译原理', '绩点 3.72']) {
    assert.equal(redactSecret(keep), keep, `${keep} 不该被改动`);
  }
});

test('退出码映射覆盖文档列出的每一个码', () => {
  const expected = {
    CONFIGURATION_ERROR: 2,
    AUTHENTICATION_REQUIRED: 3,
    SESSION_EXPIRED: 3,
    INVALID_CREDENTIALS: 3,
    CAPTCHA_REQUIRED: 3,
    RATE_LIMITED: 4,
    NETWORK_UNAVAILABLE: 4,
    REQUEST_TIMEOUT: 4,
    REMOTE_SERVER_ERROR: 4,
    PROTOCOL_CHANGED: 5,
    FILE_SYSTEM_ERROR: 6,
  };
  for (const [code, exitCode] of Object.entries(expected)) {
    assert.equal(exitCodeForError(new AppError(code, 'x')), exitCode, `${code} → ${exitCode}`);
  }
  // 非 AppError 只可能是内部 bug，归 UNKNOWN_ERROR 桶
  assert.equal(exitCodeForError(new Error('boom')), 1);
  assert.equal(exitCodeForError(new AppError('UNKNOWN_ERROR', 'x')), 1);
});

test('学期参数：非法学年/学期当场报参数错误，不静默变成「该学期没有数据」', () => {
  assert.throws(() => validateTerm({ xnm: 'abc', xqm: '3' }), (e) => e.code === 'CONFIGURATION_ERROR');
  assert.throws(() => validateTerm({ xnm: '25', xqm: '3' }), (e) => e.code === 'CONFIGURATION_ERROR');
  assert.throws(() => validateTerm({ xnm: '2025', xqm: '99' }), (e) => e.code === 'CONFIGURATION_ERROR');
  assert.throws(() => resolveTerm({ xnm: '2025', xqm: '1' }), (e) => e.code === 'CONFIGURATION_ERROR');

  // 合法取值（含「全部学期」的空串）必须放行
  for (const code of TERM_CODES) {
    assert.deepEqual(resolveTerm({ xnm: '2025', xqm: code }), { xnm: '2025', xqm: code });
  }
  assert.deepEqual(resolveTerm({ xnm: '2025' }), { xnm: '2025', xqm: '' }, '只给学年 = 全部学期');
  assert.equal(resolveTerm({}).xnm.length, 4, '什么都不给时按当前学期推算');
});

test('表格：表头同样过净化（远端 <th> 文本是唯一的注入通道）', () => {
  const output = capture(() => printTable(
    [`学年${ESC}[2J学期`, '级别'],
    [['2025-2026', '黄色预警']],
  ));

  assert.ok(!output.includes(ESC), '表头里的 ANSI 序列必须被移除');
  assert.match(output, /学年学期/, '正文保留');
  assert.match(output, /黄色预警/);
});
