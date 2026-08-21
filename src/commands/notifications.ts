import { JwglClient } from '../lib/client';
import { header, info, error } from '../lib/logger';
import { printJson, printTable } from '../lib/format';
import { ensureSession } from './_shared';

export async function notificationsCommand(client: JwglClient, opts: { json?: boolean } = {}): Promise<void> {
  if (!(await ensureSession(client))) return;
  try {
    const items = await client.queryNotifications();
    if (opts.json) {
      printJson(items);
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
    console.error(error(e?.message || '查询失败'));
  }
}
