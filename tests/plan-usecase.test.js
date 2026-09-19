const test = require('node:test');
const assert = require('node:assert/strict');

const { readPlan } = require('../dist/application/usecases/plan');
const { renderPlan } = require('../dist/cli/render/plan');
const { capture } = require('./capture');

const OPTIONS = {
  colleges: [{ value: '204', label: '电子与信息工程学院' }, { value: '216', label: '文学院' }],
  grades: [{ value: '2025', label: '2025' }, { value: '2024', label: '2024' }],
  majors: [{ value: '0107', label: '计算机科学与技术(0107)' }, { value: '0101', label: '建筑学(0101)' }],
  // 视图页的预选值：正方已按当前学生选好
  defaults: { collegeId: '204', gradeId: '2025', majorId: '0107' },
};

const ENTRY = {
  id: 'PLAN-1', grade: '2025', majorCode: '0107', major: '计算机科学与技术', category: '专业',
  courseCount: 99, totalCredits: 170, plannedStudents: 92, campus: '石湖', schoolLength: '4',
};

function gateway(entries = [ENTRY]) {
  const calls = { plan: [], courses: [] };
  return {
    calls,
    getPlanOptions: async () => OPTIONS,
    queryPlan: async (filter) => { calls.plan.push(filter); return entries; },
    queryPlanCourses: async (id, code) => { calls.courses.push([id, code]); return [{ code: '2AA31001', name: '入学教育' }]; },
  };
}

test('缺省过滤条件取自视图页的预选值（本专业 + 本年级 + 本学院）', async () => {
  const client = gateway();
  const view = await readPlan(client, {});

  assert.deepEqual(client.calls.plan[0], { collegeId: '204', gradeId: '2025', majorId: '0107' });
  assert.deepEqual(view.scope, {
    college: { value: '204', label: '电子与信息工程学院' },
    grade: { value: '2025', label: '2025' },
    major: { value: '0107', label: '计算机科学与技术(0107)' },
  });
});

test('显式条件按 id / 全名 / 名称子串覆盖预选值，其余维度仍用预选值', async () => {
  const client = gateway();
  const view = await readPlan(client, { grade: '2024', major: '建筑' });

  assert.deepEqual(client.calls.plan[0], { collegeId: '204', gradeId: '2024', majorId: '0101' });
  assert.equal(view.scope.grade.label, '2024');
  assert.equal(view.scope.major.label, '建筑学(0101)');
});

test('显式条件匹配不到时报参数错误，而不是悄悄按预选值查', async () => {
  const client = gateway();
  await assert.rejects(
    () => readPlan(client, { major: '不存在的专业' }),
    (error) => error.code === 'CONFIGURATION_ERROR' && /未找到专业/.test(error.message),
  );
  assert.equal(client.calls.plan.length, 0);
});

test('--all 不带任何过滤条件，也不解析预选值', async () => {
  const client = gateway();
  const view = await readPlan(client, { all: true });

  assert.deepEqual(client.calls.plan[0], { collegeId: undefined, gradeId: undefined, majorId: undefined });
  assert.deepEqual(view.scope, {});
});

test('--course：唯一一条计划时用它的 id 拉课程明细', async () => {
  const client = gateway();
  const view = await readPlan(client, { course: '2AA3' });

  assert.deepEqual(client.calls.courses, [['PLAN-1', '2AA3']]);
  assert.deepEqual(view.courses.map((course) => course.code), ['2AA31001']);
  assert.equal(view.courseCode, '2AA3');
});

test('--course 不带值 = 列出该计划的全部课程', async () => {
  const client = gateway();
  const view = await readPlan(client, { course: true });

  assert.deepEqual(client.calls.courses, [['PLAN-1', '']]);
  assert.equal(view.courseCode, '');
});

test('--course 在多条或零条计划时报错，避免打出一串明细请求', async () => {
  const many = gateway([ENTRY, { ...ENTRY, id: 'PLAN-2' }]);
  await assert.rejects(
    () => readPlan(many, { course: true }),
    (error) => error.code === 'CONFIGURATION_ERROR' && /匹配到 2 条/.test(error.message),
  );
  assert.equal(many.calls.courses.length, 0);

  const none = gateway([]);
  await assert.rejects(
    () => readPlan(none, { course: true }),
    (error) => error.code === 'CONFIGURATION_ERROR' && /没有匹配的执行计划/.test(error.message),
  );
});

test('渲染：标题写范围，列表超限时说明，并给出下一步提示', () => {
  const view = { entries: [ENTRY], courses: [], scope: { grade: { label: '2025' }, major: { label: '计算机科学与技术(0107)' } } };
  const output = capture(() => renderPlan(view, { limit: 20 }));

  assert.match(output, /教学执行计划\s+2025 · 计算机科学与技术\(0107\)/);
  assert.match(output, /共 1 条执行计划/);
  assert.match(output, /加 --course 可查看这条计划的课程明细/);
});

test('渲染：--course 后画出课程明细，并沿用 --limit', () => {
  const courses = [
    { code: '2AA31001', name: '入学教育', credit: 0, hours: 1, nature: '素质必修课', suggestedTerm: '2025-2026/1' },
    { code: '2AS11001', name: '军事理论', credit: 2, hours: 36 },
  ];
  const view = {
    entries: [ENTRY], courses, scope: { grade: { label: '2025' }, major: { label: '计算机科学与技术(0107)' } }, courseCode: '',
  };
  const output = capture(() => renderPlan(view, { limit: 1 }));

  assert.match(output, /课程明细（全部课程）/);
  assert.match(output, /2AA31001 \| 入学教育/);
  assert.match(output, /共 2 门课程，已显示前 1 门/);
  assert.doesNotMatch(output, /军事理论/);
});

test('渲染：空结果时提示改用 --all，而不是画一张空表', () => {
  const output = capture(() => renderPlan({ entries: [], courses: [], scope: {} }, { limit: 20 }));
  assert.match(output, /没有匹配的执行计划/);
  assert.match(output, /--all/);
});

test('渲染：--all 的标题说明这是全校范围', () => {
  const output = capture(() => renderPlan({ entries: [ENTRY], courses: [], scope: {} }, { all: true, limit: 20 }));
  assert.match(output, /全校 · 全部年级\/专业/);
});
