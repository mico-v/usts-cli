import { AuthenticatedTransport } from '../http/authenticated-transport';
import { PlanCourse, PlanEntry, PlanFilter } from '../../types/planning';
import { CascadeOptions } from '../../types/schedule';
import { postGrid } from './grid';
import { mapPlanCourse, mapPlanEntry } from './mappers';
import { assertReadableResponse } from './response-policy';
import { parseCascadeOptions } from './select-options';

/**
 * 教学执行计划查看（jxzxjhgl，gnmkdm N153540，2026-09 实测）。
 *
 * 主列表与课程明细都是标准 `postGrid`；视图页里内嵌了学院/年级/专业下拉，
 * 且**已按当前学生预选**（专业选项带 `selected`），所以「默认查本专业+本年级」
 * 直接用视图页的预选值，不需要在本地猜。
 *
 * 主列表不带过滤条件会返回全校 1882 条（单页 ~1.4MB JSON），务必带上过滤。
 */

const PLAN_PATH = '/jxzxjhgl/jxzxjhck_cxJxzxjhckIndex.html';
const PLAN_COURSE_PATH = '/jxzxjhgl/jxzxjhkcxx_cxJxzxjhkcxxIndex.html';

/** 视图页的选单：表单里是 `nj_cx`/`zyh_id_cx`（与数据 Action 的 `njdm_id`/`zyh_id` 不同名）。 */
export async function getPlanOptions(t: AuthenticatedTransport): Promise<CascadeOptions> {
  const resp = await t.requestWithRetry(() =>
    t.http.get(`${PLAN_PATH}?gnmkdm=N153540`, {
      headers: { Cookie: t.cookieHeader(), Referer: `${t.baseUrl}${PLAN_PATH}` },
    }),
  );
  assertReadableResponse(resp, '执行计划选单解析');
  const html = typeof resp.data === 'string' ? resp.data : String(resp.data);
  return parseCascadeOptions(html, { college: 'jg_id', grade: 'nj_cx', major: 'zyh_id_cx' });
}

/** 执行计划主列表（实测：`njdm_id` + `zyh_id` 可定位到唯一一条）。 */
export async function queryPlan(t: AuthenticatedTransport, filter: PlanFilter): Promise<PlanEntry[]> {
  const items = await postGrid(t, PLAN_PATH, 'N153540', {
    jg_id: filter.collegeId || '',
    njdm_id: filter.gradeId || '',
    zyh_id: filter.majorId || '',
  });
  return items.map(mapPlanEntry);
}

/**
 * 课程明细。`jxzxjhxx_id` 是主列表行的 `id`；`kch` 为课程号（支持模糊）。
 * 其余字段取自网页 `paramMap_jxzxjhkc()`，空值也要发（缺字段会被判为参数不全）。
 */
export async function queryPlanCourses(
  t: AuthenticatedTransport,
  planId: string,
  courseCode = '',
): Promise<PlanCourse[]> {
  const items = await postGrid(t, PLAN_COURSE_PATH, 'N153540', {
    jxzxjhxx_id: planId,
    kch: courseCode,
    jyxdxnm: '', jyxdxqm: '', yxxdxnm: '', yxxdxqm: '', shzt: '', xdlx: '',
  });
  return items.map(mapPlanCourse);
}
