/**
 * PDF 下载用例
 *
 * 「缺省文件名怎么起」「默认不覆盖已有文件」是规则，放在这里；落盘交给 `DocumentStore`，
 * 终端提示交给 `cli/render/documents.ts`。
 *
 * 覆盖判定**先于**下载：目标已存在时应当立刻报错，而不是先跑完正方那条多步生成链
 * （慢且吃 WAF 配额）再告诉用户写不进去。
 */
import { AppError } from '../../domain/errors';
import { DocumentStore } from '../ports/document-store';
import { AcademiaDocumentGateway, ScheduleDocumentGateway } from '../ports/jwgl-gateway';

/** 成绩总表 PDF 的缺省文件名（交互式菜单需要它作为输入框默认值）。 */
export const DEFAULT_ACADEMIA_PDF_NAME = 'transcript.pdf';

/** 课表 PDF 的缺省文件名：带学年/学期，避免不同学期的课表互相覆盖。 */
export function defaultSchedulePdfName(xnm: string, xqm: string): string {
  return `schedule-${xnm}-${xqm || 'all'}.pdf`;
}

function requireWritable(store: DocumentStore, destination: string, force?: boolean): void {
  if (!force && store.exists(destination)) {
    throw new AppError('FILE_SYSTEM_ERROR', `目标文件已存在：${destination}（使用 --force 覆盖）`);
  }
}

export async function saveSchedulePdf(
  client: ScheduleDocumentGateway,
  store: DocumentStore,
  opts: { xnm: string; xqm: string; output?: string; force?: boolean },
): Promise<string> {
  const destination = opts.output || defaultSchedulePdfName(opts.xnm, opts.xqm);
  requireWritable(store, destination, opts.force);
  const bytes = await client.downloadSchedulePdf(opts.xnm, opts.xqm);
  return store.write(destination, bytes);
}

export async function saveAcademiaPdf(
  client: AcademiaDocumentGateway,
  store: DocumentStore,
  opts: { output?: string; force?: boolean } = {},
): Promise<string> {
  const destination = opts.output || DEFAULT_ACADEMIA_PDF_NAME;
  requireWritable(store, destination, opts.force);
  const bytes = await client.downloadAcademiaPdf();
  return store.write(destination, bytes);
}
