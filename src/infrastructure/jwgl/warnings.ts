import { AuthenticatedTransport } from '../http/authenticated-transport';
import { WarningStatus } from '../../types/warnings';
import { ambiguousRejection, assertReadableResponse } from './response-policy';
import { parseWarningPage } from './warning-page';

/**
 * 学业预警查询（xyyjjk，gnmkdm N305516，2026-09 实测）。
 *
 * 视图页 `GET /xyyjjk/xyyjclcx_cxXyyjclcxxsIndex.html?gnmkdm=N305516` **直接渲染结论**
 * （无预警时正文就是一句「当前学年学期暂无预警！」），没有数据 Action。
 */
const WARNING_PATH = '/xyyjjk/xyyjclcx_cxXyyjclcxxsIndex.html';

export async function queryWarning(t: AuthenticatedTransport): Promise<WarningStatus> {
  const resp = await t.requestWithRetry(() =>
    t.http.get(`${WARNING_PATH}?gnmkdm=N305516`, {
      headers: { Cookie: t.cookieHeader(), Referer: `${t.baseUrl}${WARNING_PATH}` },
    }),
  );
  assertReadableResponse(resp, '学业预警查询');
  const html = typeof resp.data === 'string' ? resp.data : String(resp.data);
  const status = parseWarningPage(html);
  // 既没有提示文本也没有预警表 = 页面结构变了。不能当成「没有预警」返回，
  // 那会把一次解析失败伪装成一个肯定的结论。
  if (!status.hasWarning && !status.messages.length) {
    throw ambiguousRejection('学业预警查询', html.slice(0, 200));
  }
  return status;
}
