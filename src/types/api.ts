/**
 * 正方教务系统 API 类型定义
 */

// 登录响应
export interface LoginResponse {
  success: boolean;
  message: string;
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
  score100: string; // 百分制成绩 bfzcj
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

// 考试信息（来源：kscx_cxXsksxx.html；字段因校而异，保留索引签名）
export interface ExamItem extends Record<string, any> {
  courseName?: string; // 课程名称
  examTime?: string; // 考试时间
  location?: string; // 考试地点
  seat?: string; // 座位号
  examType?: string; // 考试类型
}

// 选课名单项（来源：xkmdcx_cxXkmdcx.html；保留索引签名）
export interface CourseListItem extends Record<string, any> {
  courseName?: string;
  teacher?: string;
  credit?: string;
  courseCode?: string;
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

// 会话状态
export interface SessionState {
  cookies: Map<string, string>;
  sessionId?: string;
  username?: string;
  loginTime?: Date;
}

// 通用下拉选项（级联查询：学院/专业/班级等）
export interface SelectOption {
  value: string; // id
  label: string; // 显示名
  meta?: Record<string, any>; // 原始字段（班级条目含 bh 编号 / zymc / jgmc / njmc 等）
}

// 班级课表查询参数（由级联选单解析而来）
export interface ClassScheduleQuery {
  xnm: string;
  xqm: string;
  xqhId: string;  // 校区 id，如 '2'=石湖
  njdmId: string; // 年级 id，如 '2025'
  jgId: string;   // 学院 id，如 '204'
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
  roomType?: string;      // cdlbmc 场地类别
  credit?: number;        // xf
  totalHours?: number;    // kczxs 课程总学时
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
  pyccdms: SelectOption[];
  defaultGrade: string;
  defaultCampus: string;
}

// 首页待办/通知
export interface NotificationItem extends Record<string, any> {
  id?: string;
  title?: string;
  type?: string;
  content?: string;
  createdAt?: string;
  unread?: boolean;
  url?: string;
}

// 学业情况页面中的 GPA/学分概览
export interface GpaSummary extends Record<string, any> {
  gpa?: number;
  averageScore?: number;
  totalCredits?: number;
  earnedCredits?: number;
  rawText?: string[];
}

export interface AcademiaCategory extends Record<string, any> {
  id?: string;
  name: string;
  requiredCredits?: number;
  earnedCredits?: number;
  missingCredits?: number;
  detailAvailable?: boolean;
}

// 学业分类明细课程（来源：xsxyqk_cxJxzxjhxfyqKcxx.html?gnmkdm=N105515 返回数组）
export interface AcademiaCourseItem extends Record<string, any> {
  courseId?: string;     // KCH 课程号
  title?: string;        // KCMC 课程名称
  englishTitle?: string; // KCYWMC 英文名称
  status?: string;       // XDZT 修读状态（3=未修/4=已修？，按数字字符串保留）
  credit?: number;       // XF 学分
  category?: string;     // KCLBMC 课程类别（通识教育/专业教育/素质拓展）
  nature?: string;       // KCXZMC 课程性质（必修/任选）
  grade?: string;        // CJ 成绩
  maxGrade?: string;     // MAXCJ 最佳成绩
  gpa?: number;          // JD 绩点
  displayTerm?: string;  // JYXDXNMC + JYXDXQMC 建议修读学年·学期
  planned?: boolean;     // SFJHKC 是否计划课程
  hours?: string;        // XSXXXX 学时组成
}

export interface AcademiaSummary extends Record<string, any> {
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
export interface SelectedCourseItem extends Record<string, any> {
  courseId?: string;
  classId?: string;
  executionId?: string;
  title?: string;
  teacher?: string;
  teacherId?: string;
  credit?: number;
  category?: string;
  capacity?: number;
  selectedNumber?: number;
  place?: string;
  time?: string;
  optional?: boolean;
  waiting?: string;
}
