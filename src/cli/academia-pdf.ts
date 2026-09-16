import { AcademiaDocumentGateway } from '../application/ports/jwgl-gateway';
import { DocumentStore } from '../application/ports/document-store';
import { saveAcademiaPdf } from '../application/usecases/documents';
import { FileDocumentStore } from '../infrastructure/documents/file-document-store';
import { ensureSession, reportCommandError } from './_shared';
import { renderDocumentSaved } from './render/documents';

/** `store` 可注入，理由同 `schedule-pdf`。 */
export async function academiaPdfCommand(
  client: AcademiaDocumentGateway,
  opts: { output?: string; force?: boolean },
  store: DocumentStore = new FileDocumentStore(),
): Promise<void> {
  if (!(await ensureSession(client))) return;
  try {
    renderDocumentSaved('成绩总表 PDF', await saveAcademiaPdf(client, store, opts));
  } catch (e) {
    reportCommandError(e, '下载失败');
  }
}
