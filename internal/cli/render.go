package cli

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/mico-v/usts-cli/internal/application"
	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/jwgl"
)

var dayNames = []string{"周一", "周二", "周三", "周四", "周五", "周六", "周日"}

func renderScores(app *App, view application.ScoresView, term domain.Term) {
	if len(view.Items) == 0 {
		fmt.Fprintln(app.Out, app.Header("学生成绩查询   "+domain.TermLabel(term.AcademicYear, term.Semester)))
		fmt.Fprintln(app.Out, app.Info("该学期暂无成绩记录"))
		return
	}
	first := view.Items[0]
	fmt.Fprintln(app.Out, app.Header(fmt.Sprintf("学生成绩查询   %s 学年 · %s",
		domain.AcademicYearLabel(term.AcademicYear, first.AcademicYear), domain.SemesterLabel(first.Semester))))
	rows := make([][]string, 0, len(view.Items))
	for _, item := range view.Items {
		rows = append(rows, []string{
			domain.SemesterLabel(item.Semester), item.CourseName, item.CourseNature,
			floatString(item.Credit), item.Score, floatString(item.GPA), item.Teacher, item.College,
		})
	}
	WriteTable(app.Out, []string{"学期", "课程", "性质", "学分", "成绩", "绩点", "教师", "开课学院"}, rows, TableOptions{})
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 门课程 · 学分合计 %s", len(view.Items), formatFloat(view.TotalCredit))))
}

func renderExams(app *App, items []domain.ExamItem, term domain.Term) {
	fmt.Fprintln(app.Out, app.Header("考试信息查询   "+domain.TermLabel(term.AcademicYear, term.Semester)))
	if len(items) == 0 {
		fmt.Fprintln(app.Out, app.Info("该学期暂无考试安排"))
		return
	}
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{item.CourseName, item.ExamTime, item.Location, item.Seat, item.ExamType})
	}
	WriteTable(app.Out, []string{"课程", "考试时间", "考试地点", "座位号", "考试类型"}, rows, TableOptions{})
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 条考试记录", len(items))))
}

func renderCourses(app *App, items []domain.CourseListItem, term domain.Term) {
	fmt.Fprintln(app.Out, app.Header("选课名单查询   "+domain.TermLabel(term.AcademicYear, term.Semester)))
	if len(items) == 0 {
		fmt.Fprintln(app.Out, app.Info("该学期暂无选课记录"))
		return
	}
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{item.CourseName, item.CourseCode, item.Credit, item.Teacher, item.TeachingClass})
	}
	WriteTable(app.Out, []string{"课程", "课程代码", "学分", "教师", "教学班"}, rows, TableOptions{})
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 条选课记录", len(items))))
}

func renderCourseDetails(app *App, items []domain.CourseListItem, term domain.Term) {
	fmt.Fprintln(app.Out, app.Header("选课名单明细   "+domain.TermLabel(term.AcademicYear, term.Semester)))
	if len(items) == 0 {
		fmt.Fprintln(app.Out, app.Info("该学期暂无选课记录"))
		return
	}
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{
			stringValue(item.StudentID, ""), stringValue(item.StudentName, ""),
			stringValue(item.ClassName, ""), stringValue(item.Major, ""),
			stringValue(item.Grade, ""), stringValue(item.College, ""),
			item.CourseName, item.CourseCode, item.Credit, item.Teacher,
			item.TeachingClass, stringValue(item.TeachingTime, ""),
			stringValue(item.TeachingPlace, ""), stringValue(item.Status, ""),
		})
	}
	WriteTable(app.Out, []string{"学号", "姓名", "班级", "专业", "年级", "学院", "课程", "课程号", "学分", "教师", "教学班", "时间", "地点", "状态"}, rows, TableOptions{MaxColumnWidth: 20})
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 条选课名单记录", len(items))))
}

