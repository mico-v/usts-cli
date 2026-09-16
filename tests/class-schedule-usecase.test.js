const test = require('node:test');
const assert = require('node:assert/strict');

const {
  concreteTerm,
  gradeLabel,
  pickOption,
  readClassSchedule,
  resolveClassQueryByFlags,
  toClassQuery,
} = require('../dist/application/usecases/class-schedule');
const { renderClassSchedule } = require('../dist/cli/render/clsched');
const { capture } = require('./capture');

const OPTIONS = {
  colleges: [{ value: '204', label: '电子与信息工程学院' }],
  campuses: [{ value: '2', label: '石湖' }],
  grades: [{ value: '2025', label: '2025' }],
  defaultGrade: '2025',
  defaultCampus: '2',
};

const CLASS = { value: '2520401000', label: '测试班级', meta: { bh: '2520401000' } };

function fakeClient(overrides = {}) {
  return {
    getMajorsByCollege: async () => [{ value: '0107', label: '计算机科学与技术' }],
    getClassesByMajor: async () => [CLASS],
    ...overrides,
  };
}

test('下拉匹配：id、全名、附加键（班级编号）、名称子串依次尝试', () => {
  const list = [{ value: '204', label: '电子与信息工程学院' }, CLASS];

  assert.equal(pickOption('204', list).label, '电子与信息工程学院');
  assert.equal(pickOption('电子与信息工程学院', list).value, '204');
  assert.equal(pickOption('2520401000', list, ['bh']).label, '测试班级', '班级编号只存在于 meta.bh');
  assert.equal(pickOption('电子', list).value, '204', '名称子串兜底');
  assert.equal(pickOption('不存在的学院', list), null);
  assert.equal(pickOption('', list), null);
  assert.equal(pickOption(undefined, list), null);
});

test('课表学期必须落到具体学期：缺省补当前学期', () => {
  const fallback = concreteTerm({ xnm: '2025', xqm: '' });

  assert.equal(fallback.xnm, '2025');
  assert.match(fallback.xqm, /^(3|12|16)$/, '空学期要用当前学期码补上');
  assert.deepEqual(concreteTerm({ xnm: '2025', xqm: '3' }), { xnm: '2025', xqm: '3' });
});

test('--jg/--zy/--bh 解析出的查询参数：bh 取编号、njmc 取年级显示名', async () => {
  const query = await resolveClassQueryByFlags(
    fakeClient(),
    OPTIONS,
    { jg: '电子', zy: '计算机', bh: '2520401000' },
    { xnm: '2025', xqm: '3' },
  );

  assert.deepEqual(query, {
    xnm: '2025',
    xqm: '3',
    xqhId: '2',
    njdmId: '2025',
    zyhId: '0107',
    bhId: '2520401000',
    bh: '2520401000',
    bj: '测试班级',
    zymc: '计算机科学与技术',
    jgmc: '电子与信息工程学院',
    njmc: '2025',
  });
  assert.equal(gradeLabel('2025', OPTIONS), '2025');
  assert.equal(toClassQuery({
    xnm: '2025', xqm: '3',
    college: OPTIONS.colleges[0], major: { value: '0107', label: '计算机' }, cls: CLASS,
    campusId: '2', gradeId: '2025', gradeName: '2025',
  }).bh, '2520401000');
});

test('缺参数与匹配不到时给出稳定错误码与可操作文案', async () => {
  const term = { xnm: '2025', xqm: '3' };
  const cases = [
    [{ zy: '计算机', bh: 'x' }, /请用 --jg 指定学院/],
    [{ jg: '不存在的学院', zy: '计算机', bh: 'x' }, /未找到学院：不存在的学院/],
    [{ jg: '电子', bh: 'x' }, /请用 --zy 指定专业/],
    [{ jg: '电子', zy: '不存在的专业', bh: 'x' }, /未找到专业：不存在的专业/],
    [{ jg: '电子', zy: '计算机', bh: '不存在的班级' }, /未找到班级：不存在的班级/],
  ];

  for (const [flags, pattern] of cases) {
    await assert.rejects(
      () => resolveClassQueryByFlags(fakeClient(), OPTIONS, flags, term),
      (error) => {
        assert.equal(error.code, 'CONFIGURATION_ERROR');
        assert.match(error.message, pattern);
        return true;
      },
    );
  }

  // 下拉为空时，--jg/--zy/--bh 路径报的是「未找到 X」（与重构前一致）；
  // 交互式级联那条路另有「该学院暂无专业」这类更贴切的提示（见 cli/clsched-cascade.ts）。
  await assert.rejects(
    () => resolveClassQueryByFlags(fakeClient({ getClassesByMajor: async () => [] }), OPTIONS, { jg: '电子', zy: '计算机', bh: '2520401000' }, term),
    (error) => error.code === 'CONFIGURATION_ERROR' && /未找到班级：2520401000/.test(error.message),
  );
});

test('班级课表分组：按星期与节次排序，实践课单列', async () => {
  const items = [
    { courseName: '大学英语', weekday: 2, startSection: 3, endSection: 4, room: 'B201' },
    { courseName: '高等数学', weekday: 2, startSection: 1, endSection: 2, room: 'A101', teacher: '李涛', teacherTitle: '教授' },
    { courseName: '形势与政策', room: '线上' },
  ];

  const timetable = await readClassSchedule(
    { queryClassSchedule: async () => ({ items, practice: ['金工实习'] }) },
    { xnm: '2025', xqm: '3', xqhId: '2', njdmId: '2025', zyhId: '0107', bhId: '1', bh: '1', bj: '测试班级', zymc: '计算机', jgmc: '电子', njmc: '2025' },
  );

  assert.deepEqual(timetable.days.map((d) => d.day), [2]);
  assert.deepEqual(timetable.days[0].items.map((i) => i.courseName), ['高等数学', '大学英语']);
  assert.deepEqual(timetable.untimed.map((i) => i.courseName), ['形势与政策']);
  assert.deepEqual(timetable.practice, ['金工实习']);
  assert.equal(timetable.courseCount, 3);

  const output = capture(() => renderClassSchedule(
    timetable,
    { bj: '测试班级' },
    { xnm: '2025', xqm: '3' },
  ));
  assert.match(output, /班级课表查询\s+测试班级 · 2025-2026 学年 · 第一学期/);
  assert.match(output, /周二/);
  assert.match(output, /1~2节\s+高等数学\s+@ A101\s+李涛\(教授\)/, '教师职称要跟在姓名后');
  assert.match(output, /3~4节\s+大学英语/);
  assert.match(output, /其他课程（无固定时间）[\s\S]*形势与政策/);
  assert.match(output, /实践课：金工实习/);
  assert.match(output, /共 3 门课 · 1 门实践课/);
});

test('班级课表渲染：什么都没有时给提示而不是空表', () => {
  const output = capture(() => renderClassSchedule(
    { days: [], untimed: [], practice: [], courseCount: 0 },
    { bj: '测试班级' },
    { xnm: '2025', xqm: '3' },
  ));

  assert.match(output, /该班级暂无课表记录/);
});
