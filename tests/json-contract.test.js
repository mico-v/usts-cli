const test = require('node:test');
const assert = require('node:assert/strict');

const { gpaCommand } = require('../dist/cli/gpa');
const { academiaCommand } = require('../dist/cli/academia');
const { notificationsCommand } = require('../dist/cli/notifications');
const { selectedCoursesCommand } = require('../dist/cli/selected-courses');
const { AppError } = require('../dist/domain/errors');

/**
 * 已登录的假网关：`ensureSession` 只要拿到 `valid` 就放行，不发任何请求。
 * 其余方法由每个用例自己补——这正是把取数拆进用例层的好处：JSON 契约可以在进程内锁住。
 */
function loggedIn(overrides) {
  return {
    restoreSession: () => true,
    ensureValidSession: async () => 'valid',
    probeSession: async () => 'valid',
    localSession: () => ({ loggedIn: true }),
    lastRecovery: () => undefined,
    ...overrides,
  };
}

/** 跑一个异步命令并收集它写到某个输出通道的内容。 */
async function collect(fn, channel = 'log') {
  const lines = [];
  const original = console[channel];
  console[channel] = (value) => lines.push(String(value));
  try {
    await fn();
  } finally {
    console[channel] = original;
  }
  return lines.join('\n');
}

// 用例重构把「取数」搬进了 application/usecases，但 --json 是**对外契约**：
// 信封里的 data 必须是稳定形状本身（不是渲染用的 view），这里逐命令锁住它。
test('--json 契约：gpa 输出 GpaSummary 本身，而不是渲染视图', async () => {
  const summary = { gpa: 3.5, averageScore: 88, totalCredits: 160, earnedCredits: 120, rawText: ['原文'] };

  const output = await collect(() => gpaCommand(loggedIn({ queryGpa: async () => summary }), { json: true }));

  assert.deepEqual(JSON.parse(output), {
    schemaVersion: 1,
    command: 'gpa',
    data: summary,
    warnings: [],
  });
});

test('--json 契约：academia 概况发 summary，分类明细发 {category, courses}', async () => {
  const summary = { gpa: 3.7, plannedCourses: 60, categories: [{ id: 'b2', name: '大学英语' }] };
  const courses = [{ title: '大学英语（一）', grade: '88' }];
  const client = loggedIn({
    queryAcademia: async () => summary,
    queryAcademiaCategory: async () => courses,
  });

  const overview = await collect(() => academiaCommand(client, { json: true }));
  assert.deepEqual(JSON.parse(overview), { schemaVersion: 1, command: 'academia', data: summary, warnings: [] });

  const detail = await collect(() => academiaCommand(client, { json: true, category: '英语' }));
  assert.deepEqual(JSON.parse(detail).data, { category: { id: 'b2', name: '大学英语' }, courses });
});

test('--json 契约：notifications 发条目数组；selected-courses 另带 meta 学期', async () => {
  const items = [{ title: '选课通知', unread: true }];

  const notifications = await collect(() => notificationsCommand(loggedIn({ queryNotifications: async () => items }), { json: true }));
  assert.deepEqual(JSON.parse(notifications), { schemaVersion: 1, command: 'notifications', data: items, warnings: [] });

  const selected = await collect(() => selectedCoursesCommand(
    loggedIn({ querySelectedCourses: async () => items }),
    { json: true, xnm: '2026', xqm: '3' },
  ));
  assert.deepEqual(JSON.parse(selected), {
    schemaVersion: 1,
    command: 'selected-courses',
    data: items,
    meta: { xnm: '2026', xqm: '3' },
    warnings: [],
  });
});

test('--json 出错时错误信封写 stderr，退出码不变', async () => {
  const previousExitCode = process.exitCode;
  const client = loggedIn({ queryGpa: async () => { throw new AppError('PROTOCOL_CHANGED', '接口变了'); } });

  const output = await collect(() => gpaCommand(client, { json: true }), 'error');

  assert.equal(process.exitCode, 5, 'PROTOCOL_CHANGED → 退出码 5');
  const envelope = JSON.parse(output);
  assert.equal(envelope.error.code, 'PROTOCOL_CHANGED');
  assert.equal(envelope.command, 'gpa');
  assert.equal(envelope.schemaVersion, 1);
  process.exitCode = previousExitCode;
});
