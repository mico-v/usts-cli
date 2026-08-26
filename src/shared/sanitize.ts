const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const ANSI_ESCAPE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;

/** 防止远端文本向终端注入控制序列；换行和制表符保留。 */
export function sanitizeTerminalText(value: unknown): string {
  return String(value ?? '').replace(ANSI_ESCAPE, '').replace(CONTROL_CHARACTERS, '');
}

export function redactSecret(value: string): string {
  return value
    .replace(/((?:cookie|set-cookie|password|csrftoken|jsessionid)\s*[:=]\s*)[^\s;,]+/gi, '$1[REDACTED]')
    .replace(/\b\d{8,12}\b/g, '[REDACTED_ID]');
}
