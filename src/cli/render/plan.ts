import { header, info, success } from '../logger';
import { printTable } from '../format';
import { PlanEntry } from '../../types/planning';
import { PlanView } from '../../application/usecases/plan';

/** 标题里的范围描述：默认查本专业+本年级时显示正方预选的那三个选项。 */
function describeScope(view: PlanView, all: boolean): string {
  if (all) return '全校 · 全部年级/专业';
  const { college, grade, major } = view.scope;
  const parts = [grade?.label, major?.label].filter(Boolean);
  if (college?.label) parts.push(college.label);
  return parts.join(' · ') || '全部';
}

function renderEntries(entries: PlanEntry[]): void {
  printTable(
    ['年级', '专业号', '专业', '类别', '课程数', '总学分', '计划人数', '校区', '学制'],
    entries.map((entry) => [
      entry.grade,
      entry.majorCode,
      entry.major,
      entry.category,
      entry.courseCount?.toString(),
      entry.totalCredits?.toString(),
      entry.plannedStudents?.toString(),
      entry.campus,
      entry.schoolLength,
    ]),
    { maxColWidth: 18 },
  );
}

export function renderPlan(view: PlanView, options: { all?: boolean; limit: number }): void {
  console.log(header(`教学执行计划   ${describeScope(view, !!options.all)}`));

  if (!view.entries.length) {
    console.log(info('没有匹配的执行计划。可用 --all 查全校，或换个 --grade/--major'));
    return;
  }

  const shown = options.limit > 0 ? view.entries.slice(0, options.limit) : view.entries;
  renderEntries(shown);
  console.log(success(
    `共 ${view.entries.length} 条执行计划` +
    (shown.length < view.entries.length ? `，已显示前 ${shown.length} 条（--limit 调整，0 = 全部）` : ''),
  ));

  if (view.courseCode === undefined) {
    console.log(info(view.entries.length === 1
      ? '加 --course 可查看这条计划的课程明细（--course <课程号> 只看某门课）'
      : '用 --grade/--major 缩小到唯一一条后，可用 --course 查看它的课程明细'));
    return;
  }

  console.log(header(view.courseCode ? `课程明细（课程号含 ${view.courseCode}）` : '课程明细（全部课程）'));
  if (!view.courses.length) {
    console.log(info('这条计划下没有匹配的课程'));
    return;
  }
  const courses = options.limit > 0 ? view.courses.slice(0, options.limit) : view.courses;
  printTable(
    ['课程号', '课程名', '学分', '学时', '性质', '类别', '建议学期', '考核', '开课部门'],
    courses.map((course) => [
      course.code,
      course.name,
      course.credit?.toString(),
      course.hours?.toString(),
      course.nature,
      course.category,
      course.suggestedTerm,
      course.assessMethod,
      course.department,
    ]),
    { maxColWidth: 18 },
  );
  console.log(success(
    `共 ${view.courses.length} 门课程` +
    (courses.length < view.courses.length ? `，已显示前 ${courses.length} 门（--limit 调整，0 = 全部）` : ''),
  ));
}
