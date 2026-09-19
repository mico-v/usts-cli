const test = require('node:test');
const assert = require('node:assert/strict');

const { gpaCommand } = require('../dist/cli/gpa');
const { academiaCommand } = require('../dist/cli/academia');
const { notificationsCommand } = require('../dist/cli/notifications');
const { selectedCoursesCommand } = require('../dist/cli/selected-courses');
const { warningCommand } = require('../dist/cli/warning');
const { paymentCommand } = require('../dist/cli/payment');
const { planCommand } = require('../dist/cli/plan');
const { minorScheduleCommand } = require('../dist/cli/minor-schedule');
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

const CASCADE = {
  colleges: [{ value: '204', label: '电子与信息工程学院' }],
  grades: [{ value: '2025', label: '2025' }],
  majors: [{ value: '0107', label: '计算机科学与技术(0107)' }],
  defaults: { collegeId: '204', gradeId: '2025', majorId: '0107' },
};

test('--json 契约：warning 直接发页面解析结果', async () => {
  const status = { hasWarning: true, messages: [], headers: ['学年学期'], rows: [['2025-2026/1']] };

  const output = await collect(() => warningCommand(loggedIn({ queryWarning: async () => status }), { json: true }));

  assert.deepEqual(JSON.parse(output), { schemaVersion: 1, command: 'warning', data: status, warnings: [] });
});

test('--json 契约：payment 发条目数组并带学期 meta', async () => {
  const items = [{ item: '学费', amount: '500.00', status: '已缴费' }];

  const output = await collect(() => paymentCommand(
    loggedIn({ queryPayments: async () => items }),
    { json: true, xnm: '2026', xqm: '3' },
  ));

  assert.deepEqual(JSON.parse(output), {
    schemaVersion: 1,
    command: 'payment',
    data: items,
    meta: { xnm: '2026', xqm: '3' },
    warnings: [],
  });
});

test('--json 契约：plan 的 data 同时给执行计划与课程明细，meta 给解析后的范围', async () => {
  const entries = [{ id: 'PLAN-1', major: '计算机科学与技术' }];
  const courses = [{ code: '2AA31001', name: '入学教育' }];
  const client = loggedIn({
    getPlanOptions: async () => CASCADE,
    queryPlan: async () => entries,
    queryPlanCourses: async () => courses,
  });

  const output = await collect(() => planCommand(client, { json: true, course: '2AA3' }));

  assert.deepEqual(JSON.parse(output), {
    schemaVersion: 1,
    command: 'plan',
    data: { entries, courses },
    meta: {
      scope: { college: '电子与信息工程学院', grade: '2025', major: '计算机科学与技术(0107)' },
      course: '2AA3',
    },
    warnings: [],
  });
});

test('--json 契约：minor-schedule 发条目数组，meta 带学期、类型与范围', async () => {
  const entries = [{ name: '计算机2301微专业课表' }];
  const client = loggedIn({
    getMinorScheduleOptions: async () => CASCADE,
    queryMinorSchedules: async () => entries,
  });

  // 该视图页的三个下拉本来就没有预选值，所以缺省即「全部」；给了范围才有 scope。
  const output = await collect(() => minorScheduleCommand(client, { json: true, xnm: '2026', xqm: '3', major: '计算机' }));

  assert.deepEqual(JSON.parse(output), {
    schemaVersion: 1,
    command: 'minor-schedule',
    data: entries,
    meta: {
      xnm: '2026',
      xqm: '3',
      kind: '微专业',
      // 只给了 major 时，college/grade 仍按预选值解析（该视图页没预选时则为 null）
      scope: { college: '电子与信息工程学院', grade: '2025', major: '计算机科学与技术(0107)' },
    },
    warnings: [],
  });
});

test('--json 契约：minor-schedule 不给范围时 scope 三个维度都是 null', async () => {
  const client = loggedIn({
    getMinorScheduleOptions: async () => { throw new Error('不该调用：缺省无范围条件时不该拉视图页'); },
    queryMinorSchedules: async () => [],
  });

  const output = await collect(() => minorScheduleCommand(client, { json: true, xnm: '2026', xqm: '3' }));

  assert.deepEqual(JSON.parse(output).meta.scope, { college: null, grade: null, major: null });
});
