import { AppError } from './errors';

export interface Term {
  academicYear: string;
  semester: string;
}

/** 与 USTS 正方页面默认学期保持一致；Clock 可注入，便于稳定测试。 */
export function currentTerm(now = new Date()): Term {
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  if (month >= 8) return { academicYear: String(year), semester: '3' };
  if (month >= 2) return { academicYear: String(year - 1), semester: '12' };
  return { academicYear: String(year - 1), semester: '3' };
}

/**
 * USTS 会话/查询用的学期码（3/12/16）→ 正方打印与课表接口使用的学期序号（1/2/3）。
 * 两套编码在同一个系统里并存，是最容易写错的一处，因此收敛到这里。
 */
export function displaySemester(xqm: string): string {
  return { '3': '1', '12': '2', '16': '3' }[xqm] || xqm || '1';
}

/** 学年 `2026` → 接口要求的学年名 `2026-2027`。课表接口与打印模块都按这个格式传。 */
export function academicYearName(xnm: string): string {
  return `${xnm}-${Number(xnm) + 1}`;
}

/** 学期代码 → 中文名（短，用于「第 X 学期」中的 X） */
export function xqmName(xqm?: string): string {
  if (xqm === '3') return '一';
  if (xqm === '12') return '二';
  if (xqm === '16') return '三（小学期）';
  return xqm || '?';
}

/** 学期名（来自接口 `xqmmc`，值为 1/2/3）→ 中文整名 */
export function semesterLabel(xqmmc?: string): string {
  if (xqmmc === '1') return '第一学期';
  if (xqmmc === '2') return '第二学期';
  if (xqmmc === '3') return '第三学期';
  return xqmmc || '';
}

/** 学年名（来自接口 `xnmmc`，如 `2025-2026`），缺失时按学年号拼装 */
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

/** 合法的学期码（与网页下拉一致）。 */
export const TERM_CODES = ['3', '12', '16'] as const;

/**
 * 校验用户给的学年/学期。
 *
 * 不校验的话非法值会原样进请求，服务端返回空网格，命令于是报「该学期没有数据」——
 * 一个把参数错误伪装成空结果的假结论。这里当场报 `CONFIGURATION_ERROR`（退出码 2）。
 */
export function validateTerm(term: { xnm: string; xqm: string }): { xnm: string; xqm: string } {
  if (!/^\d{4}$/.test(term.xnm)) {
    throw new AppError('CONFIGURATION_ERROR', `学年必须是 4 位年份（如 2025），收到：${term.xnm}`);
  }
  // 学期留空是合法的：表示「该学年全部学期」，与网页行为一致。
  if (term.xqm && !(TERM_CODES as readonly string[]).includes(term.xqm)) {
    throw new AppError(
      'CONFIGURATION_ERROR',
      `学期取值必须是 ${TERM_CODES.join(' / ')}（或留空表示全部学期），收到：${term.xqm}`,
    );
  }
  return term;
}

/**
 * 解析学年/学期参数。
 * 与网页行为一致（2026-08 抓包实测）：
 *   - 什么都不给 → 用 currentTerm() 当前学期
 *   - 只给 -y（学年）→ 学期留空（=「全部学期」），网页选中学年后缺省即全部
 *   - 给了 -y 和 -t → 按给定学期
 */
export function resolveTerm(opts: { xnm?: string; xqm?: string }): { xnm: string; xqm: string } {
  const def = currentTerm();
  return validateTerm({
    xnm: opts.xnm || def.academicYear,
    xqm: opts.xqm !== undefined ? opts.xqm : (opts.xnm ? '' : def.semester),
  });
}
