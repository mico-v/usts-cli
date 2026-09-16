const test = require('node:test');
const assert = require('node:assert/strict');

const { matchCategory, readAcademia } = require('../dist/application/usecases/academia');
const { readGpa } = require('../dist/application/usecases/gpa');
const { renderAcademia } = require('../dist/cli/render/academia');
const { renderGpa } = require('../dist/cli/render/gpa');
const { capture } = require('./capture');

const SUMMARY = {
  studentId: '2520010711',
  gpa: 3.72,
  plannedCourses: 60,
  passedCourses: 42,
  failedCourses: 0,
  categories: [
    { id: 'a1', name: '思想政治类', requiredCredits: 16, earnedCredits: 4, missingCredits: 12, detailAvailable: false },
    { id: 'b2', name: '大学英语', requiredCredits: 12, earnedCredits: 6, missingCredits: 6, detailAvailable: true },
  ],
};

test('学业情况用例：未通过课程为 0 也要出现在统计里，缺字段的项不出现', async () => {
  const view = await readAcademia({ queryAcademia: async () => SUMMARY });

  assert.equal(view.kind, 'overview');
  assert.deepEqual(view.stats, [
    { label: '计划总课程', value: 60 },
    { label: '已通过课程', value: 42 },
    { label: '未通过课程', value: 0 },
  ], '0 是有效值，不能按假值丢掉；未修的字段没有就不出现');
});

test('学业情况用例：--category 按名称子串匹配并拉明细', async () => {
  const calls = [];
  const client = {
    queryAcademia: async () => SUMMARY,
    queryAcademiaCategory: async (id) => {
      calls.push(id);
      return [{ title: '大学英语（一）', grade: '88', gpa: 3.5, planned: true }];
    },
  };

  const view = await readAcademia(client, { category: '英语' });

  assert.equal(view.kind, 'category');
  assert.equal(view.category.name, '大学英语');
  assert.equal(view.courses.length, 1);
  assert.deepEqual(calls, ['b2'], '只有可查明细的分类才发第二次请求');
  assert.equal(matchCategory(SUMMARY.categories, '政治').name, '思想政治类');
  assert.equal(matchCategory(SUMMARY.categories, '不存在'), null);
});

test('学业情况用例：分类匹配不到时抛出可用分类清单', async () => {
  await assert.rejects(
    () => readAcademia({ queryAcademia: async () => SUMMARY }, { category: '不存在的分类' }),
    (error) => {
      assert.equal(error.code, 'CONFIGURATION_ERROR');
      assert.match(error.message, /未找到匹配的分类「不存在的分类」/);
      assert.match(error.message, /思想政治类[\s\S]*大学英语/, '要把可用分类列出来，别让用户猜');
      return true;
    },
  );
});

test('学业情况渲染：概况打印统计与分类表；分类明细打印学分要求', () => {
  const overview = capture(() => renderAcademia({
    kind: 'overview',
    summary: SUMMARY,
    stats: [{ label: '计划总课程', value: 60 }],
  }));
  assert.match(overview, /学业情况\s+2520010711/);
  assert.match(overview, /平均绩点：3\.72/);
  assert.match(overview, /计划总课程/);
  assert.match(overview, /思想政治类.*16.*4.*12/, '分类表要带要求/已获/未获学分');
  assert.match(overview, /大学英语.*可查\(--category\)/);

  const detail = capture(() => renderAcademia({
    kind: 'category',
    category: SUMMARY.categories[1],
    courses: [{ title: '大学英语（一）', courseId: '9001', credit: 3, grade: '88', maxGrade: '88', gpa: 3.5, displayTerm: '2025-2026 第一学期', planned: true }],
  }));
  assert.match(detail, /学业情况 · 大学英语/);
  assert.match(detail, /要求 12 学分 · 已获 6 · 未获 6/);
  assert.match(detail, /大学英语（一）/);
  assert.match(detail, /计划/);
});

test('学业情况渲染：什么都解析不出来时摊开页面原文', () => {
  const output = capture(() => renderAcademia({
    kind: 'overview',
    summary: { categories: [], rawText: ['页面原始文本一行'] },
    stats: [],
  }));

  assert.match(output, /页面未识别出课程分类明细/);
  assert.match(output, /页面原始文本一行/);
});

test('GPA 用例与渲染：字段缺失时回落原文，有字段时只列有值的项', async () => {
  const view = await readGpa({ queryGpa: async () => ({ gpa: 3.5, totalCredits: 160, rawText: ['x'] }) });

  assert.deepEqual(view.rows, [['平均绩点', '3.5'], ['总学分', '160']]);
  const output = capture(() => renderGpa(view));
  assert.match(output, /学业成绩概览/);
  assert.match(output, /平均绩点.*3\.5/);
  assert.doesNotMatch(output, /页面未识别出/);

  const fallback = await readGpa({ queryGpa: async () => ({ rawText: ['识别不到的结构'] }) });
  assert.deepEqual(fallback.rows, []);
  const fallbackOutput = capture(() => renderGpa(fallback));
  assert.match(fallbackOutput, /页面未识别出结构化 GPA\/学分字段/);
  assert.match(fallbackOutput, /识别不到的结构/);
});
