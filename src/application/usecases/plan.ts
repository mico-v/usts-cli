/**
 * 教学执行计划查看用例
 *
 * 「默认查本专业 + 本年级」的规则在 `./cascade` 里（视图页预选值优先于本地推断）。
 */
import { PlanCourse, PlanEntry, PlanFilter } from '../../types/planning';
import { CascadeSelection, selectCascade } from './cascade';
import { AppError } from '../../domain/errors';
import { PlanGateway } from '../ports/jwgl-gateway';

export interface PlanQuery {
  /** 不按本专业/本年级过滤，查全校（1882 条） */
  all?: boolean;
  college?: string;
  grade?: string;
  major?: string;
  /** `--course` 不带值时 Commander 给 `true`（= 列出该计划的全部课程） */
  course?: string | boolean;
}

/** 解析后的过滤条件（选中的选项，供渲染标题）。 */
export type PlanScope = CascadeSelection;

export interface PlanView {
  entries: PlanEntry[];
  /** 课程明细；未用 `--course` 时为空 */
  courses: PlanCourse[];
  scope: PlanScope;
  /** 课程号筛选条件（空串 = 全部课程）；未查询明细时为 undefined */
  courseCode?: string;
}

/** 选中的级联选项 → 服务端的过滤参数。 */
export function toPlanFilter(selection: CascadeSelection): PlanFilter {
  return {
    collegeId: selection.college?.value,
    gradeId: selection.grade?.value,
    majorId: selection.major?.value,
  };
}

export async function readPlan(client: PlanGateway, query: PlanQuery): Promise<PlanView> {
  // `--all` 不需要过滤条件，也就不需要视图页的选单——少发一个请求（WAF 下每个请求都有代价）。
  // 其余情况必须拉：缺省范围来自视图页的预选值，显式值也要按选单校验/解析。
  const options = query.all
    ? { colleges: [], grades: [], majors: [], defaults: { collegeId: '', gradeId: '', majorId: '' } }
    : await client.getPlanOptions();
  const scope = selectCascade(options, query);
  const entries = await client.queryPlan(toPlanFilter(scope));
  if (query.course === undefined) return { entries, courses: [], scope };

  // 课程明细挂在单条执行计划下（`jxzxjhxx_id`）。多条计划逐个拉明细会打出几十个请求，
  // 在 WAF 限流下既慢又容易被掐，因此要求先把范围收到一条。
  if (entries.length !== 1) {
    throw new AppError(
      'CONFIGURATION_ERROR',
      entries.length
        ? `课程明细需要唯一一条执行计划，当前条件匹配到 ${entries.length} 条。请缩小年级或专业范围`
        : '当前条件没有匹配的执行计划，无法查询课程明细',
    );
  }
  const courseCode = typeof query.course === 'string' ? query.course : '';
  const courses = await client.queryPlanCourses(entries[0].id || '', courseCode);
  return { entries, courses, scope, courseCode };
}
