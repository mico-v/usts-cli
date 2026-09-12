import { AuthenticatedTransport, TransportResponse } from '../http/authenticated-transport';
import { DOWNLOAD_REQUEST_TIMEOUT_MS } from '../http/transport';
import { AppError } from '../../domain/errors';
import { assertSameOriginUrl } from '../../config/config';
import {
  ACADEMIA_PDF_LIST_FORM, ACADEMIA_PDF_LIST_PATH, ACADEMIA_PDF_PROGRESS_FORM, ACADEMIA_PDF_PROGRESS_PATH,
  ACADEMIA_PDF_QUERY, ACADEMIA_PDF_STEPS, SCHEDULE_PDF_FILE_PATH, SCHEDULE_PDF_POLICY_PATH, buildSchedulePdfBody,
} from './documents';
import { formBody } from './form';
import { assertPdfResponse, assertReadableResponse, classifyResponse } from './response-policy';

/**
 * PDF 下载。两条链都是**多步有状态 POST**（正方打印模块要求逐步「生成」）。
 * 因此 `effect=download`：单步可在传输层有限重试，但内容校验失败不得就地重放；
 * 会话失效时的重放由调用方在**整个方法**这一层做。
 */

/**
 * 文件响应被 302 时继续把文件取回来。
 *
 * 按浏览器对 302 的语义，POST 之后的跳转改用 GET；而每一跳都要重新校验同源
 * （`getFollowingSameOrigin` 会做），绝不把会话 Cookie 带到外部主机。
 * 指向登录页的跳转**不跟**——那是会话失效，交给 `assertPdfResponse` 判成 SESSION_EXPIRED，
 * 跟着去 GET 登录页只会把失效误报成「不是 PDF」。
 */
async function resolveFileResponse(t: AuthenticatedTransport, resp: TransportResponse): Promise<TransportResponse> {
  if (resp.status < 300 || resp.status >= 400) return resp;
  if (classifyResponse(resp) === 'session-expired') return resp;
  const location = resp.headers['location'];
  if (typeof location !== 'string' || !location) return resp;
  return t.getFollowingSameOrigin(assertSameOriginUrl(location, t.baseUrl), 'arraybuffer');
}

/** 下载个人课表 PDF（只读；学期使用 USTS xqm 编码）。 */
export async function downloadSchedulePdf(
  t: AuthenticatedTransport,
  xnm: string,
  xqm: string,
  name = '导出',
): Promise<Buffer> {
  const body = buildSchedulePdfBody(xnm, xqm, name);
  const policy = await t.requestWithRetry(() => t.http.post(`${SCHEDULE_PDF_POLICY_PATH}?gnmkdm=N2151`, body, {
    headers: t.formHeaders(`${t.baseUrl}${SCHEDULE_PDF_POLICY_PATH}`),
    timeout: DOWNLOAD_REQUEST_TIMEOUT_MS,
  }), 'download');
  assertReadableResponse(policy, '课表 PDF 预检');
  const file = await t.requestWithRetry(() => t.http.post(`${SCHEDULE_PDF_FILE_PATH}?doType=table`, body, {
    headers: t.formHeaders(`${t.baseUrl}${SCHEDULE_PDF_FILE_PATH}`),
    responseType: 'arraybuffer',
    timeout: DOWNLOAD_REQUEST_TIMEOUT_MS,
  }), 'download');
  const resolved = await resolveFileResponse(t, file);
  const bytes = Buffer.from(resolved.data);
  assertPdfResponse(resolved.status, bytes, resolved.headers);
  return bytes;
}

/** 下载成绩总表 PDF（只读；正方打印模块的六步生成链 + 同源 GET）。 */
export async function downloadAcademiaPdf(t: AuthenticatedTransport): Promise<Buffer> {
  const post = async (path: string, form: Record<string, string>): Promise<TransportResponse> => {
    const resp = await t.requestWithRetry(() => t.http.post(path, formBody(form), {
      params: ACADEMIA_PDF_QUERY,
      headers: t.formHeaders(`${t.baseUrl}${path}`),
      timeout: DOWNLOAD_REQUEST_TIMEOUT_MS,
    }), 'download');
    assertReadableResponse(resp, '成绩总表生成');
    return resp;
  };
  for (const step of ACADEMIA_PDF_STEPS) await post(step.path, step.form);
  const fileResp = await post(ACADEMIA_PDF_LIST_PATH, ACADEMIA_PDF_LIST_FORM);
  const fileText = String(fileResp.data || '');
  if (/错误|error_title/i.test(fileText)) throw new AppError('REMOTE_SERVER_ERROR', '成绩总表 PDF 生成失败');
  const pdfPath = fileText.replace('#成功', '').replace(/"/g, '').trim().replace(/\\/g, '/');
  if (!pdfPath) throw new AppError('PROTOCOL_CHANGED', '成绩总表 PDF 未返回下载路径');
  await post(ACADEMIA_PDF_PROGRESS_PATH, ACADEMIA_PDF_PROGRESS_FORM);
  const downloadUrl = assertSameOriginUrl(pdfPath, t.baseUrl);
  const download = await t.getFollowingSameOrigin(downloadUrl, 'arraybuffer');
  const bytes = Buffer.from(download.data);
  assertPdfResponse(download.status, bytes, download.headers);
  return bytes;
}
