import fs from 'node:fs';
import path from 'node:path';
import { JwglClient } from '../lib/client';
import { error, success } from '../lib/logger';
import { ensureSession, resolveTerm } from './_shared';

export async function schedulePdfCommand(client: JwglClient, opts: { xnm?: string; xqm?: string; output?: string; force?: boolean }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const { xnm, xqm } = resolveTerm(opts);
  const output = opts.output || `schedule-${xnm}-${xqm || 'all'}.pdf`;
  try {
    if (fs.existsSync(output) && !opts.force) throw new Error(`目标文件已存在：${output}（使用 --force 覆盖）`);
    const bytes = await client.downloadSchedulePdf(xnm, xqm);
    const absolute = path.resolve(output);
    const temp = `${absolute}.tmp-${process.pid}`;
    fs.writeFileSync(temp, bytes, { mode: 0o600 });
    fs.renameSync(temp, absolute);
    console.log(success(`课表 PDF 已保存：${absolute}`));
  } catch (e: any) {
    console.error(error(e?.message || '下载失败'));
  }
}
