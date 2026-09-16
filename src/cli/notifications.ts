import { NotificationsGateway } from '../application/ports/jwgl-gateway';
import { printJsonEnvelope } from './format';
import { ensureSession, reportCommandError } from './_shared';
import { renderNotifications } from './render/notifications';

export async function notificationsCommand(client: NotificationsGateway, opts: { json?: boolean } = {}): Promise<void> {
  if (!(await ensureSession(client))) return;
  try {
    const items = await client.queryNotifications();
    if (opts.json) {
      printJsonEnvelope('notifications', items);
      return;
    }
    renderNotifications(items);
  } catch (e) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'notifications' });
  }
}
