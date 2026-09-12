import { AcademiaCategory, AcademiaSummary, GpaSummary } from '../../types/api';
import { cleanHtml, extractVisibleText, matchText, toNumber } from './value';

/**
 * 学业情况页面（`/xsxy/xsxyqk_cxXsxyqkIndex.html`）的纯解析器。
 *
 * 该页面同时承载 GPA 概览与学分分类树，`usts gpa` 与 `usts academia` 只是对
 * 同一份 HTML 做不同取数，因此这里拆成两个互不依赖的纯函数：
 * 一次请求 + 两个解析器，避免为两条命令发两次完全相同的请求。
 */

export function parseGpaSummary(html: string): GpaSummary {
  const visible = cleanHtml(html);
  const texts = extractVisibleText(html);
  // 页面把部分数值写在 <font size="2px"> 里，索引 2 是页面约定的绩点位置
  const fontValues = [...html.matchAll(/<font[^>]*size=["']?2px["']?[^>]*>([\s\S]*?)<\/font>/gi)]
    .map((m) => toNumber(cleanHtml(m[1])))
    .filter((v): v is number => v !== undefined);
  const numbers = (patterns: RegExp[]): number | undefined => {
    for (const pattern of patterns) {
      const m = visible.match(pattern);
      if (!m) continue;
      const n = Number(m[1]);
      if (Number.isFinite(n)) return n;
    }
    return undefined;
  };
  return {
    gpa: numbers([/(?:平均绩点|GPA)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)/i]) ?? fontValues[2],
    averageScore: numbers([/(?:平均分|平均成绩)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)/]),
    totalCredits: numbers([/(?:总学分|计划学分)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)/]),
    earnedCredits: numbers([/(?:获得学分|已修学分|修得学分)[^0-9]{0,30}([0-9]+(?:\.[0-9]+)?)/]),
    rawText: texts,
  };
}

/**
 * 分类树节点在页面源码里是前端 JS 模板拼装出来的，形如
 * `"名称&nbsp;" + i18n(要求学分) + ":N&nbsp;" + i18n(获得学分) + ... + "<span id='showKc<ID>'>"`
 * （原文用 $.i18n.get(...) 调用并带行内注释）。这里按该字面结构做匹配。
 */
const CATEGORY_NODE =
  /"([^"]+?)&nbsp;"\s*\+\s*\$\.i18n\.get\('yqxf'\)\/\* 要求学分 \*\/\s*\+\s*":([0-9.]+)&nbsp;"\s*\+\s*\$\.i18n\.get\('hdxf'\)\/\* 获得学分 \*\/\s*\+\s*":([0-9.]+)&nbsp;&nbsp;"\s*\+\s*\$\.i18n\.get\('whdxf'\)\/\* 未获得学分 \*\/\s*\+\s*":([0-9.]+)&nbsp;"\s*\+\s*"<span id='showKc([^']*)'>/g;

export function parseAcademiaSummary(html: string, fallbackStudentId = ''): AcademiaSummary {
  const text = extractVisibleText(html);
  const sid = matchText(html, /id=["']xh_id["'][^>]*value=["']([^"']+)["']/i) || fallbackStudentId;

  const categories: AcademiaCategory[] = [];
  let m: RegExpExecArray | null;
  while ((m = CATEGORY_NODE.exec(html))) {
    const name = (m[1] || '').trim();
    if (!name || /\$|\.i18n|span|id=/.test(name)) continue;
    categories.push({
      name,
      id: m[5] || undefined,
      requiredCredits: toNumber(m[2]),
      earnedCredits: toNumber(m[3]),
      missingCredits: toNumber(m[4]),
      detailAvailable: !!m[5],
    });
  }

  const summaryText = text.join(' ');
  const stat = (pattern: RegExp): number | undefined => toNumber(matchText(summaryText, pattern));
  return {
    studentId: sid,
    gpa: toNumber(matchText(summaryText, /(?:平均学分绩点（GPA）|平均绩点|GPA)[^0-9]*([0-9]+(?:\.[0-9]+)?)/i)),
    plannedCourses: stat(/计划总课程\s*(\d+)\s*门/),
    passedCourses: stat(/计划总课程\s*\d+\s*门\s*通过\s*(\d+)\s*门/),
    failedCourses: stat(/未通过\s*(\d+)\s*门/),
    unlearnedCourses: stat(/未修\s*(\d+)\s*门/),
    inProgressCourses: stat(/在读\s*(\d+)\s*门/),
    unplannedPassedCourses: stat(/计划外：\s*通过\s*(\d+)\s*门/),
    unplannedFailedCourses: stat(/计划外：\s*通过\s*\d+\s*门，?\s*未通过\s*(\d+)\s*门/),
    categories,
    rawText: text,
  };
}
