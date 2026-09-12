import { ExamsGateway } from '../application/ports/jwgl-gateway';
import { header, info, success } from '../lib/logger';
import { printTable } from '../lib/format';
import { ensureSession, termLabel, resolveTerm, reportCommandError } from './_shared';

export async function examsCommand(client: ExamsGateway, opts: { xnm?: string; xqm?: string }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const { xnm, xqm } = resolveTerm(opts);
  console.log(header(`考试信息查询   ${termLabel(xnm, xqm)}`));
  try {
    const items = await client.queryExams(xnm, xqm);
    if (!items.length) {
      console.log(info('该学期暂无考试安排'));
      return;
    }
    printTable(
      ['课程', '考试时间', '考试地点', '座位号', '考试类型'],
      items.map((e) => [e.courseName, e.examTime, e.location, e.seat, e.examType]),
    );
    console.log(success(`共 ${items.length} 条考试记录`));
  } catch (e: any) {
    reportCommandError(e, '查询失败');
  }
}
