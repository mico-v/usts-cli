import { ClassScheduleQuery, ClassScheduleView, SelectOption } from '../../types/schedule';
import { academicYearName, displaySemester } from '../../domain/term';

/**
 * 班级课表（bjkbdy）的纯解析与请求体构造。
 * 与 HTTP 无关，便于用脱敏夹具做契约测试。
 */

/** 视图页内嵌的学院/校区/年级/培养层次下拉；专业/班级需另经 comm_* 接口级联加载。 */
export function parseBjkbdyOptions(html: string): ClassScheduleView {
  const grab = (name: string): { value: string; label: string; selected: boolean }[] => {
    const i = html.indexOf(`name="${name}"`);
    if (i < 0) return [];
    const end = html.indexOf('</select>', i);
    const seg = html.slice(i, end < 0 ? i + 400 : end);
    return [...seg.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)]
      .map((o) => ({
        value: (o[1].match(/value="([^"]*)"/) || [])[1] || '',
        label: o[2].trim(),
        selected: /selected/.test(o[1]),
      }))
      .filter((o) => o.value);
  };
  const toOpt = (list: { value: string; label: string }[]): SelectOption[] =>
    list.map((o) => ({ value: o.value, label: o.label }));
  const grades = grab('njdm_id');
  const campuses = grab('xqh_id');
  return {
    colleges: toOpt(grab('jg_id')),
    campuses: toOpt(campuses),
    grades: toOpt(grades),
    defaultGrade: grades.find((o) => o.selected)?.value || '',
    defaultCampus: campuses.find((o) => o.selected)?.value || '',
  };
}

/**
 * 班级课表查询请求体。
 * 关键：`bh` 必须是班级**编号**（如 2520401000）且与 `bh_id` 对应，
 * 传班级名会返回空 `kbList`；`xb` 描述字段（zymc/jgmc/bj/njmc）也要带齐。
 */
export function buildClassScheduleBody(q: ClassScheduleQuery): string {
  return new URLSearchParams({
    xnm: q.xnm, xqm: q.xqm,
    xnmc: academicYearName(q.xnm),
    xqmmc: displaySemester(q.xqm),
    xqh_id: q.xqhId, njdm_id: q.njdmId, zyh_id: q.zyhId, bh_id: q.bhId,
    tjkbzdm: '1', tjkbzxsdm: '0',
    zymc: q.zymc, jgmc: q.jgmc, njmc: q.njmc, bj: q.bj, bh: q.bh,
    jsxm: '', lxdh: '', zs: '', zxszjjs: 'false',
    xsdm: '', kclxdm: '', kclbdm: '', kbsjlyqz: '', yf: '',
    kzlx: 'ck',
  }).toString();
}