func renderSchedule(app *App, view application.ScheduleView, term domain.Term) {
	fmt.Fprintln(app.Out, app.Header("个人课表查询   "+domain.TermLabel(term.AcademicYear, term.Semester)))
	if view.Total == 0 {
		fmt.Fprintln(app.Out, app.Info("该学期暂无课表记录"))
		return
	}
	for _, day := range view.Days {
		fmt.Fprintln(app.Out, app.Header(dayNames[day.Day-1]))
		for _, item := range day.Items {
			fmt.Fprintf(app.Out, "  %2d~%-2d节  %s  @ %s %s  %s  %s\n",
				intValue(item.StartSection), intValue(item.EndSection), SanitizeLine(item.CourseName),
				SanitizeLine(stringValue(item.Campus, "?")), SanitizeLine(stringValue(item.ClassName, "")),
				SanitizeLine(stringValue(item.Teacher, "")), SanitizeLine(stringValue(item.Weeks, "")),
			)
		}
	}
	if len(view.Untimed) > 0 {
		fmt.Fprintln(app.Out, app.Header("其他课程（无固定时间）"))
		for _, item := range view.Untimed {
			fmt.Fprintf(app.Out, "  %s  @ %s %s  %s  %s  学分:%s  %s  %s\n",
				SanitizeLine(item.CourseName), SanitizeLine(stringValue(item.Campus, "?")),
				SanitizeLine(stringValue(item.ClassName, "")), SanitizeLine(stringValue(item.Teacher, "")),
				SanitizeLine(stringValue(item.Weeks, "")), floatStringOrDash(item.Credit),
				SanitizeLine(stringValue(item.CourseType, "")), SanitizeLine(stringValue(item.AssessMethod, "")),
			)
		}
	}
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 条课程记录", view.Total)))
}

func renderClassSchedule(app *App, view application.ClassTimetable, query domain.ClassScheduleQuery, term domain.Term) {
	fmt.Fprintln(app.Out, app.Header(fmt.Sprintf("班级课表查询   %s · %s", query.ClassName, domain.TermLabel(term.AcademicYear, term.Semester))))
	if view.CourseCount == 0 && len(view.Practice) == 0 {
		fmt.Fprintln(app.Out, app.Info("该班级暂无课表记录"))
		return
	}
	for _, day := range view.Days {
		fmt.Fprintln(app.Out, app.Header(dayNames[day.Day-1]))
		for _, item := range day.Items {
			teacher := stringValue(item.Teacher, "")
			if item.TeacherTitle != nil {
				teacher += "(" + *item.TeacherTitle + ")"
			}
			fmt.Fprintf(app.Out, "  %s节  %s  @ %s  %s  %s%s\n",
				sectionRange(item.StartSection, item.EndSection), SanitizeLine(item.CourseName),
				SanitizeLine(stringValue(item.Room, "?")), SanitizeLine(teacher),
				SanitizeLine(stringValue(item.Weeks, "")), creditSuffix(item.Credit),
			)
		}
	}
	if len(view.Untimed) > 0 {
		fmt.Fprintln(app.Out, app.Header("其他课程（无固定时间）"))
		for _, item := range view.Untimed {
			fmt.Fprintf(app.Out, "  %s  @ %s  %s  %s\n",
				SanitizeLine(item.CourseName), SanitizeLine(stringValue(item.Room, "?")),
				SanitizeLine(stringValue(item.Teacher, "")), SanitizeLine(stringValue(item.Weeks, "")),
			)
		}
	}
	for _, practice := range view.Practice {
		fmt.Fprintln(app.Out, app.Info("实践课："+SanitizeLine(practice)))
	}
	suffix := ""
	if len(view.Practice) > 0 {
		suffix = fmt.Sprintf(" · %d 门实践课", len(view.Practice))
	}
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 门课%s", view.CourseCount, suffix)))
}

