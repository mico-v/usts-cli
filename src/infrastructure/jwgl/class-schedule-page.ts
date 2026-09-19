import { ClassScheduleQuery, ClassScheduleView } from '../../types/schedule';
import { academicYearName, displaySemester } from '../../domain/term';
import { parseSelect, selectedValue, toSelectOptions } from './select-options';

/**
 * 班级课表（bjkbdy）的纯解析与请求体构造。
 * 与 HTTP 无关，便于用脱敏夹具做契约测试。
 */

/** 视图页内嵌的学院/校区/年级/培养层次下拉；专业/班级需另经 comm_* 接口级联加载。 */
export function parseBjkbdyOptions(html: string): ClassScheduleView {
  const grades = parseSelect(html, 'njdm_id');
  const campuses = parseSelect(html, 'xqh_id');
  return {
    colleges: toSelectOptions(parseSelect(html, 'jg_id')),
    campuses: toSelectOptions(campuses),
    grades: toSelectOptions(grades),
    defaultGrade: selectedValue(grades),
    defaultCampus: selectedValue(campuses),
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
    xqh_id: q.campusId, njdm_id: q.gradeId, zyh_id: q.majorId, bh_id: q.classId,
    tjkbzdm: '1', tjkbzxsdm: '0',
    zymc: q.majorName, jgmc: q.collegeName, njmc: q.gradeName, bj: q.className, bh: q.classNumber,
    jsxm: '', lxdh: '', zs: '', zxszjjs: 'false',
    xsdm: '', kclxdm: '', kclbdm: '', kbsjlyqz: '', yf: '',
    kzlx: 'ck',
  }).toString();
}
