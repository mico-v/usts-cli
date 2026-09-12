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
    // 契约要求 { items, totalCount }；`{"status":910}` 这类拒绝包裹体既没有 items
    // 也没有 totalCount，若不拦下来会被当成「空结果」，把失败伪装成「没有数据」。
    if (!data || typeof data !== 'object' || (!('items' in data) && !('totalCount' in data))) {
      throw ambiguousRejection('列表查询', data);
    }
    const items = recordArray(data.items);
    all.push(...items);
    const total = Number(data?.totalCount) || 0;
    if (items.length === 0 || items.length < GRID_PAGE_SIZE) break;
    if (total > 0 && all.length >= total) break;
  }
  return all;
}
