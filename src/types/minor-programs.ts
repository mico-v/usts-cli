/**
 * 微专业 / 辅修 / 二学位课表（`usts minor-schedule`）的稳定结果形状
 *
 * 远端字段名只允许出现在 `infrastructure/jwgl`；字段注释标出来源，方便追查。
 */

/**
 * 课表类型。网页用 `kklxdm` 数字编码（02/03/04），编码留在适配器里，
 * 这一层只保留语义——与 `foreign` 编码解耦。
 */
export type MinorProgramKind = 'micro-major' | 'dual-degree' | 'minor';

export interface MinorScheduleEntry {
  college?: string; // 学院 jgmc
  grade?: string;   // 年级 njmc
  major?: string;   // 专业 zymc
  name?: string;    // 课表名称 tjkbmc
}

export interface MinorScheduleQuery {
  xnm: string;
  xqm: string;
  kind: MinorProgramKind;
  collegeId?: string; // jg_id
  gradeId?: string;   // njdm_id
  majorId?: string;   // zyh_id
}
