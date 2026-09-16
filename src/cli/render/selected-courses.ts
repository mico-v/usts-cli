import { header, info, success } from '../logger';
import { printTable } from '../format';
import { SelectedCourseItem } from '../../types/records';
import { termLabel } from '../../domain/term';

/** 容量/已选：两个字段都没有时留空，而不是画一个 `-/ -`。 */
function capacity(item: SelectedCourseItem): string {
  return item.capacity !== undefined || item.selectedNumber !== undefined
    ? `${item.capacity ?? '-'}/${item.selectedNumber ?? '-'}`
    : '';
}

export function renderSelectedCourses(items: SelectedCourseItem[], term: { xnm: string; xqm: string }): void {
  console.log(header(`已选课程   ${termLabel(term.xnm, term.xqm)}`));
  if (!items.length) {
    console.log(info('该学期暂无已选课程'));
    return;
  }
  printTable(
    ['课程', '课程号', '教学班', '教师', '学分', '容量/已选', '地点', '时间'],
    items.map((item) => [
      item.title,
      item.courseId,
      item.classId,
      item.teacher,
      item.credit?.toString(),
      capacity(item),
      item.place,
      item.time,
    ]),
    { maxColWidth: 28 },
  );
  console.log(success(`共 ${items.length} 门已选课程`));
}
