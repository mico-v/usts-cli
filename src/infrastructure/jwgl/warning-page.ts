import { WarningStatus } from '../../types/warnings';
import { cleanHtml } from './value';

/**
 * 学业预警页解析（纯函数，可离线单测）。
 *
 * 页面由服务端直接渲染，不给数据 Action：`<div class="row clearfix">` 里要么是一句结论
 * （`<h4>当前学年学期暂无预警！</h4>`），要么是预警明细表。
 *
 * 两条设计约束：
 *   - **「有没有预警」按结构判定**（表里有没有数据行），不做中文关键字匹配——文案会改，
 *     而结构变化本身就该报 `PROTOCOL_CHANGED`，不能悄悄退化成「无预警」。
 *   - 列语义不臆造：没有「有预警」账号的实测样本，因此只输出表头与单元格原文，
 *     由渲染层原样成表；等拿到真实样本再收窄成语义字段。
 */

function withoutScripts(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ');
}

/**
 * 页面正文里的说明文本。只取标题与段落，且**不含**表格单元格——
 * 表格内容由 `rows` 承载，混在一起会重复展示。
 */
function messageTexts(html: string): string[] {
  const withoutTables = html.replace(/<table\b[\s\S]*?<\/table>/gi, ' ');
  return [...withoutTables.matchAll(/<(h[1-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi)]
    .map((match) => cleanHtml(match[2]))
    .filter(Boolean);
}

function extractWarningTable(html: string): { headers: string[]; rows: string[][] } {
  const start = html.search(/<table\b/i);
  if (start < 0) return { headers: [], rows: [] };
  const end = html.indexOf('</table>', start);
  const segment = html.slice(start, end < 0 ? undefined : end);
  const headers = [...new Set(
    [...segment.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/gi)].map((match) => cleanHtml(match[1])).filter(Boolean),
  )];
  const rows = [...segment.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((cell) => cleanHtml(cell[1])))
    .filter((cells) => cells.length > 0);
  return { headers, rows };
}

export function parseWarningPage(html: string): WarningStatus {
  const body = withoutScripts(html);
  const messages = messageTexts(body);
  const { headers, rows } = extractWarningTable(body);
  return { hasWarning: rows.length > 0, messages, headers, rows };
}
