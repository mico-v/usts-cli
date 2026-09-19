import { CourseListGateway } from '../application/ports/jwgl-gateway';
import { resolveTerm } from '../domain/term';
import { ensureSession, reportCommandError } from './_shared';
import { renderCourses } from './render/courses';

export async function coursesCommand(client: CourseListGateway, opts: { xnm?: string; xqm?: string }): Promise<void> {
  const term = resolveTerm(opts);
  if (!(await ensureSession(client))) return;
  try {
    renderCourses(await client.queryCourseList(term.xnm, term.xqm), term);
  } catch (e) {
    reportCommandError(e, '查询失败');
  }
}
