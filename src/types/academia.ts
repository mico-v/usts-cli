/**
 * 学业情况与 GPA 的稳定结果形状
 *
 * 远端字段名只允许出现在 `infrastructure/jwgl`；字段注释标出来源，方便追查。
 */

export interface GpaSummary {
  gpa?: number;
  averageScore?: number;
  totalCredits?: number;
  earnedCredits?: number;
  rawText?: string[];
}

export interface AcademiaCategory {
  id?: string;
  name: string;
  requiredCredits?: number;
  earnedCredits?: number;
  missingCredits?: number;
  detailAvailable?: boolean;
}

export interface AcademiaCourseItem {
  courseId?: string;     // KCH 课程号
  title?: string;        // KCMC 课程名称
  credit?: number;       // XF 学分
  category?: string;     // KCLBMC 课程类别（通识教育/专业教育/素质拓展）
  nature?: string;       // KCXZMC 课程性质（必修/任选）
  grade?: string;        // CJ 成绩
  maxGrade?: string;     // MAXCJ 最佳成绩
  gpa?: number;          // JD 绩点
  displayTerm?: string;  // JYXDXNMC + JYXDXQMC 建议修读学年·学期
  planned?: boolean;     // SFJHKC 是否计划课程
}

export interface AcademiaSummary {
  studentId?: string;
  gpa?: number;
  plannedCourses?: number;
  passedCourses?: number;
  failedCourses?: number;
  unlearnedCourses?: number;
  inProgressCourses?: number;
  unplannedPassedCourses?: number;
  unplannedFailedCourses?: number;
  categories: AcademiaCategory[];
  rawText?: string[];
}
