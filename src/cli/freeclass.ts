import { FreeClassroomGateway } from '../application/ports/jwgl-gateway';
import { readFreeClassrooms } from '../application/usecases/free-classrooms';
import { resolveTerm } from '../domain/term';
import { printJsonEnvelope } from './format';
import { ensureSession, reportCommandError } from './_shared';
import { renderFreeClassrooms } from './render/free-classrooms';

/** 终端一次显示多少间场地；0 = 不限。`--json` 不受它影响（机器可读输出始终是全集）。 */
export const DEFAULT_FREE_CLASSROOM_LIMIT = 50;

export interface FreeClassOptions {
  xnm?: string;
  xqm?: string;
  week?: string;
  weekday?: string;
  section?: string;
  campus?: string;
  type?: string;
  building?: string;
  name?: string;
  minSeats?: number;
  limit?: number;
  json?: boolean;
}

export async function freeClassCommand(client: FreeClassroomGateway, opts: FreeClassOptions): Promise<void> {
  const term = resolveTerm(opts);
  if (!(await ensureSession(client, { json: opts.json, command: "freeclass" }))) return;
  try {
    const view = await readFreeClassrooms(client, {
      xnm: term.xnm,
      xqm: term.xqm,
      week: opts.week,
      weekday: opts.weekday,
      section: opts.section,
      campus: opts.campus,
      type: opts.type,
      building: opts.building,
      name: opts.name,
      minSeats: opts.minSeats,
    });
    if (opts.json) {
      printJsonEnvelope('freeclass', view.items, {
        xnm: term.xnm,
        xqm: term.xqm,
        // 时段过滤前的场地总数：能回答「这间教室是真的空闲，还是被名称条件筛掉了」
        serverTotal: view.total,
        criteria: view.criteria,
      });
      return;
    }
    renderFreeClassrooms(view, term, opts.limit ?? DEFAULT_FREE_CLASSROOM_LIMIT);
  } catch (e) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'freeclass' });
  }
}
