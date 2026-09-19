import { PlanGateway } from '../application/ports/jwgl-gateway';
import { readPlan } from '../application/usecases/plan';
import { printJsonEnvelope } from './format';
import { ensureSession, reportCommandError } from './_shared';
import { renderPlan } from './render/plan';

/** 终端一次显示多少条执行计划；0 = 不限。`--json` 不受它影响。 */
export const DEFAULT_PLAN_LIMIT = 20;

export interface PlanOptions {
  all?: boolean;
  college?: string;
  grade?: string;
  major?: string;
  course?: string | boolean;
  limit?: number;
  json?: boolean;
}

export async function planCommand(client: PlanGateway, opts: PlanOptions): Promise<void> {
  if (!(await ensureSession(client, { json: opts.json, command: "plan" }))) return;
  try {
    const view = await readPlan(client, {
      all: opts.all,
      college: opts.college,
      grade: opts.grade,
      major: opts.major,
      course: opts.course,
    });
    if (opts.json) {
      printJsonEnvelope('plan', { entries: view.entries, courses: view.courses }, {
        scope: {
          college: view.scope.college?.label,
          grade: view.scope.grade?.label,
          major: view.scope.major?.label,
        },
        ...(view.courseCode === undefined ? {} : { course: view.courseCode }),
      });
      return;
    }
    renderPlan(view, { all: opts.all, limit: opts.limit ?? DEFAULT_PLAN_LIMIT });
  } catch (e) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'plan' });
  }
}
