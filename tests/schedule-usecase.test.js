const test = require('node:test');
const assert = require('node:assert/strict');

const { readSchedule } = require('../dist/application/usecases/schedule');
const { renderSchedule } = require('../dist/cli/render/schedule');
const { capture } = require('./capture');

const TIMED = {
  courseName: '高等数学A(一)',
  teacher: '李涛',
  className: '计算机2511',
  campus: '石湖',
  weeks: '1-17周',
  weekday: 1,
  startSection: 1,
  endSection: 2,
};

const LATE = { ...TIMED, courseName: '大学英语', startSection: 5, endSection: 6 };
const MOOC = { courseName: '创新创业实践', teacher: '王五', weeks: '3-9周', credit: 1, courseType: '实践课', assessMethod: '考查' };

test('课表用例：有固定节次的按星期分组并按节次排序，无固定节次的单列', async () => {
  const client = { querySchedule: async () => [LATE, MOOC, TIMED] };

  const view = await readSchedule(client, { xnm: '2025', xqm: '3' });

  assert.equal(view.total, 3);
  assert.deepEqual(view.days.map((d) => d.day), [1], '只有周一有固定节次');
  assert.deepEqual(view.days[0].items.map((i) => i.courseName), ['高等数学A(一)', '大学英语'], '组内要按起始节次排序');
  assert.deepEqual(view.untimed.map((i) => i.courseName), ['创新创业实践']);
});

test('课表用例：只有 weekday 没有节次也算无固定时间', async () => {
  const half = { ...TIMED, startSection: undefined, endSection: undefined };

  const view = await readSchedule({ querySchedule: async () => [half] }, { xnm: '2025', xqm: '' });

  assert.equal(view.days.length, 0);
  assert.equal(view.untimed.length, 1);
  assert.equal(view.total, 1);
});

test('课表渲染：空结果提示；有结果时画星期分组、其他课程与汇总', () => {
  const term = { xnm: '2025', xqm: '3' };

  const empty = capture(() => renderSchedule({ days: [], untimed: [], total: 0 }, term));
  assert.match(empty, /个人课表查询\s+2025-2026 学年 · 第一学期/);
  assert.match(empty, /该学期暂无课表记录/);

  const output = capture(() => renderSchedule(
    { days: [{ day: 1, items: [TIMED, LATE] }], untimed: [MOOC], total: 3 },
    term,
  ));
  assert.match(output, /周一/);
  assert.match(output, /1~2 节\s+高等数学A\(一\)/, '要显示节次范围');
  assert.match(output, /其他课程（无固定时间）/);
  assert.match(output, /创新创业实践.*学分:1/, '无固定节次的课程要带学分/课程类型');
  assert.match(output, /共 3 条课程记录/);
});
