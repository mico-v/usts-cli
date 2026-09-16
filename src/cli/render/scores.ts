/**
 * 成绩查询的终端渲染
 *
 * 只吃用例返回的 view，不碰网关——所以可以在进程内直接断言输出，不需要假服务器。
 * 标题里的学年/学期名优先用接口返回的真实名字（`xnmmc`/`xqmmc`），拿不到时才按请求参数推。
 */
import { header, info, success } from '../logger';
import { printTable } from '../format';
import { academicYearLabel, semesterLabel, termLabel } from '../../domain/term';
import { ScoresView } from '../../application/usecases/scores';

export function renderScores(view: ScoresView, term: { xnm: string; xqm: string }): void {
  if (!view.items.length) {
    console.log(header(`学生成绩查询   ${termLabel(term.xnm, term.xqm)}`));
    console.log(info('该学期暂无成绩记录'));
    return;
  }
  const first = view.items[0];
  console.log(header(
    `学生成绩查询   ${academicYearLabel(term.xnm, first.academicYear)} 学年 · ${semesterLabel(first.semester)}`,
  ));
  printTable(
    ['学期', '课程', '性质', '学分', '成绩', '绩点', '教师', '开课学院'],
    view.items.map((s) => [
      semesterLabel(s.semester), s.courseName, s.courseNature, s.credit?.toString(), s.score, s.gpa?.toString(), s.teacher, s.college,
    ]),
  );
  console.log(success(`共 ${view.items.length} 门课程 · 学分合计 ${view.totalCredit}`));
}
