const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g;
const ANSI_ESCAPE = /\u001b(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007]*(?:\u0007|\u001b\\))/g;
/**
 * Unicode 格式控制符：双向覆盖（RLO/LRO/PDF…）能在视觉上重排后续文本，零宽字符能在
 * 输出里藏字符。这两类都能在终端里伪造出并不存在的文本，因此一并去掉。
 */
const BIDI_AND_FORMAT = /[\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g;

/** 防止远端文本向终端注入控制序列；换行和制表符保留。 */
export function sanitizeTerminalText(value: unknown): string {
  return String(value ?? '')
    .replace(ANSI_ESCAPE, '')
    .replace(BIDI_AND_FORMAT, '')
    .replace(CONTROL_CHARACTERS, '');
}

/**
 * 密钥脱敏。作用对象是**错误消息**这类可能夹带 token 的自由文本，不是逐字段替换。
 *
 * 三类目标：显式键值（cookie/password/csrftoken…，大小写不敏感）、`Cookie:` 头里的
 * **每一段**（`a=1; b=2` 只脱第一段会漏掉 `__jsluid_s`）、以及裸 token 与超长数字串。
 * `rememberMe` 的效力与 `JSESSIONID` 相同（见 CLAUDE.md），必须一起脱。
 */
export function redactSecret(value: string): string {
  return value
    .replace(
      /((?:cookie|set-cookie|password|passwd|csrftoken|jsessionid|rememberme|authorization|token)\s*[:=]\s*)[^\s;,]+/gi,
      '$1[REDACTED]',
    )
    // 同一条头里的后续 `name=value` 段。`Cookie: JSESSIONID=x; __jsluid_s=y` 这类消息
    // 经上一条规则后可能仍留着后半段，这里按段补齐；已经被脱敏的 [REDACTED] 会被覆盖成同值。
    .replace(/(;\s*[A-Za-z_][\w-]*=)[^\s;]+/g, '$1[REDACTED]')
    // 裸 token：24 位以上的 base64/hex 串
    .replace(/\b[A-Za-z0-9_-]{24,}\b/g, '[REDACTED_TOKEN]')
    // 学号一类长数字串。**下限取 10 位**：本校学号是 11 位，门槛设成 12 位会直接漏掉；
    // 12 位以上会直接漏掉；而 9 位以下会误伤班级编号（2520401000 是 10 位，属于边界）。
    // 这里刻意接受「班级编号也可能被脱敏」这点代价——学号是个人信息，漏掉的代价高得多。
    .replace(/\b\d{10,}\b/g, '[REDACTED_ID]');
}
