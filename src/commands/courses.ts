import { CourseListGateway } from '../application/ports/jwgl-gateway';
import { header, info, success } from '../lib/logger';
import { printTable } from '../lib/format';
import { ensureSession, termLabel, resolveTerm, reportCommandError } from './_shared';

export async function coursesCommand(client: CourseListGateway, opts: { xnm?: string; xqm?: string }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const { xnm, xqm } = resolveTerm(opts);
  console.log(header(`选课名单查询   ${termLabel(xnm, xqm)}`));
  try {
    const items = await client.queryCourseList(xnm, xqm);
    if (!items.length) {
      console.log(info('该学期暂无选课记录'));
      return;
    }
    printTable(
      ['课程', '课程代码', '学分', '教师', '教学班'],
      items.map((c) => [c.courseName, c.courseCode, c.credit, c.teacher, c.teachingClass]),
    );
    console.log(success(`共 ${items.length} 条选课记录`));
  } catch (e: any) {
    reportCommandError(e, '查询失败');
  }
}
