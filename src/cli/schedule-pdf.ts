import { ScheduleDocumentGateway } from '../application/ports/jwgl-gateway';
import { DocumentStore } from '../application/ports/document-store';
import { saveSchedulePdf } from '../application/usecases/documents';
import { FileDocumentStore } from '../infrastructure/documents/file-document-store';
import { resolveTerm } from '../domain/term';
import { ensureSession, reportCommandError } from './_shared';
import { renderDocumentSaved } from './render/documents';

/**
 * `store` 可注入：生产用默认的文件实现，测试传内存假实现即可覆盖「已存在 → 拒绝覆盖」
 * 这类规则，不必碰真实文件系统。
 */
export async function schedulePdfCommand(
  client: ScheduleDocumentGateway,
  opts: { xnm?: string; xqm?: string; output?: string; force?: boolean },
  store: DocumentStore = new FileDocumentStore(),
): Promise<void> {
  if (!(await ensureSession(client))) return;
  const term = resolveTerm(opts);
  try {
    const saved = await saveSchedulePdf(client, store, { ...term, output: opts.output, force: opts.force });
    renderDocumentSaved('课表 PDF', saved);
  } catch (e) {
    reportCommandError(e, '下载失败');
  }
}
