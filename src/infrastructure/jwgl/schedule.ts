import { AuthenticatedTransport, FORM_CONTENT_TYPE } from '../http/authenticated-transport';
import { ClassScheduleItem, ClassScheduleQuery, ClassScheduleView, ScheduleItem, SelectOption } from '../../types/api';
import { buildClassScheduleBody, parseBjkbdyOptions } from './class-schedule-page';
import { formBody } from './form';
import { mapClassScheduleItem, mapScheduleItem } from './mappers';
import { assertReadableResponse } from './response-policy';
import { parseJsonValue, recordArray } from './value';

/** 个人课表与班级课表（bjkbdy）端点。 */

/**
 * 个人课表查询（2026-08 抓包实测）：
 *  直接 POST /kbcx/xskbcx_cxXsgrkb.html?gnmkdm=N2151，请求体极简。
 *  返回 { xsxx:{...}, sjkList:[...] }；有固定排课的条目带 xqj(星期)/jc(节次)，
 *  实践课、MOOC 等无固定节次的条目不带，落入“无固定时间”分组。
 */
export async function querySchedule(t: AuthenticatedTransport, xnm = '', xqm = ''): Promise<ScheduleItem[]> {
  const dataPath = '/kbcx/xskbcx_cxXsgrkb.html';
  const resp = await t.requestWithRetry(() =>
    t.http.post(`${dataPath}?gnmkdm=N2151`, formBody({
      xnm, xqm, kzlx: 'ck', xsdm: '', kclbdm: '', kclxdm: '',
    }), {
      headers: {
        Cookie: t.cookieHeader(),
        Referer: `${t.baseUrl}/kbcx/xskbcx_cxXskbcxIndex.html`,
        'Content-Type': FORM_CONTENT_TYPE,
        'X-Requested-With': 'XMLHttpRequest',
      },
    }),
  );
  assertReadableResponse(resp, '课表查询');
  const data: any = parseJsonValue(resp.data, '个人课表响应');
  return recordArray(data?.sjkList).map(mapScheduleItem);
}

/** 解析班级课表视图页里的选单选项（学院/校区/年级内嵌在 HTML 里）。 */
export async function getBjkbdyOptions(t: AuthenticatedTransport): Promise<ClassScheduleView> {
  const path = '/kbdy/bjkbdy_cxBjkbdyIndex.html';
  const resp = await t.requestWithRetry(() =>
    t.http.get(`${path}?gnmkdm=N214505`, {
      headers: { Cookie: t.cookieHeader(), Referer: `${t.baseUrl}${path}` },
    }),
  );
  assertReadableResponse(resp, '班级课表选单解析');
  const html = typeof resp.data === 'string' ? resp.data : String(resp.data);
  return parseBjkbdyOptions(html);
}

/** 专业下拉：comm_cxZydmList.html?jg_id=<学院> */
export async function getMajorsByCollege(t: AuthenticatedTransport, jgId: string): Promise<SelectOption[]> {
  const resp = await t.requestWithRetry(() =>
    t.http.get('/xtgl/comm_cxZydmList.html', {
      params: { jg_id: jgId, zyh_id_cx: '', '_': Date.now(), gnmkdm: 'N214505' },
      headers: { Cookie: t.cookieHeader(), Referer: `${t.baseUrl}/kbdy/bjkbdy_cxBjkbdyIndex.html`, 'X-Requested-With': 'XMLHttpRequest' },
    }),
  );
  assertReadableResponse(resp, '专业列表查询');
  const arr = Array.isArray(resp.data) ? resp.data : (resp.data && resp.data.items) || [];
  return arr.map((m: any) => ({ value: m.zyh_id, label: m.zymc, meta: m }));
}

/** 班级下拉：comm_cxBjdmList.html?jg_id&zyh_id&njdm_id（meta 带 bh 编号/zymc/jgmc/njmc） */
export async function getClassesByMajor(
  t: AuthenticatedTransport,
  jgId: string,
  zyhId: string,
  njdmId: string,
): Promise<SelectOption[]> {
  const resp = await t.requestWithRetry(() =>
    t.http.get('/xtgl/comm_cxBjdmList.html', {
      params: { jg_id: jgId, zyh_id: zyhId, bh_id: '', njdm_id: njdmId, '_': Date.now(), gnmkdm: 'N214505' },
      headers: { Cookie: t.cookieHeader(), Referer: `${t.baseUrl}/kbdy/bjkbdy_cxBjkbdyIndex.html`, 'X-Requested-With': 'XMLHttpRequest' },
    }),
  );
  assertReadableResponse(resp, '班级列表查询');
  const arr = Array.isArray(resp.data) ? resp.data : (resp.data && resp.data.items) || [];
  return arr.map((c: any) => ({ value: c.bh_id, label: c.bj, meta: c }));
}

/** 班级课表查询：POST bjkbdy_cxBjKb.html?gnmkdm=N214505（请求体见 buildClassScheduleBody）。 */
export async function queryClassSchedule(
  t: AuthenticatedTransport,
  q: ClassScheduleQuery,
): Promise<{ items: ClassScheduleItem[]; practice: string[] }> {
  const path = '/kbdy/bjkbdy_cxBjKb.html';
  const resp = await t.requestWithRetry(() =>
    t.http.post(`${path}?gnmkdm=N214505`, buildClassScheduleBody(q), {
      headers: {
        Cookie: t.cookieHeader(),
        Referer: `${t.baseUrl}/kbdy/bjkbdy_cxBjkbdyIndex.html`,
        'Content-Type': FORM_CONTENT_TYPE,
        'X-Requested-With': 'XMLHttpRequest',
      },
    }),
  );
  assertReadableResponse(resp, '班级课表查询');
  const data: any = parseJsonValue(resp.data, '班级课表响应');
  const list = recordArray(data.kbList);
  // 过滤“未排地点”占位条目
  const items = list.filter((it) => it.cdmc && it.cdmc !== '未排地点').map(mapClassScheduleItem);
  const practice: string[] = recordArray(data.sjkList)
    .map((it: any) => it.qtkcgs || it.sjkcgs || '')
    .filter(Boolean);
  return { items, practice };
}
