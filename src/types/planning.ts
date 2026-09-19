/**
 * 教学执行计划查看（`usts plan`）的稳定结果形状
 *
 * 远端字段名只允许出现在 `infrastructure/jwgl`；字段注释标出来源，方便追查。
 */

export interface PlanEntry {
  /** 执行计划信息表 ID jxzxjhxx_id（查询课程明细时必须带） */
  id?: string;
  grade?: string;           // 年级 njmc
  majorCode?: string;       // 专业号 zyh
  major?: string;           // 专业名称 zymc
  category?: string;        // 大类标识 dlbs（大类/专业/二级专业）
  taskClass?: string;       // 任务班级 rwbj
  plannedStudents?: number; // 计划人数 jhrs
  campus?: string;          // 校区 xqmc
  courseCount?: number;     // 课程数 kcs
  totalCredits?: number;    // 总学分 zdxf
  schoolLength?: string;    // 学制 xz（年）
}

export interface PlanCourse {
  code?: string;          // 课程号 kch
  name?: string;          // 课程名称 kcmc
  credit?: number;        // 学分 xf
  hours?: number;         // 总学时 zxs
  nature?: string;        // 课程性质 kcxzmc（必修/选修…）
  category?: string;      // 课程类别 kclbmc（通识教育/专业教育/素质拓展）
  suggestedTerm?: string; // 建议修读学年学期 yyxdxnxqmc
  assessMethod?: string;  // 考核方式 khfsdm
  department?: string;    // 开课部门 kkbmmc
}

/** 执行计划主列表的过滤条件；留空 = 服务端返回全部（1882 条，慎用）。 */
export interface PlanFilter {
  collegeId?: string; // jg_id
  gradeId?: string;   // njdm_id
  majorId?: string;   // zyh_id
}
