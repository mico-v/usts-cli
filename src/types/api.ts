/**
 * 端口、端点适配器与命令共用的**稳定结果形状**。
 *
 * 这里只放「取数之后、展示之前」的中性类型；远端字段名（拼音缩写、`status:910` 之类）
 * 只允许出现在 `infrastructure/jwgl` 的映射与解析里，不进这一层。字段的注释会标出它
 * 由哪个远端字段映射而来，方便追查；但字段本身是领域形状，不是远端 DTO。
 *
 * 目录名 `types/` 是历史遗留；层级上它位于 `domain/` 之上、`application/` 之下
 * （见 `docs/architecture.md`）。
 */

import type { AppErrorCode } from '../domain/errors';

export type RawFields = Record<string, unknown>;

// 登录响应
export interface LoginResponse {
  success: boolean;
  message: string;
  errorCode?: AppErrorCode;
  data?: {
    sessionId?: string;
    username?: string;
    displayName?: string;
  };
}

// 成绩单科信息（来源：cjcx_cxXsgrcj.html 返回 items）
export interface ScoreItem {
  courseName: string; // 课程名称 kcmc
  courseCode: string; // 课程号 kch
  courseNature: string; // 课程性质 kcxzmc
  credit: number | undefined; // 学分 xf
  score: string; // 成绩/等级 cj
  gpa: number | undefined; // 绩点 jd
  college: string; // 开课学院 jgmc
  teacher: string; // 教师姓名 jsxm
  assessMethod: string; // 考核方式 khfsmc
  examType: string; // 考试性质 ksxz
  academicYear: string; // 学年名 xnmmc
  semester: string; // 学期名 xqmmc
  className: string; // 班级 bj
  major: string; // 专业 zymc
  teachingClass: string; // 教学班 jxbmc
}

// 考试信息（来源：kwgl/kscx_cxXsksxxIndex.html 返回 items；字段因校而异，按候选键映射）
export interface ExamItem {
  courseName: string; // 课程名称 kcmc
  examTime: string; // 考试时间 kssj
  location: string; // 考试地点 cdmc
  seat: string; // 座位号 zwh
  examType: string; // 考试类型 ksxzmc
}

// 选课名单项（来源：xkcx/xkmdcx_cxXkmdcxIndex.html 返回 items）
export interface CourseListItem {
  courseName: string; // 课程名称 kcmc
  courseCode: string; // 课程号 kch
  credit: string; // 学分 xf
  teacher: string; // 教师 jsmc（不是 jsxm）
  teachingClass: string; // 教学班 jxbmc
}

// 课表项（来源：xskbcx_cxXsKb.html 的 sjkList）
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

// 个人信息
export interface ProfileInfo {
  username: string;
  displayName: string;
  studentId: string;
  className: string;
  college: string;
  major: string;
  grade: string;
  enrollmentYear: number;
  idCard?: string;
  phone?: string;
  email?: string;
}

// 通用下拉选项（级联查询：学院/专业/班级等）
export interface SelectOption {
  value: string; // id
  label: string; // 显示名
  meta?: RawFields; // 原始字段（班级条目含 bh 编号 / zymc / jgmc / njmc 等）
}

// 班级课表查询参数（由级联选单解析而来）
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

// 班级课表条目（来源：bjkbdy_cxBjKb.html 的 kbList）
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

// 班级课表视图页解析出的选单选项
export interface ClassScheduleView {
  colleges: SelectOption[];
  campuses: SelectOption[];
  grades: SelectOption[];
  defaultGrade: string;
  defaultCampus: string;
}

// 首页待办/通知
export interface NotificationItem {
  title?: string;
  type?: string;
  content?: string;
  createdAt?: string;
  unread?: boolean;
}

// 学业情况页面中的 GPA/学分概览
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

// 学业分类明细课程（来源：xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515 返回数组）
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

// 已选课程；与 courses 命令的课程名单保持不同模型
export interface SelectedCourseItem {
  courseId?: string;
  classId?: string;
  title?: string;
  teacher?: string;
  credit?: number;
  category?: string;
  capacity?: number;
  selectedNumber?: number;
  place?: string;
  time?: string;
}
