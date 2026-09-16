/**
 * 课表与下拉选项的稳定结果形状（个人课表、班级课表、级联选单）
 *
 * 远端字段名只允许出现在 `infrastructure/jwgl`；字段注释标出来源，方便追查。
 */

export type RawFields = Record<string, unknown>;

export interface ScheduleItem {
  courseName: string;
  teacher?: string; // 教师 jsxm
  className?: string; // 教学班 jxbzh
  campus?: string; // 校区 xqmc
  credit?: number; // 学分 xf
  weeks?: string; // 上课周次 qsjsz，如 "1-17周"
  courseType?: string; // 课程类别 kclb
  assessMethod?: string; // 考核方式 khfsmc
  academicYear?: string; // 学年名 xnmc，如 "2026-2027"
  weekday?: number; // 星期 xqj，1=周一（仅具体排课条目有值）
  startSection?: number; // 起始节次 jc 左段
  endSection?: number; // 结束节次 jc 右段
}

export interface SelectOption {
  value: string; // id
  label: string; // 显示名
  meta?: RawFields; // 原始字段（班级条目含 bh 编号 / zymc / jgmc / njmc 等）
}

export interface ClassScheduleQuery {
  xnm: string;
  xqm: string;
  xqhId: string;  // 校区 id，如 '2'=石湖
  njdmId: string; // 年级 id，如 '2025'
  zyhId: string;  // 专业 id，如 '0107'
  bhId: string;   // 班级 id
  bh: string;     // 班级编号（bjkbdy_cxBjKb.html 必需，且须与 bhId 对应，缺了返回空）
  bj: string;     // 班级名，如 '测试班级'
  zymc: string;   // 专业名
  jgmc: string;   // 学院名
  njmc: string;   // 年级名
}

export interface ClassScheduleItem {
  courseName: string;     // kcmc
  teacher?: string;       // xm（注意：班级课表教师字段是 xm，不是 jsxm）
  teacherTitle?: string;  // zcmc 职称
  jxbmc?: string;         // 教学班名
  jxbzc?: string;         // 教学班组成（班级）
  campus?: string;        // xqmc 校区
  room?: string;          // cdmc 教室
  credit?: number;        // xf
  weeks?: string;         // zcd 周次
  assessMethod?: string;  // khfsmc 考核方式
  courseNature?: string;  // kcxzjc 必修/选修
  weekday?: number;       // xqj 星期（1=周一）
  startSection?: number;  // jcor 起始节次
  endSection?: number;    // jcor 结束节次
}

export interface ClassScheduleView {
  colleges: SelectOption[];
  campuses: SelectOption[];
  grades: SelectOption[];
  defaultGrade: string;
  defaultCampus: string;
}
