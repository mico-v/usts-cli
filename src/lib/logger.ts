/**
 * 命令行输出样式配置
 */

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

export function color(text: string, c: Color): string {
  return `${STYLES.colors[c]}${text}${STYLES.colors.reset}`;
}

export function success(text: string): string {
  return color(`${STYLES.symbols.success} ${text}`, 'green');
}

export function error(text: string): string {
  return color(`${STYLES.symbols.error} ${text}`, 'red');
}

export function warning(text: string): string {
  return color(`${STYLES.symbols.warning} ${text}`, 'yellow');
}

export function info(text: string): string {
  return color(`${STYLES.symbols.info} ${text}`, 'cyan');
}

export function header(text: string): string {
  return color(`\n${STYLES.symbols.arrow} ${text}`, 'bold');
}
