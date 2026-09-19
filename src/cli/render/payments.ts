import { header, info, success } from '../logger';
import { printTable } from '../format';
import { PaymentItem } from '../../types/payments';
import { termLabel } from '../../domain/term';

/** 缴费期限：起止都缺失时留空，不画一个 `- ~ -`。 */
function period(item: PaymentItem): string {
  return item.payStart || item.payEnd ? `${item.payStart || '?'} ~ ${item.payEnd || '?'}` : '';
}

export function renderPayments(items: PaymentItem[], term: { xnm: string; xqm: string }): void {
  console.log(header(`学生缴费   ${termLabel(term.xnm, term.xqm)}`));
  if (!items.length) {
    console.log(info('该学期没有缴费记录'));
    return;
  }
  printTable(
    ['学年', '学期', '类型', '缴费项目', '金额', '状态', '缴费时间', '缴费期限', '订单号'],
    items.map((item) => [
      item.academicYear,
      item.semester,
      item.type,
      item.item,
      item.amount,
      item.status,
      item.paidAt,
      period(item),
      item.orderId,
    ]),
    // 列宽要容得下完整的「起 ~ 止」日期区间（23 字符）：被截断的话就看不到缴费截止日期了，
    // 而那正是这一列存在的意义。
    { maxColWidth: 26 },
  );
  console.log(success(`共 ${items.length} 条缴费记录`));
}
