import { MinorScheduleGateway } from '../application/ports/jwgl-gateway';
import { readMinorSchedules } from '../application/usecases/minor-schedule';
import { resolveTerm } from '../domain/term';
import { printJsonEnvelope } from './format';
import { ensureSession, reportCommandError } from './_shared';
import { renderMinorSchedule } from './render/minor-schedule';

export interface MinorScheduleOptions {
  xnm?: string;
  xqm?: string;
  kind?: string;
  college?: string;
  grade?: string;
  major?: string;
  json?: boolean;
}

export async function minorScheduleCommand(
  client: MinorScheduleGateway,
  opts: MinorScheduleOptions,
): Promise<void> {
  const term = resolveTerm(opts);
  if (!(await ensureSession(client, { json: opts.json, command: "minor-schedule" }))) return;
  try {
    const view = await readMinorSchedules(client, {
      xnm: term.xnm,
      xqm: term.xqm,
      kind: opts.kind,
      college: opts.college,
      grade: opts.grade,
      major: opts.major,
    });
    if (opts.json) {
      printJsonEnvelope('minor-schedule', view.entries, {
        xnm: term.xnm,
        xqm: term.xqm,
        kind: view.kind.name,
        scope: {
          college: view.scope.college?.label,
          grade: view.scope.grade?.label,
          major: view.scope.major?.label,
        },
      });
      return;
    }
    renderMinorSchedule(view, term);
  } catch (e) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'minor-schedule' });
  }
}
