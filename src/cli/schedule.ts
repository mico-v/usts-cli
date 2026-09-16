import { ScheduleGateway } from '../application/ports/jwgl-gateway';
import { resolveTerm } from '../domain/term';
import { readSchedule } from '../application/usecases/schedule';
import { ensureSession, reportCommandError } from './_shared';
import { renderSchedule } from './render/schedule';

export async function scheduleCommand(client: ScheduleGateway, opts: { xnm?: string; xqm?: string }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const term = resolveTerm(opts);
  try {
    renderSchedule(await readSchedule(client, term), term);
  } catch (e) {
    reportCommandError(e, '查询失败');
  }
}
