import { ExamsGateway } from '../application/ports/jwgl-gateway';
import { header, info, success } from '../lib/logger';
import { printTable } from '../lib/format';
import { ensureSession, termLabel, resolveTerm, reportCommandError } from './_shared';

// 考试信息字段因校而异，做防御性映射：命中任一候选键即采用
function pick(obj: any, keys: string[]): string {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return String(obj[k]);
  return '';
}

export async function examsCommand(client: ExamsGateway, opts: { xnm?: string; xqm?: string }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const { xnm, xqm } = resolveTerm(opts);
  console.log(header(`考试信息查询   ${termLabel(xnm, xqm)}`));
  try {
    const items = await client.queryExams(xnm, xqm);
    if (!items.length) {
      console.log(info('该学期暂无考试安排'));
      return;
    }
    printTable(
      ['课程', '考试时间', '考试地点', '座位号', '考试类型'],
      items.map((e: any) => [
        pick(e, ['kcmc', 'kchmc', 'kcmc']),
        pick(e, ['kssj', 'kssjmc', 'ksrq', 'kssj_str']),
        pick(e, ['cdmc', 'jsmc', 'jsbh', 'kcdd', 'cdmcxx']),
        pick(e, ['zwh', 'kxh', 'zwhh', 'zw']),
        pick(e, ['ksxzmc', 'ksxz', 'kslxmc', 'kslbmc']),
      ]),
    );
    console.log(success(`共 ${items.length} 条考试记录`));
  } catch (e: any) {
    reportCommandError(e, '查询失败');
  }
}
