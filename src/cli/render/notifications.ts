import { header, info } from '../logger';
import { printTable } from '../format';
import { NotificationItem } from '../../types/records';

export function renderNotifications(items: NotificationItem[]): void {
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
}
