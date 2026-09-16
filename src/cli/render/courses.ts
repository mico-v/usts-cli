import { header, info, success } from '../logger';
import { printTable } from '../format';
import { CourseListItem } from '../../types/records';
import { termLabel } from '../../domain/term';

export function renderCourses(items: CourseListItem[], term: { xnm: string; xqm: string }): void {
  console.log(header(`选课名单查询   ${termLabel(term.xnm, term.xqm)}`));
  if (!items.length) {
    console.log(info('该学期暂无选课记录'));
    return;
  }
  printTable(
    ['课程', '课程代码', '学分', '教师', '教学班'],
    items.map((c) => [c.courseName, c.courseCode, c.credit, c.teacher, c.teachingClass]),
  );
  console.log(success(`共 ${items.length} 条选课记录`));
}
