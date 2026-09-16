import { AcademiaGateway } from '../application/ports/jwgl-gateway';
import { readAcademia } from '../application/usecases/academia';
import { printJsonEnvelope } from './format';
import { ensureSession, reportCommandError } from './_shared';
import { renderAcademia } from './render/academia';

export async function academiaCommand(
  client: AcademiaGateway,
  opts: { json?: boolean; category?: string } = {},
): Promise<void> {
  if (!(await ensureSession(client))) return;
  try {
    const view = await readAcademia(client, { category: opts.category });
    if (opts.json) {
      // 稳定契约：概况发 summary，分类明细发 {category, courses}——与重构前逐字段一致。
      printJsonEnvelope('academia', view.kind === 'category' ? { category: view.category, courses: view.courses } : view.summary);
      return;
    }
    renderAcademia(view);
  } catch (e) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'academia' });
  }
}
