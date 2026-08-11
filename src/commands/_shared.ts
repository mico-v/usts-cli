import { JwglClient } from '../lib/client';
import { error } from '../lib/logger';

/** 恢复并校验会话；失败则提示登录并返回 false */
export async function ensureSession(client: JwglClient): Promise<boolean> {
  if (!client.restoreSession()) {
    console.error(error('未找到会话，请先运行 usts login 登录'));
    return false;
  }
  const ok = await client.validateSession();
  if (!ok) {
    console.error(error('会话已失效，请重新运行 usts login 登录'));
    return false;
  }
  return true;
}

/** 学期代码 -> 中文名（短，用于“第X学期”中的 X） */
export function xqmName(xqm?: string): string {
  if (xqm === '3') return '一';
  if (xqm === '12') return '二';
  if (xqm === '16') return '三（小学期）';
  return xqm || '?';
}

/** 学期名（来自接口 xqmmc，值为 1/2/3）-> 中文整名 */
export function semesterLabel(xqmmc?: string): string {
  if (xqmmc === '1') return '第一学期';
  if (xqmmc === '2') return '第二学期';
  if (xqmmc === '3') return '第三学期';
  return xqmmc || '';
}

/** 学年名（来自接口 xnmmc，如 2025-2026）兜底拼装 */
export function academicYearLabel(xnm?: string, xnmmc?: string): string {
  if (xnmmc) return xnmmc;
  const y = Number(xnm);
  if (y) return `${y}-${y + 1}`;
  return xnm || '';
}

/** 学年/学期 → 标题用标签（学期为空 = 全部学期） */
export function termLabel(xnm: string, xqm: string): string {
  const y = academicYearLabel(xnm);
  return xqm ? `${y} 学年 · 第${xqmName(xqm)}学期` : `${y} 学年 · 全部学期`;
}

/**
 * 解析学年/学期参数。
 * 与网页行为一致（2026-08 抓包实测）：
 *   - 什么都不给 → 用 currentTerm() 当前学期
 *   - 只给 -y（学年）→ 学期留空（=“全部学期”），网页选中学年后缺省即全部
 *   - 给了 -y 和 -t → 按给定学期
 */
export function resolveTerm(opts: { xnm?: string; xqm?: string }): { xnm: string; xqm: string } {
  const def = JwglClient.currentTerm();
  const xnm = opts.xnm || def.xnm;
  const xqm = opts.xqm !== undefined ? opts.xqm : (opts.xnm ? '' : def.xqm);
  return { xnm, xqm };
}
