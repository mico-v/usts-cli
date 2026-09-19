import { PaymentGateway } from '../application/ports/jwgl-gateway';
import { resolveTerm } from '../domain/term';
import { printJsonEnvelope } from './format';
import { ensureSession, reportCommandError } from './_shared';
import { renderPayments } from './render/payments';

export interface PaymentOptions {
  xnm?: string;
  xqm?: string;
  json?: boolean;
}

/**
 * 学生缴费查询（只读）。
 *
 * 只做查询：支付、释放订单、生成订单、退费申请等写接口一律不实现——涉及金钱与
 * 不可逆副作用，不属于只读 CLI 的范围。
 */
export async function paymentCommand(client: PaymentGateway, opts: PaymentOptions): Promise<void> {
  const term = resolveTerm(opts);
  if (!(await ensureSession(client, { json: opts.json, command: "payment" }))) return;
  try {
    const items = await client.queryPayments(term.xnm, term.xqm);
    if (opts.json) {
      printJsonEnvelope('payment', items, { xnm: term.xnm, xqm: term.xqm });
      return;
    }
    renderPayments(items, term);
  } catch (e) {
    reportCommandError(e, '查询失败', { json: opts.json, command: 'payment' });
  }
}
