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

export function extractVisibleText(html: string): string[] {
  return cleanHtml(html).split(/\s{2,}|\n+/).map((item) => item.trim()).filter(Boolean).slice(0, 200);
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
