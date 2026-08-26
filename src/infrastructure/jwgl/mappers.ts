import {
  AcademiaCourseItem,
  ClassScheduleItem,
  ScheduleItem,
  ScoreItem,
  SelectedCourseItem,
} from '../../types/api';
import { assertHasAnyField, cleanHtml, matchText, parseSections, RawRecord, toNumber } from './value';

export function mapScoreItem(item: RawRecord): ScoreItem {
  assertHasAnyField(item, ['kcmc', 'kch'], '成绩条目');
  return {
    courseName: item.kcmc || '',
    courseCode: item.kch || '',
    courseNature: item.kcxzmc || '',
    credit: toNumber(item.xf),
    score: item.cj ?? '',
    score100: item.bfzcj ?? '',
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
    roomType: item.cdlbmc || undefined,
    credit: toNumber(item.xf),
    totalHours: toNumber(item.kczxs),
    weeks: item.zcd || undefined,
    assessMethod: item.khfsmc || undefined,
    courseNature: item.kcxzjc || undefined,
    weekday: toNumber(item.xqj),
    startSection: sections.start,
    endSection: sections.end,
  };
}

export function mapSelectedCourseItem(item: RawRecord): SelectedCourseItem {
  assertHasAnyField(item, ['kcmc', 'kchmc', 'kch_id'], '已选课程条目');
  return {
    courseId: item.kch_id ?? item.kch,
    classId: item.jxb_id ?? item.jxbid,
    executionId: item.do_jxb_id ?? item.dojxbid,
    title: item.kcmc ?? item.kchmc,
    teacherId: matchText(item.jsxx, /([0-9]+)\s*\//),
    teacher: matchText(item.jsxx, /\/([^/]+)\//) ?? item.jsmc ?? item.jsxm,
    credit: toNumber(item.xf),
    category: item.kklxmc ?? item.kclbmc,
    capacity: toNumber(item.jxbrs),
    selectedNumber: toNumber(item.yxzrs),
    place: cleanHtml(item.jxdd),
    time: cleanHtml(item.sksj),
    optional: item.zixf === 1 || item.zixf === '1' || item.zixf === true,
    waiting: item.sxbj,
    raw: item,
  };
}

export function mapAcademiaCourseItem(item: RawRecord): AcademiaCourseItem {
  assertHasAnyField(item, ['KCMC', 'KCH'], '学业课程条目');
  return {
    courseId: item.KCH || '',
    title: item.KCMC || '',
    englishTitle: item.KCYWMC || '',
    status: item.XDZT != null ? String(item.XDZT) : undefined,
    credit: toNumber(item.XF),
    category: item.KCLBMC || '',
    nature: item.KCXZMC || '',
    grade: item.CJ ?? '',
    maxGrade: item.MAXCJ ?? '',
    gpa: toNumber(item.JD),
    displayTerm: [item.JYXDXNMC, item.JYXDXQMC].filter(Boolean).join('·'),
    planned: item.SFJHKC === '是',
    hours: item.XSXXXX || '',
    raw: item,
  };
}
