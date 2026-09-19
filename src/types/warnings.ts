/**
 * 学业预警（`usts warning`）的稳定结果形状
 *
 * 该页面由服务端直接渲染，不给数据 Action：无预警时是一句结论，有预警时是预警明细表。
 * 因此这里只保留「结构」——表头与单元格文本，不为未经实测的列臆造语义字段。
 */

export interface WarningStatus {
  /** 页面结构里存在预警明细表（有数据行）时为 true；这是**结构判定**，不是关键字匹配 */
  hasWarning: boolean;
  /** 页面上的说明文本（如「当前学年学期暂无预警！」），按出现顺序 */
  messages: string[];
  /** 预警表的列标题；无预警表时为空 */
  headers: string[];
  /** 预警表的单元格文本，与 `headers` 同序 */
  rows: string[][];
}
