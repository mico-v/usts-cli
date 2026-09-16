import { header, info, success } from '../logger';
import { printTable } from '../format';
import { ExamItem } from '../../types/records';
import { termLabel } from '../../domain/term';

export function renderExams(items: ExamItem[], term: { xnm: string; xqm: string }): void {
  console.log(header(`考试信息查询   ${termLabel(term.xnm, term.xqm)}`));
  if (!items.length) {
    console.log(info('该学期暂无考试安排'));
    return;
  }
  printTable(
    ['课程', '考试时间', '考试地点', '座位号', '考试类型'],
    items.map((e) => [e.courseName, e.examTime, e.location, e.seat, e.examType]),
  );
  console.log(success(`共 ${items.length} 条考试记录`));
}
