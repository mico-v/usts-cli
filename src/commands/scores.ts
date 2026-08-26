import { ScoresGateway } from '../application/ports/jwgl-gateway';
import { header, info, success } from '../lib/logger';
import { printTable } from '../lib/format';
import { ensureSession, semesterLabel, academicYearLabel, termLabel, resolveTerm, reportCommandError } from './_shared';

export async function scoresCommand(client: ScoresGateway, opts: { xnm?: string; xqm?: string; kcxzdm?: string }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const { xnm, xqm } = resolveTerm(opts);
  // 先用请求参数给出标题，查询后用接口返回的真实学年/学期名覆盖
  let label = termLabel(xnm, xqm);
  try {
    const extra: Record<string, string> = opts.kcxzdm ? { kcxzdm: opts.kcxzdm } : {};
    const items = await client.queryScores(xnm, xqm, extra);
    if (!items.length) {
      console.log(header(`学生成绩查询   ${label}`));
      console.log(info('该学期暂无成绩记录'));
      return;
    }
    const first = items[0];
    label = `${academicYearLabel(xnm, first.academicYear)} 学年 · ${semesterLabel(first.semester)}`;
    console.log(header(`学生成绩查询   ${label}`));
    printTable(
      ['学期', '课程', '性质', '学分', '成绩', '绩点', '教师', '开课学院'],
      items.map((s) => [
        semesterLabel(s.semester), s.courseName, s.courseNature, s.credit?.toString(), s.score, s.gpa?.toString(), s.teacher, s.college,
      ]),
    );
    const totalCredit = items.reduce((a, s) => a + (s.credit || 0), 0);
    console.log(success(`共 ${items.length} 门课程 · 学分合计 ${totalCredit}`));
  } catch (e: any) {
    reportCommandError(e, '查询失败');
  }
}
