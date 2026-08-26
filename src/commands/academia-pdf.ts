import fs from 'node:fs';
import path from 'node:path';
import { AcademiaDocumentGateway } from '../application/ports/jwgl-gateway';
import { success } from '../lib/logger';
import { ensureSession, reportCommandError } from './_shared';
import { AppError } from '../domain/errors';

export async function academiaPdfCommand(client: AcademiaDocumentGateway, opts: { output?: string; force?: boolean }): Promise<void> {
  if (!(await ensureSession(client))) return;
  const output = opts.output || 'transcript.pdf';
  try {
    if (fs.existsSync(output) && !opts.force) throw new AppError('FILE_SYSTEM_ERROR', `目标文件已存在：${output}（使用 --force 覆盖）`);
    const bytes = await client.downloadAcademiaPdf();
    const absolute = path.resolve(output);
    const temp = `${absolute}.tmp-${process.pid}`;
    fs.writeFileSync(temp, bytes, { mode: 0o600 });
    fs.renameSync(temp, absolute);
    console.log(success(`成绩总表 PDF 已保存：${absolute}`));
  } catch (e: any) {
    reportCommandError(e, '下载失败');
  }
}
