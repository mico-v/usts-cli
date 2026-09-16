import { AuthenticatedTransport, FORM_CONTENT_TYPE } from '../http/authenticated-transport';
import { ProfileInfo } from '../../types/identity';
import { CourseListItem, ExamItem, NotificationItem, ScoreItem, SelectedCourseItem } from '../../types/records';
import { isAmbiguousRejection, isAppError } from '../../domain/errors';
import { postGrid } from './grid';
import { formBody } from './form';
import { parseProfilePage } from './profile-page';
import { mapCourseListItem, mapExamItem, mapScoreItem, mapSelectedCourseItem } from './mappers';
import { assertReadableResponse } from './response-policy';
import { parseJsonValue, RawRecord, recordArray } from './value';

/** 成绩、考试、选课名单、已选课程、通知、个人信息这些「记录型」端点。 */

/**
 * 学生成绩查询。主接口被拒/改版时自动回退到备用接口 `cjcx_cxDgXscj.html`
 * （2026-08 实测可用）。
 */
export async function queryScores(
  t: AuthenticatedTransport,
  xnm = '',
  xqm = '',
  extra: Record<string, string> = {},
): Promise<ScoreItem[]> {
  let items: RawRecord[];
  try {
    items = await postGrid(t, '/cjcx/cjcx_cxXsgrcj.html', 'N305005', { xnm, xqm, ...extra });
  } catch (cause) {
    // 只在主接口**真的改版/被拒**时回退。两类错误必须原样抛出：
    //   - 会话类错误：交给 withReauth 探测确认并重放，回退会让重放边界失效
    //   - 空结果是正常情况（新学期就是没成绩），不该为它多发一次请求
    if (!isAppError(cause) || cause.code !== 'PROTOCOL_CHANGED' || isAmbiguousRejection(cause)) throw cause;
    items = await postGrid(t, '/cjcx/cjcx_cxDgXscj.html', 'N305005', { xnm, xqm, ...extra });
  }
  return items.map(mapScoreItem);
}

/** 考试信息查询（真实 action 带 Index 后缀，2026-08 实测） */
export async function queryExams(t: AuthenticatedTransport, xnm = '', xqm = ''): Promise<ExamItem[]> {
  return (await postGrid(t, '/kwgl/kscx_cxXsksxxIndex.html', 'N358105', { xnm, xqm })).map(mapExamItem);
}

/** 选课名单查询（真实 action 带 Index 后缀，2026-08 实测） */
export async function queryCourseList(t: AuthenticatedTransport, xnm = '', xqm = ''): Promise<CourseListItem[]> {
  return (await postGrid(t, '/xkcx/xkmdcx_cxXkmdcxIndex.html', 'N255010', { xnm, xqm })).map(mapCourseListItem);
}

/** 查询已选课程；当前项目只保留查询接口，不实现选课/退课。 */
export async function querySelectedCourses(
  t: AuthenticatedTransport,
  xnm = '',
  xqm = '',
): Promise<SelectedCourseItem[]> {
  const path = '/xsxk/zzxkyzb_cxZzxkYzbChoosedDisplay.html';
  const resp = await t.requestWithRetry(() => t.http.post(`${path}?gnmkdm=N253512`, formBody({ xkxnm: xnm, xkxqm: xqm }), {
    headers: t.formHeaders(`${t.baseUrl}/xsxk/zzxkyzb_cxZzxkYzbIndex.html`),
  }));
  assertReadableResponse(resp, '已选课程查询');
  const data: any = parseJsonValue(resp.data, '已选课程响应');
  return recordArray(Array.isArray(data) ? data : data?.items).map(mapSelectedCourseItem);
}

/**
 * 首页待办/通知查询（只读）。
 *
 * 注意：该接口是本项目唯一不带 gnmkdm 的 grid 调用，是实测可用的原样形态；
 * 若要补 gnmkdm 必须先抓包确认，否则会被服务端拒绝。字段按 USTS 返回做防御性映射。
 */
export async function queryNotifications(t: AuthenticatedTransport): Promise<NotificationItem[]> {
  const path = '/xtgl/index_cxDbsy.html';
  const resp = await t.requestWithRetry(() => t.http.post(`${path}?doType=query`, formBody({
    sfyy: '0', flag: '1', _search: 'false', nd: String(Date.now()),
    'queryModel.showCount': '1000', 'queryModel.currentPage': '1',
    'queryModel.sortName': 'cjsj', 'queryModel.sortOrder': 'desc', time: '0',
  }), {
    headers: {
      Cookie: t.cookieHeader(),
      Referer: `${t.baseUrl}/xtgl/index_initMenu.html`,
      'Content-Type': FORM_CONTENT_TYPE,
      'X-Requested-With': 'XMLHttpRequest',
    },
  }));
  assertReadableResponse(resp, '通知查询');
  const data: any = parseJsonValue(resp.data, '通知响应');
  const list = recordArray(Array.isArray(data) ? data : data?.items);
  return list.map((it: any) => {
    const content = String(it.xxnr ?? it.content ?? '');
    const title = String(it.xxbt ?? it.title ?? it.bt ?? '');
    return {
      title,
      type: it.type ?? it.lx ?? undefined,
      content,
      createdAt: it.cjsj ?? it.createTime ?? it.sj,
      unread: it.sfyy === '1' || it.sfyy === 1 || it.isRead === false,
    };
  });
}

/**
 * 个人信息详情页（GET，解析 标签→值 结构）。
 * `username` 只用于拼 `su`，缺失时省略该参数（服务端按会话识别用户）。
 * 学号的「学习」与持久化属于会话状态，留在 façade 里做。
 */
export async function fetchProfile(t: AuthenticatedTransport, username: string): Promise<ProfileInfo> {
  const params = new URLSearchParams({ gnmkdm: 'N100801' });
  if (username) params.set('su', username);
  const resp = await t.requestWithRetry(() =>
    t.http.get(`/xsxxxggl/xsgrxxwh_cxXsgrxx.html?${params.toString()}`, {
      headers: { Cookie: t.cookieHeader(), Referer: `${t.baseUrl}/xtgl/index_initMenu.html` },
    }),
  );
  assertReadableResponse(resp, '个人信息查询');
  const html: string = typeof resp.data === 'string' ? resp.data : String(resp.data);
  return parseProfilePage(html, username);
}
