import { NotificationsGateway } from '../application/ports/jwgl-gateway';
import { header, info } from '../lib/logger';
import { printJsonEnvelope, printTable } from '../lib/format';
import { ensureSession, reportCommandError } from './_shared';

export async function notificationsCommand(client: NotificationsGateway, opts: { json?: boolean } = {}): Promise<void> {
  if (!(await ensureSession(client))) return;
  try {
    const items = await client.queryNotifications();
    if (opts.json) {
      printJsonEnvelope('notifications', items);
      return;
    }
    console.log(header('通知 / 待办'));
    if (!items.length) {
      console.log(info('暂无通知或待办事项'));
      return;
    }
    printTable(
      ['时间', '类型', '标题', '内容', '未读'],
      items.map((item) => [item.createdAt, item.type, item.title, item.content, item.unread ? '是' : '否']),
      { maxColWidth: 32 },
    );
  } catch (e: any) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'notifications' });
  }
}
