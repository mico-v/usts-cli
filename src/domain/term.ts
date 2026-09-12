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
