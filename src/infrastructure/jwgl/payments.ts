import { AuthenticatedTransport } from '../http/authenticated-transport';
import { PaymentItem } from '../../types/payments';
import { postGrid } from './grid';
import { mapPaymentItem } from './mappers';

/**
 * 学生缴费查询（paycenter，gnmkdm N0185，2026-09 实测：契约合法，本学期无应缴记录）。
 *
 * **只读**。「释放缴费中订单」「生成订单」「支付」「退费申请」等接口
 * （`paycenter_cxCreateOrder`/`paycenter_buildOrder`/`paycenter_cxPayChooseIndex`…）
 * 涉及金钱与不可逆副作用，明确排除在只读 CLI 之外。
 */
export async function queryPayments(
  t: AuthenticatedTransport,
  xnm = '',
  xqm = '',
): Promise<PaymentItem[]> {
  const items = await postGrid(t, '/paycenter/paycenter_cxGrjfIndex.html', 'N0185', { xnm, xqm });
  return items.map(mapPaymentItem);
}
