import { SelectedCoursesGateway } from '../application/ports/jwgl-gateway';
import { resolveTerm } from '../domain/term';
import { printJsonEnvelope } from './format';
import { ensureSession, reportCommandError } from './_shared';
import { renderSelectedCourses } from './render/selected-courses';

export async function selectedCoursesCommand(
  client: SelectedCoursesGateway,
  opts: { xnm?: string; xqm?: string; json?: boolean },
): Promise<void> {
  if (!(await ensureSession(client))) return;
  const term = resolveTerm(opts);
  try {
    const items = await client.querySelectedCourses(term.xnm, term.xqm);
    if (opts.json) {
      printJsonEnvelope('selected-courses', items, { xnm: term.xnm, xqm: term.xqm });
      return;
    }
    renderSelectedCourses(items, term);
  } catch (e) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'selected-courses' });
  }
}
