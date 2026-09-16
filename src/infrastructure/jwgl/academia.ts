import { AuthenticatedTransport } from '../http/authenticated-transport';
import { AcademiaCourseItem, AcademiaSummary, GpaSummary } from '../../types/academia';
import { parseAcademiaSummary, parseGpaSummary } from './academia-page';
import { formBody } from './form';
import { mapAcademiaCourseItem } from './mappers';
import { assertReadableResponse } from './response-policy';
import { parseJsonValue, recordArray } from './value';

/**
 * 学业情况页面（GPA 与分类树同页）。`gpa` 与 `academia` 两条命令共用这一次请求：
 * 一次 fetch + 两个纯解析器，避免为两条命令发两次完全相同的请求。
 */
async function fetchAcademiaPage(t: AuthenticatedTransport): Promise<string> {
  const path = '/xsxy/xsxyqk_cxXsxyqkIndex.html';
  const resp = await t.requestWithRetry(() => t.http.get(`${path}?gnmkdm=N105515&layout=default`, {
    headers: { Cookie: t.cookieHeader(), Referer: `${t.baseUrl}/xtgl/index_initMenu.html` },
  }));
  assertReadableResponse(resp, '学业情况查询');
  return String(resp.data || '');
}

/** 学业成绩概览（GPA/学分） */
export async function queryGpa(t: AuthenticatedTransport): Promise<GpaSummary> {
  return parseGpaSummary(await fetchAcademiaPage(t));
}

/** 学业情况主页面摘要及课程分类。分类详情按需再取，避免一次请求过多。 */
export async function queryAcademia(t: AuthenticatedTransport, fallbackStudentId = ''): Promise<AcademiaSummary> {
  return parseAcademiaSummary(await fetchAcademiaPage(t), fallbackStudentId);
}

/** 学业分类明细：按分类 id 拉取课程列表（xsxyqk_cxJxzxjhxfyqKcxx.html，2026-08 实测 18/31 个叶子分类有数据） */
export async function queryAcademiaCategory(
  t: AuthenticatedTransport,
  xfyqjdId: string,
): Promise<AcademiaCourseItem[]> {
  if (!xfyqjdId) return [];
  const resp = await t.requestWithRetry(() =>
    t.http.post('/xsxy/xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515', formBody({ xfyqjd_id: xfyqjdId }), {
      headers: t.formHeaders(`${t.baseUrl}/xsxy/xsxyqk_cxXsxyqkIndex.html`),
    }),
  );
  assertReadableResponse(resp, '学业分类查询');
  const data = parseJsonValue(resp.data, '学业分类响应');
  return recordArray(data).map(mapAcademiaCourseItem);
}
