import { AcademiaCourseItem } from '../../types/academia';
import { FreeClassroom } from '../../types/facilities';
import { MinorScheduleEntry } from '../../types/minor-programs';
import { PaymentItem } from '../../types/payments';
import { PlanCourse, PlanEntry } from '../../types/planning';
import { CourseListItem, ExamItem, ScoreItem, SelectedCourseItem } from '../../types/records';
import { ClassScheduleItem, ScheduleItem } from '../../types/schedule';
import { assertHasAnyField, cleanHtml, matchText, parseSections, RawRecord, toNumber } from './value';

function pickRaw(item: RawRecord, keys: string[]): string {
  for (const key of keys) {
    const value = item[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '';
}

export function mapScoreItem(item: RawRecord): ScoreItem {
  assertHasAnyField(item, ['kcmc', 'kch'], '成绩条目');
  return {
    courseName: item.kcmc || '',
    courseCode: item.kch || '',
    courseNature: item.kcxzmc || '',
    credit: toNumber(item.xf),
    score: item.cj ?? '',
    gpa: toNumber(item.jd),
    college: item.jgmc || '',
    teacher: item.jsxm || '',
    assessMethod: item.khfsmc || '',
    examType: item.ksxz || '',
    academicYear: item.xnmmc || '',
    semester: item.xqmmc || '',
    className: item.bj || '',
    major: item.zymc || '',
    teachingClass: item.jxbmc || '',
  };
}

export function mapScheduleItem(item: RawRecord): ScheduleItem {
  assertHasAnyField(item, ['kcmc', 'jxbzh'], '课表条目');
  const sections = parseSections(item.jc);
  return {
    courseName: item.kcmc || '',
    teacher: item.jsxm || undefined,
    className: item.jxbzh || undefined,
    campus: item.xqmc || undefined,
    credit: toNumber(item.xf),
    weeks: item.qsjsz || undefined,
    courseType: item.kclb || undefined,
    assessMethod: item.khfsmc || undefined,
    academicYear: item.xnmc || '',
    weekday: toNumber(item.xqj),
    startSection: sections.start,
    endSection: sections.end,
  };
}

export function mapClassScheduleItem(item: RawRecord): ClassScheduleItem {
  assertHasAnyField(item, ['kcmc', 'jxbmc'], '班级课表条目');
  const sections = parseSections(item.jcor || item.jcs);
  return {
    courseName: item.kcmc || '',
    teacher: item.xm || undefined,
    teacherTitle: item.zcmc || undefined,
    jxbmc: item.jxbmc || undefined,
    jxbzc: item.jxbzc || undefined,
    campus: item.xqmc || undefined,
    room: item.cdmc || undefined,
    credit: toNumber(item.xf),
    weeks: item.zcd || undefined,
    assessMethod: item.khfsmc || undefined,
    courseNature: item.kcxzjc || undefined,
    weekday: toNumber(item.xqj),
    startSection: sections.start,
    endSection: sections.end,
  };
}

/**
 * 考试信息。字段因校而异，按候选键取第一个非空值。
 * （原先这段 `pick` 逻辑复制在命令层，映射模式与成绩/课表不一致，已收敛到这里。）
 */
export function mapExamItem(item: RawRecord): ExamItem {
  assertHasAnyField(item, ['kcmc', 'kchmc'], '考试条目');
  return {
    courseName: pickRaw(item, ['kcmc', 'kchmc']),
    examTime: pickRaw(item, ['kssj', 'kssjmc', 'ksrq', 'kssj_str']),
    location: pickRaw(item, ['cdmc', 'jsmc', 'jsbh', 'kcdd', 'cdmcxx']),
    seat: pickRaw(item, ['zwh', 'kxh', 'zwhh', 'zw']),
    examType: pickRaw(item, ['ksxzmc', 'ksxz', 'kslxmc', 'kslbmc']),
  };
}

/** 选课名单。教师字段是 `jsmc`（不是 `jsxm`）。 */
export function mapCourseListItem(item: RawRecord): CourseListItem {
  assertHasAnyField(item, ['kcmc', 'kchmc'], '选课名单条目');
  return {
    courseName: pickRaw(item, ['kcmc', 'kchmc']),
    courseCode: pickRaw(item, ['kch', 'kcbh', 'kcdm']),
    credit: pickRaw(item, ['xf']),
    teacher: pickRaw(item, ['jsmc', 'jsxx', 'jsxm', 'rkjs']),
    teachingClass: pickRaw(item, ['jxbmc', 'jxbdm', 'xkb']),
  };
}

export function mapSelectedCourseItem(item: RawRecord): SelectedCourseItem {
  assertHasAnyField(item, ['kcmc', 'kchmc', 'kch_id'], '已选课程条目');
  return {
    courseId: item.kch_id ?? item.kch,
    classId: item.jxb_id ?? item.jxbid,
    title: item.kcmc ?? item.kchmc,
    teacher: matchText(item.jsxx, /\/([^/]+)\//) ?? item.jsmc ?? item.jsxm,
    credit: toNumber(item.xf),
    category: item.kklxmc ?? item.kclbmc,
    capacity: toNumber(item.jxbrs),
    selectedNumber: toNumber(item.yxzrs),
    place: cleanHtml(item.jxdd),
    time: cleanHtml(item.sksj),
  };
}

export function mapAcademiaCourseItem(item: RawRecord): AcademiaCourseItem {
  assertHasAnyField(item, ['KCMC', 'KCH'], '学业课程条目');
  return {
    courseId: item.KCH || '',
    title: item.KCMC || '',
    credit: toNumber(item.XF),
    category: item.KCLBMC || '',
    nature: item.KCXZMC || '',
    grade: item.CJ ?? '',
    maxGrade: item.MAXCJ ?? '',
    gpa: toNumber(item.JD),
    displayTerm: [item.JYXDXNMC, item.JYXDXQMC].filter(Boolean).join('·'),
    planned: item.SFJHKC === '是',
  };
}

/** 空闲场地。只映射页面真正会展示的列（`kszws1` 等设施字段在实测响应里时有时无）。 */
export function mapFreeClassroom(item: RawRecord): FreeClassroom {
  assertHasAnyField(item, ['cdmc', 'cdbh'], '空闲场地条目');
  return {
    code: item.cdbh || undefined,
    name: item.cdmc || '',
    category: item.cdlbmc || undefined,
    campus: item.xqmc || undefined,
    building: item.jxlmc || undefined,
    seats: toNumber(item.zws),
    borrowable: item.sfkjy || undefined,
  };
}

export function mapPlanEntry(item: RawRecord): PlanEntry {
  assertHasAnyField(item, ['jxzxjhxx_id', 'zymc'], '执行计划条目');
  return {
    id: item.jxzxjhxx_id || undefined,
    grade: item.njmc || undefined,
    majorCode: item.zyh || undefined,
    major: item.zymc || undefined,
    category: item.dlbs || undefined,
    taskClass: item.rwbj || undefined,
    plannedStudents: toNumber(item.jhrs),
    campus: item.xqmc || undefined,
    courseCount: toNumber(item.kcs),
    totalCredits: toNumber(item.zdxf),
    schoolLength: item.xz || undefined,
  };
}

/** 执行计划课程明细；建议修读学期优先用网页拼好的 `yyxdxnxqmc`。 */
export function mapPlanCourse(item: RawRecord): PlanCourse {
  assertHasAnyField(item, ['kch', 'kcmc'], '执行计划课程条目');
  const suggestedTerm = pickRaw(item, ['yyxdxnxqmc']) || [item.jyxdxnm, item.jyxdxqm].filter(Boolean).join('/');
  return {
    code: item.kch || undefined,
    name: item.kcmc || undefined,
    credit: toNumber(item.xf),
    hours: toNumber(item.zxs),
    nature: item.kcxzmc || undefined,
    category: item.kclbmc || undefined,
    suggestedTerm: suggestedTerm || undefined,
    assessMethod: item.khfsdm || undefined,
    department: item.kkbmmc || undefined,
  };
}

/** 缴费记录。金额按原样保留（`500.00` 的位数是账单信息的一部分，不做数值归一）。 */
export function mapPaymentItem(item: RawRecord): PaymentItem {
  assertHasAnyField(item, ['zfywsj_ids', 'order_name'], '缴费条目');
  return {
    academicYear: item.xnmc || undefined,
    semester: item.xqmc || undefined,
    type: item.ywmc || undefined,
    item: item.order_name || undefined,
    amount: pickRaw(item, ['order_amount']) || undefined,
    status: item.sfqr || undefined,
    paidAt: item.pay_time || undefined,
    orderId: item.order_id || undefined,
    payStart: item.jfkssj || undefined,
    payEnd: item.jfjssj || undefined,
  };
}

/** 微专业/辅修课表列表条目（网页只展示学院/年级/专业/课表名称四列）。 */
export function mapMinorScheduleEntry(item: RawRecord): MinorScheduleEntry {
  assertHasAnyField(item, ['tjkbmc', 'zymc'], '微专业课表条目');
  return {
    college: item.jgmc || undefined,
    grade: item.njmc || undefined,
    major: item.zymc || undefined,
    name: item.tjkbmc || undefined,
  };
}
