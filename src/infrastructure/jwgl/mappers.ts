import {
  AcademiaCourseItem,
  ClassScheduleItem,
  CourseListItem,
  ExamItem,
  ScheduleItem,
  ScoreItem,
  SelectedCourseItem,
} from '../../types/api';
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
