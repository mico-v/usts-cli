import { AuthenticatedTransport } from '../http/authenticated-transport';
import { MinorProgramKind, MinorScheduleEntry, MinorScheduleQuery } from '../../types/minor-programs';
import { CascadeOptions } from '../../types/schedule';
import { postGrid } from './grid';
import { mapMinorScheduleEntry } from './mappers';
import { assertReadableResponse } from './response-policy';
import { parseCascadeOptions } from './select-options';

/**
 * 微专业 / 辅修 / 二学位课表（kbdy2，gnmkdm N214556，2026-09 实测）。
 *
 * 视图页 `GET /kbdy2/fxzykbdy_cxFxzyKbdyIndex.html?kklxdm=<02|03|04>`，列表
 * `POST /kbdy2/fxzykbdy_cxFxzyKbdyTjkbList.html?doType=query&gnmkdm=N214556`。
 *
 * `kklxdm` 是课表类型的数字编码，**只在本模块出现**：`02` 微专业（主界面「微专业课表打印」
 * 的入口值）、`03` 二学位、`04` 辅修（取自网页显示字段配置的 `kbzl=ezy/exw/fx`）。
 *
 * 注意：本轮实测账号没有微专业数据（列表返回合法空 `{items,totalCount}`），
 * 因此**列表字段只按网页 colModel 映射**（学院/年级/专业/课表名称），未做实测校验。
 */

const VIEW_PATH = '/kbdy2/fxzykbdy_cxFxzyKbdyIndex.html';
const LIST_PATH = '/kbdy2/fxzykbdy_cxFxzyKbdyTjkbList.html';

const KIND_CODES: Record<MinorProgramKind, string> = {
  'micro-major': '02',
  'dual-degree': '03',
  minor: '04',
};

export function kindCode(kind: MinorProgramKind): string {
  return KIND_CODES[kind];
}

/** 视图页的选单；三个下拉与数据 Action 同名前缀（`jg_id`/`njdm_id`/`zyh_id`）。 */
export async function getMinorScheduleOptions(
  t: AuthenticatedTransport,
  kind: MinorProgramKind,
): Promise<CascadeOptions> {
  const path = `${VIEW_PATH}?kklxdm=${kindCode(kind)}`;
  const resp = await t.requestWithRetry(() =>
    t.http.get(`${path}&gnmkdm=N214556`, {
      headers: { Cookie: t.cookieHeader(), Referer: `${t.baseUrl}${path}` },
    }),
  );
  assertReadableResponse(resp, '微专业课表选单解析');
  const html = typeof resp.data === 'string' ? resp.data : String(resp.data);
  return parseCascadeOptions(html, { college: 'jg_id', grade: 'njdm_id', major: 'zyh_id' });
}

export async function queryMinorSchedules(
  t: AuthenticatedTransport,
  query: MinorScheduleQuery,
): Promise<MinorScheduleEntry[]> {
  const items = await postGrid(t, LIST_PATH, 'N214556', {
    xnm: query.xnm,
    xqm: query.xqm,
    kklxdm: kindCode(query.kind),
    jg_id: query.collegeId || '',
    njdm_id: query.gradeId || '',
    zyh_id: query.majorId || '',
    zs: '',
  });
  return items.map(mapMinorScheduleEntry);
}