func renderFreeClassrooms(app *App, view application.FreeClassroomsView, term domain.Term, limit int) {
	criteria := view.Criteria
	slot := describeTimeSlot(criteria)
	filters := describeRoomFilters(criteria)
	title := strings.Join(nonEmpty([]string{"空闲教室", domain.TermLabel(term.AcademicYear, term.Semester), slot, filters}), "   ")
	fmt.Fprintln(app.Out, app.Header(title))
	if slot == "" {
		fmt.Fprintln(app.Out, app.Info("未指定时段：下面是该学期全部场地。要查某时段空闲的教室，加 --week/--weekday/--section"))
	}
	if len(view.Items) == 0 {
		message := "没有符合条件的场地"
		if view.Total > 0 {
			message = fmt.Sprintf("该时段有 %d 间场地空闲，但没有一间符合上面的名称/座位条件", view.Total)
		}
		fmt.Fprintln(app.Out, app.Info(message))
		return
	}
	shown := view.Items
	if limit > 0 && len(shown) > limit {
		shown = shown[:limit]
	}
	rows := make([][]string, 0, len(shown))
	for _, room := range shown {
		rows = append(rows, []string{
			room.Name, stringValue(room.Code, ""), stringValue(room.Campus, ""), stringValue(room.Category, ""),
			stringValue(room.Building, ""), floatString(room.Seats), stringValue(room.Borrowable, ""),
		})
	}
	WriteTable(app.Out, []string{"场地", "编号", "校区", "类别", "楼号", "座位", "可借用"}, rows, TableOptions{MaxColumnWidth: 22})
	suffix := ""
	if len(shown) < len(view.Items) {
		suffix = fmt.Sprintf("，已显示前 %d 间（--limit 调整，0 = 全部）", len(shown))
	}
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 间场地%s", len(view.Items), suffix)))
}

func renderPlan(app *App, view application.PlanView, all bool, limit int) {
	fmt.Fprintln(app.Out, app.Header("教学执行计划   "+describePlanScope(view, all)))
	if len(view.Entries) == 0 {
		fmt.Fprintln(app.Out, app.Info("没有匹配的执行计划。可用 --all 查全校，或换个 --grade/--major"))
		return
	}
	entries := view.Entries
	if limit > 0 && len(entries) > limit {
		entries = entries[:limit]
	}
	rows := make([][]string, 0, len(entries))
	for _, entry := range entries {
		rows = append(rows, []string{
			stringValue(entry.Grade, ""), stringValue(entry.MajorCode, ""), stringValue(entry.Major, ""),
			stringValue(entry.Category, ""), floatString(entry.CourseCount), floatString(entry.TotalCredits),
			floatString(entry.PlannedStudents), stringValue(entry.Campus, ""), stringValue(entry.SchoolLength, ""),
		})
	}
	WriteTable(app.Out, []string{"年级", "专业号", "专业", "类别", "课程数", "总学分", "计划人数", "校区", "学制"}, rows, TableOptions{MaxColumnWidth: 18})
	suffix := ""
	if len(entries) < len(view.Entries) {
		suffix = fmt.Sprintf("，已显示前 %d 条（--limit 调整，0 = 全部）", len(entries))
	}
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 条执行计划%s", len(view.Entries), suffix)))
	if view.CourseCode == nil {
		if len(view.Entries) == 1 {
			fmt.Fprintln(app.Out, app.Info("加 --course 可查看这条计划的课程明细（--course <课程号> 只看某门课）"))
		} else {
			fmt.Fprintln(app.Out, app.Info("用 --grade/--major 缩小到唯一一条后，可用 --course 查看它的课程明细"))
		}
		return
	}
	title := "课程明细（全部课程）"
	if *view.CourseCode != "" {
		title = "课程明细（课程号含 " + *view.CourseCode + "）"
	}
	fmt.Fprintln(app.Out, app.Header(title))
	if len(view.Courses) == 0 {
		fmt.Fprintln(app.Out, app.Info("这条计划下没有匹配的课程"))
		return
	}
	courses := view.Courses
	if limit > 0 && len(courses) > limit {
		courses = courses[:limit]
	}
	courseRows := make([][]string, 0, len(courses))
	for _, course := range courses {
		courseRows = append(courseRows, []string{
			stringValue(course.Code, ""), stringValue(course.Name, ""), floatString(course.Credit),
			floatString(course.Hours), stringValue(course.Nature, ""), stringValue(course.Category, ""),
			stringValue(course.SuggestedTerm, ""), stringValue(course.AssessMethod, ""), stringValue(course.Department, ""),
		})
	}
	WriteTable(app.Out, []string{"课程号", "课程名", "学分", "学时", "性质", "类别", "建议学期", "考核", "开课部门"}, courseRows, TableOptions{MaxColumnWidth: 18})
	courseSuffix := ""
	if len(courses) < len(view.Courses) {
		courseSuffix = fmt.Sprintf("，已显示前 %d 门（--limit 调整，0 = 全部）", len(courses))
	}
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 门课程%s", len(view.Courses), courseSuffix)))
}

