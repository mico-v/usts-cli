import { JwglClient } from '../lib/client';
import { header, info, error, success } from '../lib/logger';
import { ensureSession, termLabel, resolveTerm } from './_shared';

const DAYS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

export async function scheduleCommand(client: JwglClient, opts: { xnm?: string; xqm?: string }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const { xnm, xqm } = resolveTerm(opts);
  console.log(header(`个人课表查询   ${termLabel(xnm, xqm)}`));
  try {
    const items = await client.querySchedule(xnm, xqm);
    if (!items.length) {
      console.log(info('该学期暂无课表记录'));
      return;
    }
    // 有具体排课时间（weekday 有值）的条目按星期+节次分组展示
    const timed = items.filter((i) => i.weekday && i.startSection);
    const untimed = items.filter((i) => !(i.weekday && i.startSection));

    for (let d = 1; d <= 7; d++) {
      const today = timed.filter((i) => i.weekday === d);
      if (!today.length) continue;
      console.log(header(DAYS[d - 1]));
      for (const c of today.sort((a, b) => a.startSection! - b.startSection!)) {
        console.log(
          `  ${String(c.startSection).padStart(2)}~${String(c.endSection).padEnd(2)}节  ` +
            `${c.courseName}  @ ${c.campus || '?'} ${c.className || ''}  ${c.teacher || ''}  ${c.weeks || ''}`,
        );
      }
    }

    // 其余（如 MOOC/实践类未排固定节次）单独列出
    if (untimed.length) {
      console.log(header('其他课程（无固定时间）'));
      for (const c of untimed) {
        console.log(
          `  ${c.courseName}  @ ${c.campus || '?'} ${c.className || ''}  ${c.teacher || ''}  ` +
            `${c.weeks || ''}  学分:${c.credit ?? '-'}  ${c.courseType || ''}  ${c.assessMethod || ''}`,
        );
      }
    }
    console.log(success(`共 ${items.length} 条课程记录`));
  } catch (e: any) {
    console.error(error(e?.message || '查询失败'));
  }
}
