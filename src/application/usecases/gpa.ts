/**
 * 学业成绩概览（GPA）用例
 *
 * 「页面没识别出结构化字段就回落展示原文」是协议退化规则，不是排版细节，因此放在这里。
 * view 里仍带着原始 `summary`：`--json` 输出的是**稳定契约**（字段不能因为重构而改变），
 * 因此命令层从 view 里取它，而不是另发一次请求。
 */
import { GpaSummary } from '../../types/academia';
import { GpaGateway } from '../ports/jwgl-gateway';

export interface GpaView {
  summary: GpaSummary;
  /** 识别出的字段（标签/数值），只含真有值的项 */
  rows: [label: string, value: string][];
}

export async function readGpa(client: GpaGateway): Promise<GpaView> {
  const summary: GpaSummary = await client.queryGpa();
  const rows = ([
    ['平均绩点', summary.gpa?.toString()],
    ['平均成绩', summary.averageScore?.toString()],
    ['总学分', summary.totalCredits?.toString()],
    ['已修学分', summary.earnedCredits?.toString()],
  ] as [string, string | undefined][]).filter((row): row is [string, string] => Boolean(row[1]));

  return { summary, rows };
}
