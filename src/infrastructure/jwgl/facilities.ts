import { AuthenticatedTransport } from '../http/authenticated-transport';
import { FreeClassroom, FreeClassroomQuery } from '../../types/facilities';
import { postGrid } from './grid';
import { mapFreeClassroom } from './mappers';

/**
 * 空闲教室/场地查询（cdjy，gnmkdm N2155，2026-09 实测）。
 *
 * 与其它列表接口不同的两点（都影响正确性，别照抄别的模块）：
 *   1. `jyfs` **必须**带（借用方式，0=按周次）。不传 `jyfs` 而只发 `xnm/xqm` 会拿到
 *      「错误提示」页——不是会话失效，是请求被拒。
 *   2. 返回的是「在所选时段**全部**空闲的场地」：多选周次/星期/节次取交集而不是并集
 *      （实测：第 3 周 ∧ 第 4 周 = 位掩码 12 的结果）。时段留空（或掩码为 0）= 不做时段过滤，
 *      返回该学期全部场地。
 *
 * 周次/节次是位掩码 `2^(n-1)` 求和，星期是逗号串——取自网页
 * `js/comp/jwglxt/pkgl/cdjy/kxcdlb.js` 的 `Math.pow(2, value-1)` 与 `xqList.join(',')`。
 */

/** 周次 → `zcd` 位掩码（第 n 周 = 2^(n-1)，求和） */
export function weekMask(weeks: number[]): string {
  return String(weeks.reduce((sum, week) => sum + 2 ** (week - 1), 0));
}

/** 节次 → `jcd` 位掩码（同上）。相邻节次同值：服务端按两节一大节判定 */
export function sectionMask(sections: number[]): string {
  return String(sections.reduce((sum, section) => sum + 2 ** (section - 1), 0));
}

/** 星期 → `xqj` 逗号串（排序去重后拼接） */
export function weekdayList(weekdays: number[]): string {
  return [...new Set(weekdays)].sort((a, b) => a - b).join(',');
}

/** 空闲教室查询：时段字段留空表示不做时段过滤。 */
export async function queryFreeClassrooms(
  t: AuthenticatedTransport,
  query: FreeClassroomQuery,
): Promise<FreeClassroom[]> {
  const body: Record<string, string> = { xnm: query.xnm, xqm: query.xqm, jyfs: '0' };
  if (query.weeks?.length) body.zcd = weekMask(query.weeks);
  if (query.weekdays?.length) body.xqj = weekdayList(query.weekdays);
  if (query.sections?.length) body.jcd = sectionMask(query.sections);
  return (await postGrid(t, '/cdjy/cdjy_cxKxcdlb.html', 'N2155', body)).map(mapFreeClassroom);
}