func renderMinorSchedule(app *App, view application.MinorScheduleView, term domain.Term) {
	scope := strings.Join(nonEmpty([]string{optionText(view.Scope.College), optionText(view.Scope.Grade), optionText(view.Scope.Major)}), " · ")
	if scope == "" {
		scope = "全部"
	}
	fmt.Fprintln(app.Out, app.Header(fmt.Sprintf("%s课表   %s   %s", view.Kind.Name, domain.TermLabel(term.AcademicYear, term.Semester), scope)))
	if len(view.Entries) == 0 {
		if view.Scoped {
			fmt.Fprintln(app.Out, app.Info(fmt.Sprintf("该学期没有匹配的%s课表。可去掉 --college/--major/--grade 放宽范围", view.Kind.Name)))
		} else {
			fmt.Fprintln(app.Out, app.Info(fmt.Sprintf("该学期没有%s课表记录", view.Kind.Name)))
		}
		return
	}
	rows := make([][]string, 0, len(view.Entries))
	for _, entry := range view.Entries {
		rows = append(rows, []string{stringValue(entry.College, ""), stringValue(entry.Grade, ""), stringValue(entry.Major, ""), stringValue(entry.Name, "")})
	}
	WriteTable(app.Out, []string{"学院", "年级", "专业", "课表名称"}, rows, TableOptions{MaxColumnWidth: 30})
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 张%s课表", len(view.Entries), view.Kind.Name)))
}

func renderProfile(app *App, profile domain.ProfileInfo) {
	fmt.Fprintln(app.Out, app.Header("个人信息"))
	line := func(label, value string) {
		if value != "" {
			fmt.Fprintf(app.Out, "  %s %s\n", app.Info(label), SanitizeLine(value))
		}
	}
	line("学号  ", profile.StudentID)
	line("姓名  ", profile.DisplayName)
	line("学院  ", profile.College)
	line("专业  ", profile.Major)
	line("班级  ", profile.ClassName)
	if profile.Grade != "" {
		line("年级  ", fmt.Sprintf("%s（入学年份 %d）", profile.Grade, profile.EnrollmentYear))
	}
	line("身份证", stringValue(profile.IDCard, ""))
	line("手机  ", stringValue(profile.Phone, ""))
	line("邮箱  ", stringValue(profile.Email, ""))
	fmt.Fprintln(app.Out, app.Success("信息获取完成"))
}

func renderRichProfile(app *App, profile domain.RichProfile) {
	fmt.Fprintln(app.Out, app.Header("完整学生信息"))
	line := func(label string, value string) {
		if value != "" {
			fmt.Fprintf(app.Out, "  %s %s\n", app.Info(label), SanitizeLine(value))
		}
	}
	line("学号      ", profile.StudentID)
	line("姓名      ", profile.DisplayName)
	line("姓名拼音  ", stringValue(profile.NamePinyin, ""))
	line("性别代码  ", stringValue(profile.GenderCode, ""))
	line("民族      ", stringValue(profile.Nationality, ""))
	line("出生日期  ", stringValue(profile.BirthDate, ""))
	line("证件类型  ", stringValue(profile.IDType, ""))
	line("证件号码  ", stringValue(profile.IDCard, ""))
	line("手机      ", stringValue(profile.Phone, ""))
	line("邮箱      ", stringValue(profile.Email, ""))
	line("家庭地址  ", stringValue(profile.Address, ""))
	line("家庭所在地", stringValue(profile.HomePlace, ""))
	line("邮政编码  ", stringValue(profile.PostalCode, ""))
	line("政治面貌  ", stringValue(profile.PoliticalStatus, ""))
	line("入学日期  ", stringValue(profile.EnrollmentDate, ""))
	line("学籍状态  ", stringValue(profile.StudentStatus, ""))
	line("学院      ", stringValue(profile.CollegeName, ""))
	line("专业 ID   ", stringValue(profile.MajorID, ""))
	line("班级 ID   ", stringValue(profile.ClassID, ""))
	line("年级 ID   ", stringValue(profile.GradeID, ""))
	line("培养层次  ", stringValue(profile.TrainingLevel, ""))
	line("培养方式  ", stringValue(profile.StudyForm, ""))
	line("学制      ", stringValue(profile.StudyLength, ""))
	line("预计毕业  ", stringValue(profile.ExpectedGraduation, ""))
	line("考生号    ", stringValue(profile.CandidateNumber, ""))
	line("考生类别  ", stringValue(profile.CandidateCategory, ""))
	line("生源地    ", stringValue(profile.StudentSource, ""))
	if profile.HasPhoto != nil {
		line("是否有照片", map[bool]string{true: "是", false: "否"}[*profile.HasPhoto])
	}
	fmt.Fprintln(app.Out, app.Success("信息获取完成"))
}

