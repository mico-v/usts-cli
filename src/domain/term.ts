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
