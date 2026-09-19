import { ExamsGateway } from '../application/ports/jwgl-gateway';
import { resolveTerm } from '../domain/term';
import { ensureSession, reportCommandError } from './_shared';
import { renderExams } from './render/exams';

export async function examsCommand(client: ExamsGateway, opts: { xnm?: string; xqm?: string }): Promise<void> {
  const term = resolveTerm(opts);
  if (!(await ensureSession(client))) return;
  try {
    renderExams(await client.queryExams(term.xnm, term.xqm), term);
  } catch (e) {
    reportCommandError(e, '查询失败');
  }
}