func renderHTMLDetail(app *App, detail domain.HTMLDetail, fallbackTitle string) {
	title := strings.TrimSpace(detail.Title)
	if title == "" {
		title = fallbackTitle
	}
	fmt.Fprintln(app.Out, app.Header(title))
	for _, message := range detail.Messages {
		fmt.Fprintln(app.Out, app.Info(message))
	}
	for index, table := range detail.Tables {
		if index > 0 {
			fmt.Fprintln(app.Out)
		}
		headers := table.Headers
		if len(headers) == 0 && len(table.Rows) > 0 {
			for column := range table.Rows[0] {
				headers = append(headers, fmt.Sprintf("第%d列", column+1))
			}
		}
		WriteTable(app.Out, headers, table.Rows, TableOptions{MaxColumnWidth: 32})
	}
	if len(detail.Tables) == 0 {
		for _, text := range detail.Text {
			fmt.Fprintln(app.Out, SanitizeLine(text))
		}
	}
}

func renderTableResult(app *App, result domain.TableResult) {
	title := result.Section
	labels := map[string]string{
		"bysj":                             "毕业设计成绩",
		jwgl.ProfileSectionPrimaryMajor:    "主修专业信息",
		jwgl.ProfileSectionSecondaryMajor:  "辅修专业信息",
		jwgl.ProfileSectionUnassignedMajor: "微专业信息",
		jwgl.ProfileSectionExamLevels:      "等级考试",
		jwgl.ProfileSectionFamily:          "家庭成员",
		jwgl.ProfileSectionRecords:         "学习简历",
		jwgl.ProfileSectionAcademicYears:   "学年鉴定",
		jwgl.ProfileSectionSelectedCourses: "已选课程（个人信息页）",
		"teaching-units":                   "开课单位",
		"grades":                           "年级",
		"colleges":                         "学院",
		"majors":                           "专业",
		"classes":                          "班级",
		"campuses":                         "校区",
		"course-categories":                "课程类别",
		"course-natures":                   "课程性质",
		"course-ownerships":                "课程归属",
		"teaching-methods":                 "教学方式",
		"class-times":                      "上课时间",
		"sections":                         "上课节次",
	}
	if label := labels[result.Section]; label != "" {
		title = label
	}
	if result.Section == jwgl.ProfileSectionClasses {
		title = "班级信息"
	}
	fmt.Fprintln(app.Out, app.Header(title))
	if len(result.Rows) == 0 {
		fmt.Fprintln(app.Out, app.Info("暂无记录"))
		return
	}
	WriteTable(app.Out, result.Headers, result.Rows, TableOptions{MaxColumnWidth: 30})
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 条记录", len(result.Rows))))
}

func renderSelectionStatus(app *App, status domain.SelectionStatus) {
	fmt.Fprintln(app.Out, app.Header("选课状态"))
	fmt.Fprintf(app.Out, "  状态码：%s\n", SanitizeLine(status.Code))
}

func renderUnplannedExams(app *App, items []domain.UnplannedExamItem, term domain.Term) {
	fmt.Fprintln(app.Out, app.Header("未排考课程   "+domain.TermLabel(term.AcademicYear, term.Semester)))
	if len(items) == 0 {
		fmt.Fprintln(app.Out, app.Info("暂无未排考课程"))
		return
	}
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		rows = append(rows, []string{
			item.CourseName, item.CourseCode, stringValue(item.ExamName, ""),
			stringValue(item.TeachingClass, ""), stringValue(item.Teacher, ""),
			stringValue(item.College, ""), floatString(item.Credit),
			stringValue(item.StudentID, ""), stringValue(item.StudentName, ""),
			stringValue(item.ClassName, ""), stringValue(item.Major, ""),
			stringValue(item.Process, ""),
		})
	}
	WriteTable(app.Out, []string{"课程", "课程号", "考试名称", "教学班", "教师", "开课学院", "学分", "学号", "姓名", "班级", "专业", "进程"}, rows, TableOptions{MaxColumnWidth: 18})
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 条未排考课程", len(items))))
}

