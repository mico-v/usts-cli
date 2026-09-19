/**
 * 命令行输出样式配置
 */

import { sanitizeTerminalText } from '../shared/sanitize';

export const STYLES = {
  // 颜色
  colors: {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m',
  },

  // 符号
  symbols: {
    success: '✓',
    error: '✗',
    warning: '⚠',
    info: 'ℹ',
    loading: '◐',
    arrow: '→',
    bullet: '•',
  },
};

export type Color = keyof typeof STYLES.colors;

/**
 * 是否给**这个流**上色。
 *
 * 必须按流判断：原来写成「stderr 或 stdout 有一个是终端就上色」，于是
 * `usts scores | cat`（stdout 被重定向、stderr 还是终端）会把 ANSI 转义码写进管道和
 * 文件里。反过来 stdout 是终端、stderr 被重定向时也要照常上色。
 */
function colorEnabled(stream: NodeJS.WriteStream): boolean {
  if (process.env.NO_COLOR !== undefined) return false;
  return !!stream.isTTY;
}

/** 面向人类的单行输出：按 stdout 判断是否上色。 */
export function color(text: string, c: Color): string {
  const safe = sanitizeTerminalText(text);
  if (!colorEnabled(process.stdout)) return safe;
  return `${STYLES.colors[c]}${safe}${STYLES.colors.reset}`;
}

/**
 * 面向诊断/错误的单行输出：按 stderr 判断是否上色。
 *
 * 与 `color` 分开是因为两者可能一个被重定向、一个是终端（管道场景很常见），
 * 用同一个开关必然有一边是错的。
 */
export function colorForStderr(text: string, c: Color): string {
  const safe = sanitizeTerminalText(text);
  if (!colorEnabled(process.stderr)) return safe;
  return `${STYLES.colors[c]}${safe}${STYLES.colors.reset}`;
}

export function success(text: string): string {
  return color(`${STYLES.symbols.success} ${text}`, 'green');
}

export function error(text: string): string {
  return colorForStderr(`${STYLES.symbols.error} ${text}`, 'red');
}

export function warning(text: string): string {
  return colorForStderr(`${STYLES.symbols.warning} ${text}`, 'yellow');
}

export function info(text: string): string {
  return color(`${STYLES.symbols.info} ${text}`, 'cyan');
}

export function header(text: string): string {
  return color(`\n${STYLES.symbols.arrow} ${text}`, 'bold');
}
