import { JwglClient } from '../lib/client';
import { header, info, error } from '../lib/logger';
import { printJson, printTable } from '../lib/format';
import { ensureSession } from './_shared';

export async function academiaCommand(
  client: JwglClient,
  opts: { json?: boolean; category?: string } = {},
): Promise<void> {
  if (!(await ensureSession(client))) return;
  try {
    const result = await client.queryAcademia();

    // 指定分类 → 拉取该分类课程明细
    if (opts.category) {
      const kw = opts.category.trim();
      const match = result.categories.find((c) => c.name.includes(kw));
      if (!match || !match.id) {
        console.error(error(`未找到匹配的分类「${kw}」。可用分类：\n  ${result.categories.map((c) => c.name).join('\n  ')}`));
        return;
      }
      const courses = await client.queryAcademiaCategory(match.id);
      if (opts.json) {
        printJson({ category: match.name, ...match, courses });
        return;
      }
      console.log(header(`学业情况 · ${match.name}`));
      if (match.requiredCredits !== undefined) {
        console.log(`要求 ${match.requiredCredits} 学分 · 已获 ${match.earnedCredits ?? 0} · 未获 ${match.missingCredits ?? 0}`);
      }
      if (!courses.length) {
        console.log(info('该分类暂无课程明细（可能是汇总节点或无数据）'));
        return;
      }
      printTable(
        ['课程', '课程号', '性质', '类别', '学分', '成绩', '最佳', '绩点', '建议学期', '计划'],
        courses.map((c) => [
          c.title,
          c.courseId,
          c.nature,
          c.category,
          c.credit?.toString(),
          c.grade,
          c.maxGrade !== c.grade ? c.maxGrade : '',
          c.gpa?.toString(),
          c.displayTerm,
          c.planned ? '计划' : '计划外',
        ]),
      );
      return;
    }

    if (opts.json) {
      printJson(result);
      return;
    }
    console.log(header(`学业情况${result.studentId ? `   ${result.studentId}` : ''}`));
    if (result.gpa !== undefined) console.log(`平均绩点：${result.gpa}`);
    const stats = [
      ['计划总课程', result.plannedCourses],
      ['已通过课程', result.passedCourses],
      ['未通过课程', result.failedCourses],
      ['未修课程', result.unlearnedCourses],
      ['在读课程', result.inProgressCourses],
      ['计划外已通过', result.unplannedPassedCourses],
      ['计划外未通过', result.unplannedFailedCourses],
    ].filter((row) => row[1] !== undefined) as [string, number][];
    if (stats.length) printTable(['统计项目', '数量'], stats.map(([name, value]) => [name, String(value)]));
    if (!result.categories.length && !stats.length) {
      console.log(info('页面未识别出课程分类明细，请使用 --json 查看原始文本'));
      if (result.rawText?.length) printTable(['页面文本'], result.rawText.map((v) => [v]));
      return;
    }
    printTable(
      ['课程分类', '要求学分', '已获学分', '未获学分', '详情'],
      result.categories.map((category) => [
        category.name,
        category.requiredCredits?.toString(),
        category.earnedCredits?.toString(),
        category.missingCredits?.toString(),
        category.detailAvailable ? '可查(--category)' : '',
      ]),
    );
  } catch (e: any) {
    console.error(error(e?.message || '查询失败'));
  }
}