func renderNotifications(app *App, items []domain.NotificationItem) {
	fmt.Fprintln(app.Out, app.Header("通知 / 待办"))
	if len(items) == 0 {
		fmt.Fprintln(app.Out, app.Info("暂无通知或待办事项"))
		return
	}
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		unread := ""
		if item.Unread != nil {
			unread = map[bool]string{true: "是", false: "否"}[*item.Unread]
		} else {
			unread = "-"
		}
		rows = append(rows, []string{
			stringValue(item.CreatedAt, ""), stringValue(item.Type, ""), stringValue(item.Title, ""),
			stringValue(item.Content, ""), unread,
		})
	}
	WriteTable(app.Out, []string{"时间", "类型", "标题", "内容", "未读"}, rows, TableOptions{MaxColumnWidth: 32})
}

func renderGPA(app *App, view application.GpaView) {
	fmt.Fprintln(app.Out, app.Header("学业成绩概览"))
	if len(view.Rows) == 0 {
		fmt.Fprintln(app.Out, app.Info("页面未识别出结构化 GPA/学分字段，请使用 --json 查看原始文本"))
		if len(view.Summary.RawText) > 0 {
			rows := make([][]string, 0, len(view.Summary.RawText))
			for _, text := range view.Summary.RawText {
				rows = append(rows, []string{text})
			}
			WriteTable(app.Out, []string{"页面文本"}, rows, TableOptions{})
		}
		return
	}
	labels := map[string]string{
		"gpa": "平均绩点", "averageScore": "平均成绩", "totalCredits": "总学分", "earnedCredits": "已修学分",
	}
	rows := make([][]string, 0, len(view.Rows))
	for _, row := range view.Rows {
		rows = append(rows, []string{labels[row.Field], row.Value})
	}
	WriteTable(app.Out, []string{"项目", "数值"}, rows, TableOptions{})
}

func renderAcademia(app *App, view application.AcademiaView) {
	if view.Category != nil {
		renderAcademiaCategory(app, *view.Category)
		return
	}
	overview := view.Overview
	if overview == nil {
		return
	}
	title := "学业情况"
	if overview.Summary.StudentID != nil {
		title += "   " + *overview.Summary.StudentID
	}
	fmt.Fprintln(app.Out, app.Header(title))
	if overview.Summary.GPA != nil {
		fmt.Fprintf(app.Out, "平均绩点：%s\n", formatFloat(*overview.Summary.GPA))
	}
	labels := map[string]string{
		"plannedCourses": "计划总课程", "passedCourses": "已通过课程", "failedCourses": "未通过课程",
		"unlearnedCourses": "未修课程", "inProgressCourses": "在读课程",
		"unplannedPassedCourses": "计划外已通过", "unplannedFailedCourses": "计划外未通过",
	}
	if len(overview.Stats) > 0 {
		rows := make([][]string, 0, len(overview.Stats))
		for _, stat := range overview.Stats {
			rows = append(rows, []string{labels[stat.Field], strconv.Itoa(stat.Value)})
		}
		WriteTable(app.Out, []string{"统计项目", "数量"}, rows, TableOptions{})
	}
	if len(overview.Summary.Categories) == 0 && len(overview.Stats) == 0 {
		fmt.Fprintln(app.Out, app.Info("页面未识别出课程分类明细，请使用 --json 查看原始文本"))
		if len(overview.Summary.RawText) > 0 {
			rows := make([][]string, 0, len(overview.Summary.RawText))
			for _, text := range overview.Summary.RawText {
				rows = append(rows, []string{text})
			}
			WriteTable(app.Out, []string{"页面文本"}, rows, TableOptions{})
		}
		return
	}
	rows := make([][]string, 0, len(overview.Summary.Categories))
	for _, category := range overview.Summary.Categories {
		detail := ""
		if category.DetailAvailable {
			detail = "可查(--category)"
		}
		rows = append(rows, []string{
			category.Name, floatString(category.RequiredCredits), floatString(category.EarnedCredits),
			floatString(category.MissingCredits), detail,
		})
	}
	WriteTable(app.Out, []string{"课程分类", "要求学分", "已获学分", "未获学分", "详情"}, rows, TableOptions{})
}

