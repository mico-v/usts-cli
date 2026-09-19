import { AuthenticatedTransport, FORM_CONTENT_TYPE, TransportResponse } from '../http/authenticated-transport';
import { ambiguousRejection, assertReadableResponse } from './response-policy';
import { parseJsonValue, RawRecord, recordArray } from './value';
import { formBody } from './form';

/** 服务端实际按 queryModel.showCount 分页，5000 一次取全。 */
const GRID_PAGE_SIZE = 5000;
const MAX_GRID_PAGES = 20;

/**
 * 列表查询（2026-08 抓包 + axios 实测）——正方 V9 列表接口的统一规律。
 *
 * URL 带 `?doType=query&gnmkdm=<功能码>`（不传 su，服务端按会话识别用户）。
 * body 必须同时包含两套分页参数才能通过校验并真正分页：
 *   - 经典 jqGrid 字段 page/rows/sidx/sord（缺了会返回「错误提示」页）
 *   - queryModel.showCount / queryModel.currentPage（服务端实际用它分页，
 *     忽略 page/rows；showCount=5000 时一次取全）
 * 响应为 `{ items:[...], totalCount:N }`。
 *
 * 任何一页返回非 JSON 都直接报错（标记为待确认），**不做静默截断**——
 * 把不完整的列表当成完整结果返回，比失败更糟。
 */
export async function postGrid(
  t: AuthenticatedTransport,
  dataPath: string,
  gnmkdm: string,
  extra: Record<string, string> = {},
): Promise<RawRecord[]> {
  const all: RawRecord[] = [];
  for (let page = 1; page <= MAX_GRID_PAGES; page++) {
    const body = formBody({
      ...extra,
      _search: 'false',
      nd: String(Date.now()),
      page: String(page),
      rows: '100',           // 经典字段，用于通过校验
      sidx: '',
      sord: 'asc',
      'queryModel.showCount': String(GRID_PAGE_SIZE),
      'queryModel.currentPage': String(page),
    });
    const resp: TransportResponse = await t.requestWithRetry(() =>
      t.http.post(`${dataPath}?doType=query&gnmkdm=${gnmkdm}`, body, {
        headers: {
          Cookie: t.cookieHeader(),
          Referer: `${t.baseUrl}${dataPath}`,
          'Content-Type': FORM_CONTENT_TYPE,
          'X-Requested-With': 'XMLHttpRequest',
        },
      }),
    );
    assertReadableResponse(resp, '列表查询');
    let data: any;
    try {
      data = parseJsonValue(resp.data, `${dataPath} 响应`);
    } catch (cause) {
      // 非 JSON 通常是「错误提示」页：可能是会话失效，也可能是参数被拒——不猜。
      throw ambiguousRejection('列表查询', cause);
    }
    assertGridEnvelope(data, '列表查询');
    const items = recordArray(data.items);
    all.push(...items);
    const total = Number(data?.totalCount) || 0;
    // 先看「服务端说一共有多少」再看「这一页给了多少」：反过来写会让「服务端只回了
    // 一页不足 5000 条、但自称还有更多」的情况被当成请求完毕，静默返回截断的列表。
    if (total > 0 && all.length >= total) break;
    if (items.length === 0 || items.length < GRID_PAGE_SIZE) break;
  }
  return all;
}

/**
 * 列表接口的包裹体契约：`{ items, totalCount }` **两者都要在**。
 *
 * `{"status":910}` 这类拒绝包裹体既没有 items 也没有 totalCount，若不拦下来会被
 * `recordArray(undefined)` 变成空数组，把「请求被拒」伪装成「没有数据」——比直接失败更糟，
 * 因为用户会拿着一个肯定的空结论去做决定。
 *
 * 同样的判定必须用在**非** `postGrid` 的适配器上（课表、已选课程、通知、个人信息、
 * 学业情况、分类明细都曾漏掉这道守卫）。这里导出成公共函数就是为了让它们共用一份规则。
 */
export function assertGridEnvelope(data: unknown, operation: string): void {
  const ok = !!data && typeof data === 'object'
    && 'items' in (data as Record<string, unknown>)
    && 'totalCount' in (data as Record<string, unknown>);
  if (!ok) throw ambiguousRejection(operation, data);
}
