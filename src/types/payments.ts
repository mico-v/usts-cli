/**
 * 学生缴费查询（`usts payment`）的稳定结果形状
 *
 * 只覆盖「查询」：缴费/释放订单/生成订单等写操作不在只读 CLI 的范围内。
 * 远端字段名只允许出现在 `infrastructure/jwgl`；字段注释标出来源，方便追查。
 */

export interface PaymentItem {
  academicYear?: string; // 学年 xnmc
  semester?: string;     // 学期 xqmc
  type?: string;         // 类型 ywmc（如 学费/住宿费）
  item?: string;         // 缴费项目 order_name
  amount?: string;       // 金额（元）order_amount，按原样保留小数位
  status?: string;       // 缴费状态 sfqr（如 已缴费/未缴费）
  paidAt?: string;       // 缴费时间 pay_time
  orderId?: string;      // 订单号 order_id
  payStart?: string;     // 缴费开始时间 jfkssj
  payEnd?: string;       // 缴费结束时间 jfjssj
}
