const test = require('node:test');
const assert = require('node:assert/strict');

const {
  readMinorSchedules, resolveMinorKind, DEFAULT_MINOR_KIND,
} = require('../dist/application/usecases/minor-schedule');
const { renderMinorSchedule } = require('../dist/cli/render/minor-schedule');
const { capture } = require('./capture');

const TERM = { xnm: '2026', xqm: '3' };

const OPTIONS = {
  colleges: [{ value: '204', label: '电子与信息工程学院' }],
  grades: [{ value: '2025', label: '2025' }],
  majors: [{ value: '0107', label: '计算机科学与技术(0107)' }],
  defaults: { collegeId: '204', gradeId: '2025', majorId: '0107' },
};

function gateway(entries = []) {
  const calls = { options: [], list: [] };
  return {
    calls,
    getMinorScheduleOptions: async (kind) => { calls.options.push(kind); return OPTIONS; },
    queryMinorSchedules: async (query) => { calls.list.push(query); return entries; },
  };
}

test('课表类型：缺省微专业，名称/网页编码都能认，非法值报参数错误', () => {
  assert.deepEqual(resolveMinorKind(undefined), { code: 'micro-major', name: DEFAULT_MINOR_KIND });
  assert.equal(resolveMinorKind('辅修').code, 'minor');
  assert.equal(resolveMinorKind('04').code, 'minor', '网页编码也要能直接写');
  assert.equal(resolveMinorKind('二学位').code, 'dual-degree');
  assert.equal(resolveMinorKind('03').code, 'dual-degree');
  assert.equal(resolveMinorKind('微').code, 'micro-major', '按名称子串匹配');
  assert.throws(() => resolveMinorKind('选修'), (error) => error.code === 'CONFIGURATION_ERROR');
});

test('缺省不拉视图页（该页三个下拉本来就没预选，缺省即不过滤），按类型查列表', async () => {
  const client = gateway();
  const view = await readMinorSchedules(client, { ...TERM });

  assert.deepEqual(client.calls.options, [], '缺省无范围条件时不该白拉一次视图页');
  assert.deepEqual(client.calls.list[0], {
    xnm: '2026', xqm: '3', kind: 'micro-major',
    collegeId: undefined, gradeId: undefined, majorId: undefined,
  });
  assert.equal(view.scoped, false);
});

test('--all 与缺省等价（本来就不过滤），不拉视图页', async () => {
  const client = gateway();
  const view = await readMinorSchedules(client, { ...TERM, all: true });

  assert.deepEqual(client.calls.options, []);
  assert.deepEqual(client.calls.list[0], {
    xnm: '2026', xqm: '3', kind: 'micro-major',
    collegeId: undefined, gradeId: undefined, majorId: undefined,
  });
  assert.equal(view.scoped, false);
});

test('--kind 切换类型，并据此拉对应类型的视图页', async () => {
  const client = gateway();
  const view = await readMinorSchedules(client, { ...TERM, kind: '辅修', college: '电子' });

  assert.deepEqual(client.calls.options, ['minor'], '只有给了范围才需要视图页校验');
  assert.deepEqual(client.calls.list[0], {
    xnm: '2026', xqm: '3', kind: 'minor',
    collegeId: '204', gradeId: '2025', majorId: '0107',
  });
  assert.equal(view.kind.name, '辅修');
});

test('显式范围按名称子串覆盖预选值，并标记为已过滤', async () => {
  const client = gateway();
  const view = await readMinorSchedules(client, { ...TERM, college: '电子', grade: '2025', major: '计算机' });

  assert.deepEqual(client.calls.list[0], {
    xnm: '2026', xqm: '3', kind: 'micro-major',
    collegeId: '204', gradeId: '2025', majorId: '0107',
  });
  assert.equal(view.scoped, true, '给了范围要标记为已过滤，空结果时的提示据此不同');
});

test('渲染：标题带类型、学期与范围；空结果按当前是否已过滤给不同建议', () => {
  const empty = capture(() => renderMinorSchedule(
    { kind: { code: 'micro-major', name: '微专业' }, entries: [], scope: {}, scoped: false }, TERM,
  ));
  assert.match(empty, /微专业课表\s+2026-2027 学年 · 第一学期\s+全部/);
  assert.match(empty, /该学期没有微专业课表记录/, '本来就没过滤，不该建议「去掉范围」');
  assert.doesNotMatch(empty, /可用 --college/, '缺省状态下给 --college 建议是死路：缺省已经不过滤');

  const filtered = capture(() => renderMinorSchedule(
    {
      kind: { code: 'micro-major', name: '微专业' }, entries: [], scoped: true,
      scope: { college: { value: '204', label: '电子与信息工程学院' } },
    },
    TERM,
  ));
  assert.match(filtered, /没有匹配的微专业课表/);
  assert.match(filtered, /去掉 --college\/--major\/--grade 放宽范围/, '已过滤时才该建议放宽');
});

test('渲染：有数据时列出学院/年级/专业/课表名称', () => {
  const entries = [{ college: '电子与信息工程学院', grade: '2025', major: '计算机科学与技术', name: '计算机2301微专业课表' }];
  const output = capture(() => renderMinorSchedule(
    { kind: { code: 'minor', name: '辅修' }, entries, scoped: true, scope: { college: { value: '204', label: '电子与信息工程学院' } } },
    TERM,
  ));

  assert.match(output, /辅修课表\s+2026-2027 学年 · 第一学期\s+电子与信息工程学院/);
  assert.match(output, /计算机2301微专业课表/);
  assert.match(output, /共 1 张辅修课表/);
});
