/**
 * 学业情况用例
 *
 * 两条路径共用一个入口：不带 `--category` 看概况，带则看某个分类的课程明细。
 * 「按分类名子串匹配、匹配不到时列出可用分类、汇总节点没有明细」都是接口语义，
 * 不属于展示，因此在这里判定并抛出稳定错误码。
 */
import { AcademiaCategory, AcademiaCourseItem, AcademiaSummary } from '../../types/academia';
import { AppError } from '../../domain/errors';
import { AcademiaGateway } from '../ports/jwgl-gateway';

/** 概况里的统计项（只保留远端真有值的项，名称是稳定契约，渲染层不再判断）。 */
export interface AcademiaStat {
  label: string;
  value: number;
}

export interface AcademiaOverview {
  kind: 'overview';
  summary: AcademiaSummary;
  stats: AcademiaStat[];
}

export interface AcademiaCategoryDetail {
  kind: 'category';
  category: AcademiaCategory;
  courses: AcademiaCourseItem[];
}

export type AcademiaView = AcademiaOverview | AcademiaCategoryDetail;

const STAT_LABELS: [keyof AcademiaSummary, string][] = [
  ['plannedCourses', '计划总课程'],
  ['passedCourses', '已通过课程'],
  ['failedCourses', '未通过课程'],
  ['unlearnedCourses', '未修课程'],
  ['inProgressCourses', '在读课程'],
  ['unplannedPassedCourses', '计划外已通过'],
  ['unplannedFailedCourses', '计划外未通过'],
];

function toStats(summary: AcademiaSummary): AcademiaStat[] {
  const stats: AcademiaStat[] = [];
  for (const [key, label] of STAT_LABELS) {
    const value = summary[key];
    if (typeof value === 'number') stats.push({ label, value });
  }
  return stats;
}

/** 按分类名子串匹配；匹配不到时把可用分类列给用户（而不是让用户猜）。 */
export function matchCategory(categories: AcademiaCategory[], keyword: string): AcademiaCategory | null {
  const kw = keyword.trim();
  return categories.find((category) => category.name.includes(kw)) || null;
}

export async function readAcademia(
  client: AcademiaGateway,
  options: { category?: string } = {},
): Promise<AcademiaView> {
  const summary = await client.queryAcademia();

  if (options.category) {
    const category = matchCategory(summary.categories, options.category);
    if (!category || !category.id) {
      throw new AppError(
        'CONFIGURATION_ERROR',
        `未找到匹配的分类「${options.category.trim()}」。可用分类：\n  ${summary.categories.map((c) => c.name).join('\n  ')}`,
      );
    }
    return { kind: 'category', category, courses: await client.queryAcademiaCategory(category.id) };
  }

  return { kind: 'overview', summary, stats: toStats(summary) };
}
