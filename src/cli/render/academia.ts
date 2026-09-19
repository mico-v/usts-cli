import { header, info } from '../logger';
import { printTable } from '../format';
import { AcademiaStatField, AcademiaView } from '../../application/usecases/academia';

/** 统计项字段 → 中文标签。展示文案归渲染层，用例只给字段名（架构规则 10）。 */
const STAT_LABELS: Record<AcademiaStatField, string> = {
  plannedCourses: '计划总课程',
  passedCourses: '已通过课程',
  failedCourses: '未通过课程',
  unlearnedCourses: '未修课程',
  inProgressCourses: '在读课程',
  unplannedPassedCourses: '计划外已通过',
  unplannedFailedCourses: '计划外未通过',
};

/** 概况：统计 + 分类表；`--category`：该分类的课程明细。 */
export function renderAcademia(view: AcademiaView): void {
  if (view.kind === 'category') {
    const { category, courses } = view;
    console.log(header(`学业情况 · ${category.name}`));
    if (category.requiredCredits !== undefined) {
      console.log(`要求 ${category.requiredCredits} 学分 · 已获 ${category.earnedCredits ?? 0} · 未获 ${category.missingCredits ?? 0}`);
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

  const { summary, stats } = view;
  console.log(header(`学业情况${summary.studentId ? `   ${summary.studentId}` : ''}`));
  if (summary.gpa !== undefined) console.log(`平均绩点：${summary.gpa}`);
  if (stats.length) printTable(['统计项目', '数量'], stats.map(({ field, value }) => [STAT_LABELS[field], String(value)]));
  if (!summary.categories.length && !stats.length) {
    console.log(info('页面未识别出课程分类明细，请使用 --json 查看原始文本'));
    if (summary.rawText?.length) printTable(['页面文本'], summary.rawText.map((v) => [v]));
    return;
  }
  printTable(
    ['课程分类', '要求学分', '已获学分', '未获学分', '详情'],
    summary.categories.map((category) => [
      category.name,
      category.requiredCredits?.toString(),
      category.earnedCredits?.toString(),
      category.missingCredits?.toString(),
      category.detailAvailable ? '可查(--category)' : '',
    ]),
  );
}
