import { AppError } from '../../domain/errors';

export type RawRecord = Record<string, any>;

export function toNumber(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const match = String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return undefined;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : undefined;
}

export function parseSections(value: unknown): { start?: number; end?: number } {
  const match = String(value ?? '').match(/(\d+)\s*[-~]\s*(\d+)/);
  return match ? { start: Number(match[1]), end: Number(match[2]) } : {};
}

export function parseJsonValue(value: unknown, context = '响应'): any {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value || '{}');
  } catch (cause) {
    throw new AppError('PROTOCOL_CHANGED', `${context}不是有效 JSON`, { cause });
  }
}

export function cleanHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>(\s*)/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 页面可见文本的粗略切分。
 *
 * `cleanHtml` 已经把连续空白折成单个空格，所以在它**之后**再按 `\s{2,}` 切分永远切不开——
 * 整页会变成一条字符串，`--json` 里的 `rawText` 就成了 1.4MB 的单元素数组，终端兜底展示
 * 还会被 `printTable` 的列宽截成 24 个字符。
 *
 * 正确做法是先在**原始 HTML** 上按块级边界切分，再逐块清洗：这样得到的是可读的多条文本，
 * 而不是一整页。条数上限保留，避免异常巨大的页面把内存和输出撑爆。
 */
export function extractVisibleText(html: string): string[] {
  const blocks = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .split(/<\/(?:p|div|h[1-6]|li|tr|td|th|section|article|header|footer)>|<br\s*\/?>/i);
  return blocks.map(cleanHtml).filter(Boolean).slice(0, 200);
}

export function matchText(value: unknown, pattern: RegExp): string | undefined {
  const match = String(value ?? '').match(pattern);
  return match?.[1]?.trim() || undefined;
}

export function recordArray(value: unknown): RawRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RawRecord => !!item && typeof item === 'object' && !Array.isArray(item));
}

export function assertHasAnyField(record: RawRecord, fields: string[], context: string): void {
  if (fields.some((field) => record[field] !== undefined && record[field] !== null)) return;
  throw new AppError('PROTOCOL_CHANGED', `${context}缺少预期字段：${fields.join('/')}`);
}
