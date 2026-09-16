/**
 * 班级课表查询命令（bjkbdy，2026-08 抓包实测）
 *
 * 用法：
 *   usts clsched                          # 交互式级联选择
 *   usts clsched -y 2026 -t 3 --jg 204 --zy 0107 --bh 测试班级
 */
import { ClassScheduleGateway } from '../application/ports/jwgl-gateway';
import { concreteTerm, readClassSchedule, resolveClassQueryByFlags } from '../application/usecases/class-schedule';
import { AppError } from '../domain/errors';
import { resolveTerm } from '../domain/term';
import { ensureSession, reportCommandError, assertInteractiveTerminal } from './_shared';
import { interactiveCascade } from './clsched-cascade';
import { renderClassSchedule } from './render/clsched';

export async function clschedCommand(
  client: ClassScheduleGateway,
  opts: { xnm?: string; xqm?: string; xqh?: string; nj?: string; jg?: string; zy?: string; bh?: string },
): Promise<void> {
  // 参数检查放在会话检查之前：不带 --bh 的调用本质上无法在当前环境完成，
  // 与其先跑一趟网络再崩在提示符上，不如直接告诉用户该用哪个参数。
  if (!opts.bh) {
    assertInteractiveTerminal('班级课表的级联选择', '请改用 --jg/--zy/--bh 指定班级');
  }

  if (!(await ensureSession(client))) return;
  const term = concreteTerm(resolveTerm(opts));
  try {
    const options = await client.getBjkbdyOptions();
    if (!options.colleges.length) {
      throw new AppError('PROTOCOL_CHANGED', '未解析到学院列表，班级课表暂不可用');
    }
    const query = opts.bh
      ? await resolveClassQueryByFlags(client, options, opts, term)
      : await interactiveCascade(client, options, term);
    renderClassSchedule(await readClassSchedule(client, query), query, term);
  } catch (e) {
    reportCommandError(e, '查询失败');
  }
}