func renderAcademiaCategory(app *App, detail application.AcademiaCategoryDetail) {
	fmt.Fprintln(app.Out, app.Header("学业情况 · "+detail.Category.Name))
	if detail.Category.RequiredCredits != nil {
		fmt.Fprintf(app.Out, "要求 %s 学分 · 已获 %s · 未获 %s\n",
			floatString(detail.Category.RequiredCredits), floatStringZero(detail.Category.EarnedCredits), floatStringZero(detail.Category.MissingCredits))
	}
	if len(detail.Courses) == 0 {
		fmt.Fprintln(app.Out, app.Info("该分类暂无课程明细（可能是汇总节点或无数据）"))
		return
	}
	rows := make([][]string, 0, len(detail.Courses))
	for _, course := range detail.Courses {
		best := ""
		if course.MaxGrade != nil && (course.Grade == nil || *course.MaxGrade != *course.Grade) {
			best = *course.MaxGrade
		}
		planned := "计划外"
		if course.Planned {
			planned = "计划"
		}
		rows = append(rows, []string{
			stringValue(course.Title, ""), stringValue(course.CourseID, ""), stringValue(course.Nature, ""),
			stringValue(course.Category, ""), floatString(course.Credit), stringValue(course.Grade, ""),
			best, floatString(course.GPA), stringValue(course.DisplayTerm, ""), planned,
		})
	}
	WriteTable(app.Out, []string{"课程", "课程号", "性质", "类别", "学分", "成绩", "最佳", "绩点", "建议学期", "计划"}, rows, TableOptions{})
}

func renderSelectedCourses(app *App, items []domain.SelectedCourseItem, term domain.Term) {
	fmt.Fprintln(app.Out, app.Header("已选课程   "+domain.TermLabel(term.AcademicYear, term.Semester)))
	if len(items) == 0 {
		fmt.Fprintln(app.Out, app.Info("该学期暂无已选课程"))
		return
	}
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		capacity := ""
		if item.Capacity != nil || item.SelectedNumber != nil {
			capacity = fmt.Sprintf("%s/%s", floatStringOrDash(item.Capacity), floatStringOrDash(item.SelectedNumber))
		}
		rows = append(rows, []string{
			stringValue(item.Title, ""), stringValue(item.CourseID, ""), stringValue(item.ClassID, ""),
			stringValue(item.Teacher, ""), floatString(item.Credit), capacity,
			stringValue(item.Place, ""), stringValue(item.Time, ""),
		})
	}
	WriteTable(app.Out, []string{"课程", "课程号", "教学班", "教师", "学分", "容量/已选", "地点", "时间"}, rows, TableOptions{MaxColumnWidth: 28})
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 门已选课程", len(items))))
}

func renderWarning(app *App, status domain.WarningStatus) {
	fmt.Fprintln(app.Out, app.Header("学业预警"))
	if !status.HasWarning {
		for _, message := range status.Messages {
			fmt.Fprintln(app.Out, app.Info(message))
		}
		return
	}
	headers := status.Headers
	if len(headers) == 0 && len(status.Rows) > 0 {
		for index := range status.Rows[0] {
			headers = append(headers, fmt.Sprintf("第%d列", index+1))
		}
	}
	WriteTable(app.Out, headers, status.Rows, TableOptions{})
	fmt.Fprintln(app.Out, app.Warning(fmt.Sprintf("共 %d 条预警记录", len(status.Rows))))
}

