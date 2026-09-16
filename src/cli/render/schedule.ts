import { header, info, success } from '../logger';
import { ScheduleItem } from '../../types/schedule';
import { termLabel } from '../../domain/term';
import { ScheduleView } from '../../application/usecases/schedule';

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/** 无固定节次的课程（实践课、MOOC 等）比有固定节次的多几个展示字段。 */
function untimedLine(item: ScheduleItem): string {
  return `  ${item.courseName}  @ ${item.campus || '?'} ${item.className || ''}  ${item.teacher || ''}  ` +
    `${item.weeks || ''}  学分:${item.credit ?? '-'}  ${item.courseType || ''}  ${item.assessMethod || ''}`;
}

export function renderSchedule(view: ScheduleView, term: { xnm: string; xqm: string }): void {
  console.log(header(`个人课表查询   ${termLabel(term.xnm, term.xqm)}`));
  if (!view.total) {
    console.log(info('该学期暂无课表记录'));
    return;
  }
  for (const { day, items } of view.days) {
    console.log(header(DAYS[day - 1]));
    for (const c of items) {
      console.log(
        `  ${String(c.startSection).padStart(2)}~${String(c.endSection).padEnd(2)}节  ` +
          `${c.courseName}  @ ${c.campus || '?'} ${c.className || ''}  ${c.teacher || ''}  ${c.weeks || ''}`,
      );
    }
  }
  if (view.untimed.length) {
    console.log(header('其他课程（无固定时间）'));
    for (const c of view.untimed) console.log(untimedLine(c));
  }
  console.log(success(`共 ${view.total} 条课程记录`));
}
