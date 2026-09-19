import { header, info } from '../logger';
import { printTable } from '../format';
import { GpaField, GpaView } from '../../application/usecases/gpa';

/** 字段 → 中文标签。展示文案归渲染层，用例只给字段名（架构规则 10）。 */
const FIELD_LABELS: Record<GpaField, string> = {
  gpa: '平均绩点',
  averageScore: '平均成绩',
  totalCredits: '总学分',
  earnedCredits: '已修学分',
};

export function renderGpa(view: GpaView): void {
  console.log(header('学业成绩概览'));
  if (!view.rows.length) {
    // 一个字段都没识别出来：如实说明，并把页面原文摊开给用户（--json 也能拿到）。
    console.log(info('页面未识别出结构化 GPA/学分字段，请使用 --json 查看原始文本'));
    const rawText = view.summary.rawText ?? [];
    if (rawText.length) printTable(['页面文本'], rawText.map((v) => [v]));
    return;
  }
  printTable(['项目', '数值'], view.rows.map((row) => [FIELD_LABELS[row.field], row.value]));
}
