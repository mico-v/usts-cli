/**
 * 学业成绩概览（GPA）用例
 *
 * 「页面没识别出结构化字段就回落展示原文」是协议退化规则，不是排版细节，因此放在这里。
 * view 里仍带着原始 `summary`：`--json` 输出的是**稳定契约**（字段不能因为重构而改变），
 * 因此命令层从 view 里取它，而不是另发一次请求。
 *
 * 统计项只给**字段名**，不给中文标签——标签是展示，属于 `cli/render/gpa.ts`。
 */
import { GpaSummary } from '../../types/academia';
import { GpaGateway } from '../ports/jwgl-gateway';

/** 概况里会被单独列出来的字段（顺序即展示顺序）。 */
export type GpaField = 'gpa' | 'averageScore' | 'totalCredits' | 'earnedCredits';

const GPA_FIELDS: GpaField[] = ['gpa', 'averageScore', 'totalCredits', 'earnedCredits'];

export interface GpaView {
  summary: GpaSummary;
  /** 识别出的字段与值，只含远端真有值的项 */
  rows: { field: GpaField; value: string }[];
}

export async function readGpa(client: GpaGateway): Promise<GpaView> {
  const summary: GpaSummary = await client.queryGpa();
  const rows = GPA_FIELDS
    .map((field) => ({ field, value: summary[field]?.toString() }))
    .filter((row): row is { field: GpaField; value: string } => Boolean(row.value));

  return { summary, rows };
}
