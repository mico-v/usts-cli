/**
 * 正方所有表单型接口都用 URL 编码的 body（配套的 `Content-Type` 见
 * `authenticated-transport.ts` 的 `FORM_CONTENT_TYPE`）。
 */
export function formBody(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}
