import { WarningGateway } from '../application/ports/jwgl-gateway';
import { printJsonEnvelope } from './format';
import { ensureSession, reportCommandError } from './_shared';
import { renderWarning } from './render/warnings';

export async function warningCommand(client: WarningGateway, opts: { json?: boolean }): Promise<void> {
  if (!(await ensureSession(client, { json: opts.json, command: "warning" }))) return;
  try {
    const status = await client.queryWarning();
    if (opts.json) {
      printJsonEnvelope('warning', status);
      return;
    }
    renderWarning(status);
  } catch (e) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'warning' });
  }
}
