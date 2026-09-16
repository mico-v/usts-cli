import { ScoresGateway } from '../application/ports/jwgl-gateway';
import { resolveTerm } from '../domain/term';
import { readScores } from '../application/usecases/scores';
import { ensureSession, reportCommandError } from './_shared';
import { renderScores } from './render/scores';

export async function scoresCommand(
  client: ScoresGateway,
  opts: { xnm?: string; xqm?: string; kcxzdm?: string },
): Promise<void> {
  if (!(await ensureSession(client))) return;
  const term = resolveTerm(opts);
  try {
    renderScores(await readScores(client, { ...term, kcxzdm: opts.kcxzdm }), term);
  } catch (e) {
    reportCommandError(e, '查询失败');
  }
}
