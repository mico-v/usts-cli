const test = require('node:test');
const assert = require('node:assert/strict');

const { readScores } = require('../dist/application/usecases/scores');
const { renderScores } = require('../dist/cli/render/scores');
const { capture } = require('./capture');

const SCORE = {
  courseName: '高等数学A(一)',
  courseNature: '通识必修课',
  credit: 4,
  score: '95',
  gpa: 4.5,
  teacher: '李涛',
  college: '电子与信息工程学院',
  semester: '1',
  academicYear: '2025-2026',
};


test('成绩用例把学期与课程性质原样交给网关，并汇总学分', async () => {
  const calls = [];
  const client = {
    queryScores: async (...args) => {
      calls.push(args);
      return [SCORE, { ...SCORE, courseName: '大学英语', credit: 2.5 }];
    },
  };

  const view = await readScores(client, { xnm: '2025', xqm: '3', kcxzdm: '01' });

  assert.deepEqual(calls, [['2025', '3', { kcxzdm: '01' }]]);
  assert.equal(view.items.length, 2);
  assert.equal(view.totalCredit, 6.5, '学分合计要包含小数，且不能被空字段算成 NaN');
});

test('未指定课程性质时不发多余参数，缺学分按 0 计', async () => {
  const calls = [];
  const client = {
    queryScores: async (...args) => {
      calls.push(args);
      return [{ ...SCORE, credit: undefined }];
    },
  };

  const view = await readScores(client, { xnm: '2025', xqm: '' });

  assert.deepEqual(calls, [['2025', '', {}]]);
  assert.equal(view.totalCredit, 0);
});

test('空学期渲染成「暂无成绩记录」，标题用请求参数推算学期', () => {
  const output = capture(() => renderScores({ items: [], totalCredit: 0 }, { xnm: '2025', xqm: '3' }));

  assert.match(output, /学生成绩查询\s+2025-2026 学年 · 第一学期/);
  assert.match(output, /该学期暂无成绩记录/);
  assert.doesNotMatch(output, /共 0 门课程/, '空结果不该走汇总行');
});

test('有数据时标题用接口返回的学年/学期名，并打印汇总', () => {
  const view = { items: [SCORE, { ...SCORE, courseName: '大学英语', credit: 2.5 }], totalCredit: 6.5 };
  const output = capture(() => renderScores(view, { xnm: '2025', xqm: '3' }));

  assert.match(output, /学生成绩查询\s+2025-2026 学年 · 第一学期/);
  assert.match(output, /高等数学A\(一\)/);
  assert.match(output, /大学英语/);
  assert.match(output, /共 2 门课程 · 学分合计 6\.5/);
});
