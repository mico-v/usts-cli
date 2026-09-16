/**
 * 记录型查询的稳定结果形状（成绩/考试/选课名单/已选课程/通知）
 *
 * 这里只放「取数之后、展示之前」的中性类型；远端字段名（拼音缩写、`status:910` 之类）
 * 只允许出现在 `infrastructure/jwgl` 的映射与解析里。字段注释会标出它由哪个远端字段
 * 映射而来，方便追查；但字段本身是领域形状，不是远端 DTO。
 */

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

export interface ExamItem {
  courseName: string; // 课程名称 kcmc
  examTime: string; // 考试时间 kssj
  location: string; // 考试地点 cdmc
  seat: string; // 座位号 zwh
  examType: string; // 考试类型 ksxzmc
}

export interface CourseListItem {
  courseName: string; // 课程名称 kcmc
  courseCode: string; // 课程号 kch
  credit: string; // 学分 xf
  teacher: string; // 教师 jsmc（不是 jsxm）
  teachingClass: string; // 教学班 jxbmc
}

export interface NotificationItem {
  title?: string;
  type?: string;
  content?: string;
  createdAt?: string;
  unread?: boolean;
}

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
