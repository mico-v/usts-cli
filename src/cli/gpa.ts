import { GpaGateway } from '../application/ports/jwgl-gateway';
import { readGpa } from '../application/usecases/gpa';
import { printJsonEnvelope } from './format';
import { ensureSession, reportCommandError } from './_shared';
import { renderGpa } from './render/gpa';

export async function gpaCommand(client: GpaGateway, opts: { json?: boolean } = {}): Promise<void> {
  if (!(await ensureSession(client))) return;
  try {
    const view = await readGpa(client);
    if (opts.json) {
      // 稳定契约：仍是 GpaSummary 本身，不是渲染用的 view。
      printJsonEnvelope('gpa', view.summary);
      return;
    }
    renderGpa(view);
  } catch (e) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'gpa' });
  }
}
