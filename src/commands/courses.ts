import { JwglClient } from '../lib/client';
import { header, info, error, success } from '../lib/logger';
import { printTable } from '../lib/format';
import { ensureSession, termLabel, resolveTerm } from './_shared';

function pick(obj: any, keys: string[]): string {
  for (const k of keys) if (obj[k] !== undefined && obj[k] !== null && obj[k] !== '') return String(obj[k]);
  return '';
}

export async function coursesCommand(client: JwglClient, opts: { xnm?: string; xqm?: string }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const { xnm, xqm } = resolveTerm(opts);
  console.log(header(`选课名单查询   ${termLabel(xnm, xqm)}`));
  try {
    const items = await client.queryCourseList(xnm, xqm);
    if (!items.length) {
      console.log(info('该学期暂无选课记录'));
      return;
    }
    printTable(
      ['课程', '课程代码', '学分', '教师', '教学班'],
      items.map((c: any) => [
        pick(c, ['kcmc', 'kchmc']),
        pick(c, ['kch', 'kcbh', 'kcdm']),
        pick(c, ['xf']),
        pick(c, ['jsmc', 'jsxx', 'jsxm', 'rkjs']),
        pick(c, ['jxbmc', 'jxbdm', 'xkb']),
      ]),
    );
    console.log(success(`共 ${items.length} 条选课记录`));
  } catch (e: any) {
    console.error(error(e?.message || '查询失败'));
  }
}
