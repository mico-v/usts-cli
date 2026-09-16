import { header, info, success } from '../logger';
import { ClassScheduleItem, ClassScheduleQuery } from '../../types/schedule';
import { termLabel } from '../../domain/term';
import { ClassTimetable } from '../../application/usecases/class-schedule';

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

function section(range: ClassScheduleItem): string {
  return range.startSection === range.endSection ? `${range.startSection}` : `${range.startSection}~${range.endSection}`;
}

export function renderClassSchedule(
  timetable: ClassTimetable,
  query: ClassScheduleQuery,
  term: { xnm: string; xqm: string },
): void {
  console.log(header(`班级课表查询   ${query.bj} · ${termLabel(term.xnm, term.xqm)}`));
  if (!timetable.courseCount && !timetable.practice.length) {
    console.log(info('该班级暂无课表记录'));
    return;
  }
  for (const { day, items } of timetable.days) {
    console.log(header(DAYS[day - 1]));
    for (const c of items) {
      const teacher = `${c.teacher || ''}${c.teacherTitle ? '(' + c.teacherTitle + ')' : ''}`;
      console.log(
        `  ${section(c)}节  ${c.courseName}  @ ${c.room || '?'}  ${teacher}  ${c.weeks || ''}` +
          (c.credit != null ? `  学分:${c.credit}` : ''),
      );
    }
  }
  if (timetable.untimed.length) {
    console.log(header('其他课程（无固定时间）'));
    for (const c of timetable.untimed) {
      console.log(`  ${c.courseName}  @ ${c.room || '?'}  ${c.teacher || ''}  ${c.weeks || ''}`);
    }
  }
  for (const p of timetable.practice) console.log(info(`实践课：${p}`));
  console.log(success(
    `共 ${timetable.courseCount} 门课` + (timetable.practice.length ? ` · ${timetable.practice.length} 门实践课` : ''),
  ));
}
