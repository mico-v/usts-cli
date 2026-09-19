const test = require('node:test');
const assert = require('node:assert/strict');

const { renderWarning } = require('../dist/cli/render/warnings');
const { renderPayments } = require('../dist/cli/render/payments');
const { warningCommand } = require('../dist/cli/warning');
const { paymentCommand } = require('../dist/cli/payment');
const { capture } = require('./capture');

/**
 * 默认（非 `--json`）输出路径。
 *
 * 这两个命令此前只有 `--json` 信封被测过——而默认路径才是人真正看到的东西，
 * 也是「无预警」「无缴费记录」这类**容易误导的空结论**唯一的出口。
 */
const TERM = { xnm: '2026', xqm: '3' };

test('学业预警渲染：无预警时原样打印页面结论，不画空表', () => {
  const output = capture(() => renderWarning({
    hasWarning: false,
    messages: ['张同学您好：', '当前学年学期暂无预警！'],
    headers: [],
    rows: [],
  }));

  assert.match(output, /学业预警/);
  assert.match(output, /当前学年学期暂无预警！/);
  assert.doesNotMatch(output, /（无数据）/, '无预警时不该画一张空表');
  assert.doesNotMatch(output, /条预警记录/);
});

test('学业预警渲染：有预警时按页面表头成表，并给出条数', () => {
  const output = capture(() => renderWarning({
    hasWarning: true,
    messages: ['张同学您好：'],
    headers: ['学年学期', '预警级别'],
    rows: [['2025-2026/1', '黄色预警'], ['2025-2026/2', '红色预警']],
  }));

  assert.match(output, /学年学期\s*\|\s*预警级别/, '列标题用页面原有的表头');
  assert.match(output, /黄色预警/);
  assert.match(output, /红色预警/);
  assert.match(output, /共 2 条预警记录/);
});

test('学业预警渲染：表头缺失时用占位列名，而不是画一张没有表头的表', () => {
  const output = capture(() => renderWarning({
    hasWarning: true, messages: [], headers: [], rows: [['a', 'b']],
  }));

  assert.match(output, /第1列/);
  assert.match(output, /第2列/);
});

test('缴费渲染：有记录时列出金额/状态/期限，空时明确说没有记录', () => {
  const items = [{
    academicYear: '2025-2026', semester: '1', type: '学费', item: '学分学费',
    amount: '500.00', status: '已缴费', paidAt: '2026-09-01', orderId: 'A1',
    payStart: '2026-08-01', payEnd: '2026-09-10',
  }];
  const output = capture(() => renderPayments(items, TERM));

  assert.match(output, /学生缴费\s+2026-2027 学年 · 第一学期/);
  assert.match(output, /500\.00/, '金额保留原样小数位');
  assert.match(output, /已缴费/);
  assert.match(output, /2026-08-01 ~ 2026-09-10/, '缴费期限起止都要显示');
  assert.match(output, /共 1 条缴费记录/);

  const empty = capture(() => renderPayments([], TERM));
  assert.match(empty, /该学期没有缴费记录/);
});

test('缴费渲染：起止都缺失时期限列留空，不画一个 `- ~ -`', () => {
  const output = capture(() => renderPayments([{ item: '住宿费', amount: '1200' }], TERM));
  assert.doesNotMatch(output, /\? ~ \?/);
  assert.match(output, /住宿费/);
});

/**
 * 异步版本的输出收集：`capture()` 只适用同步渲染，命令是异步的——不 await 的话
 * console.log 会在异步体跑完之前就被还原，收上来的是空串（那样测试会「通过」却什么都没断言）。
 */
async function collectAsync(fn) {
  const lines = [];
  const original = console.log;
  console.log = (value) => lines.push(String(value));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lines.join('\n');
}

test('命令层：无预警/无记录时命令自身也走得通（走默认渲染，不产生 JSON）', async () => {
  const previous = process.exitCode;
  process.exitCode = 0;
  const session = { ensureValidSession: async () => 'valid', lastRecovery: () => undefined };

  const warningOutput = await collectAsync(() => warningCommand(
    { ...session, queryWarning: async () => ({ hasWarning: false, messages: ['当前学年学期暂无预警！'], headers: [], rows: [] }) },
    {},
  ));
  assert.match(warningOutput, /当前学年学期暂无预警！/);
  assert.doesNotMatch(warningOutput, /schemaVersion/, '默认路径不该输出 JSON 信封');

  const paymentOutput = await collectAsync(() => paymentCommand(
    { ...session, queryPayments: async () => [] },
    { xnm: '2026', xqm: '3' },
  ));
  assert.match(paymentOutput, /该学期没有缴费记录/);

  process.exitCode = previous;
});