func renderPayments(app *App, items []domain.PaymentItem, term domain.Term) {
	fmt.Fprintln(app.Out, app.Header("学生缴费   "+domain.TermLabel(term.AcademicYear, term.Semester)))
	if len(items) == 0 {
		fmt.Fprintln(app.Out, app.Info("该学期没有缴费记录"))
		return
	}
	rows := make([][]string, 0, len(items))
	for _, item := range items {
		period := ""
		if item.PayStart != nil || item.PayEnd != nil {
			period = stringValue(item.PayStart, "?") + " ~ " + stringValue(item.PayEnd, "?")
		}
		rows = append(rows, []string{
			stringValue(item.AcademicYear, ""), stringValue(item.Semester, ""), stringValue(item.Type, ""),
			stringValue(item.Item, ""), stringValue(item.Amount, ""), stringValue(item.Status, ""),
			stringValue(item.PaidAt, ""), period, stringValue(item.OrderID, ""),
		})
	}
	WriteTable(app.Out, []string{"学年", "学期", "类型", "缴费项目", "金额", "状态", "缴费时间", "缴费期限", "订单号"}, rows, TableOptions{MaxColumnWidth: 26})
	fmt.Fprintln(app.Out, app.Success(fmt.Sprintf("共 %d 条缴费记录", len(items))))
}

func describeTimeSlot(criteria application.FreeClassroomsCriteria) string {
	var parts []string
	if len(criteria.Weeks) > 0 {
		parts = append(parts, "第 "+joinInts(criteria.Weeks, "/")+" 周")
	}
	if len(criteria.Weekdays) > 0 {
		var days []string
		for _, day := range criteria.Weekdays {
			if day >= 1 && day <= 7 {
				days = append(days, "周"+string([]rune(dayNames[day-1])[1]))
			}
		}
		parts = append(parts, strings.Join(days, "/"))
	}
	if len(criteria.Sections) > 0 {
		parts = append(parts, "第 "+joinInts(criteria.Sections, "/")+" 节")
	}
	return strings.Join(parts, " · ")
}

func describeRoomFilters(criteria application.FreeClassroomsCriteria) string {
	var parts []string
	if criteria.Campus != "" {
		parts = append(parts, "校区含「"+criteria.Campus+"」")
	}
	if criteria.Type != "" {
		parts = append(parts, "类别含「"+criteria.Type+"」")
	}
	if criteria.Building != "" {
		parts = append(parts, "楼号含「"+criteria.Building+"」")
	}
	if criteria.Name != "" {
		parts = append(parts, "名称含「"+criteria.Name+"」")
	}
	if criteria.MinSeats != nil {
		parts = append(parts, fmt.Sprintf("座位 ≥ %d", *criteria.MinSeats))
	}
	return strings.Join(parts, " · ")
}

func describePlanScope(view application.PlanView, all bool) string {
	if all {
		return "全校 · 全部年级/专业"
	}
	var parts []string
	if view.Scope.Grade != nil {
		parts = append(parts, view.Scope.Grade.Label)
	}
	if view.Scope.Major != nil {
		parts = append(parts, view.Scope.Major.Label)
	}
	if view.Scope.College != nil {
		parts = append(parts, view.Scope.College.Label)
	}
	if len(parts) == 0 {
		return "全部"
	}
	return strings.Join(parts, " · ")
}

func stringValue(value *string, fallback string) string {
	if value == nil || *value == "" {
		return fallback
	}
	return *value
}

func floatString(value *float64) string {
	if value == nil {
		return ""
	}
	return formatFloat(*value)
}

func floatStringZero(value *float64) string {
	if value == nil {
		return "0"
	}
	return formatFloat(*value)
}

func floatStringOrDash(value *float64) string {
	if value == nil {
		return "-"
	}
	return formatFloat(*value)
}

func intValue(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func sectionRange(start, end *int) string {
	if start == nil {
		return ""
	}
	if end == nil || *start == *end {
		return strconv.Itoa(*start)
	}
	return fmt.Sprintf("%d~%d", *start, *end)
}

func creditSuffix(value *float64) string {
	if value == nil {
		return ""
	}
	return "  学分:" + formatFloat(*value)
}

func optionText(option *domain.SelectOption) string {
	if option == nil {
		return ""
	}
	return option.Label
}

func nonEmpty(values []string) []string {
	result := values[:0]
	for _, value := range values {
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}

func joinInts(values []int, separator string) string {
	parts := make([]string, 0, len(values))
	for _, value := range values {
		parts = append(parts, strconv.Itoa(value))
	}
	return strings.Join(parts, separator)
}
