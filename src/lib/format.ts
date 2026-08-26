// 简单的命令行表格输出工具
// 按“终端显示宽度”对齐：全角/中日韩字符占 2 列，兼容 ANSI 颜色码，超出列宽按显示宽度截断。

import { sanitizeTerminalText } from '../shared/sanitize';

const ANSI_RE = /\x1b\[[0-9;]*m/g;

/** 去除 ANSI 颜色码 */
function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '');
}

/** 终端显示宽度：中日韩/全角字符按 2 列计，其余按 1 列 */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of stripAnsi(s)) {
    // east-asian wide / fullwidth 区间
    w += /[ᄀ-ᅟ⺀-〿ぁ-㏿㐀-䶿一-鿿ꀀ-꓏가-힣豈-﫿ﷀ-﷿︰-﹏＀-｠￠-￦]/.test(ch)
      ? 2
      : 1;
  }
  return w;
}

/** 按显示宽度右侧补齐空格 */
export function padEndWidth(s: string, width: number): string {
  const pad = width - displayWidth(s);
  return pad > 0 ? s + ' '.repeat(pad) : s;
}

/** 按显示宽度截断，超出部分用省略号 … 表示 */
export function truncateWidth(s: string, maxWidth: number): string {
  if (displayWidth(s) <= maxWidth) return s;
  let w = 0;
  let out = '';
  for (const ch of stripAnsi(s)) {
    const cw = displayWidth(ch);
    if (w + cw + 1 > maxWidth) break; // 预留 1 列给省略号
    out += ch;
    w += cw;
  }
  return out + '…';
}

export function printTable(headers: string[], rows: (string | undefined)[][], opts: { maxColWidth?: number } = {}): void {
  const maxColWidth = opts.maxColWidth ?? 24;
  const cols = headers.length;
  const widths: number[] = new Array(cols).fill(0);
  const norm = (s: string | undefined) => sanitizeTerminalText(s === undefined || s === null ? '' : String(s));
  const normRows = rows.map((r) => headers.map((_, i) => truncateWidth(norm(r[i]), maxColWidth)));
  headers.forEach((h, i) => (widths[i] = Math.max(widths[i], displayWidth(truncateWidth(h, maxColWidth)))));
  normRows.forEach((r) => r.forEach((c, i) => (widths[i] = Math.max(widths[i], displayWidth(c)))));

  const sep = '+' + widths.map((w) => '-'.repeat(w + 2)).join('+') + '+';
  const fmt = (cells: string[]) => '|' + cells.map((c, i) => ' ' + padEndWidth(c, widths[i]) + ' ').join('|') + '|';

  console.log(sep);
  console.log(fmt(headers.map((h) => truncateWidth(h, maxColWidth))));
  console.log(sep);
  for (const r of normRows) console.log(fmt(r));
  if (normRows.length) console.log(sep);
  if (!normRows.length) console.log('（无数据）');
}

/** 输出机器可读 JSON；不要在调用前打印带 ANSI 的标题或提示。 */
export function printJson(value: unknown): void {
  console.log(JSON.stringify(value, (key, item) => {
    if (key === 'raw') return undefined;
    return item === undefined ? null : item;
  }, 2));
}

export interface JsonEnvelope<T> {
  schemaVersion: 1;
  command: string;
  data: T;
  meta?: Record<string, unknown>;
  warnings: string[];
}

export function printJsonEnvelope<T>(command: string, data: T, meta?: Record<string, unknown>): void {
  printJson({ schemaVersion: 1, command, data, ...(meta ? { meta } : {}), warnings: [] } satisfies JsonEnvelope<T>);
}
