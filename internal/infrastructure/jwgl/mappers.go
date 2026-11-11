package jwgl

import (
	"regexp"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
)

var teacherPattern = regexp.MustCompile(`/([^/]+)/`)

func mapScoreItem(item RawRecord) (domain.ScoreItem, error) {
	if err := AssertAnyField(item, []string{"kcmc", "kch"}, "成绩条目"); err != nil {
		return domain.ScoreItem{}, err
	}
	return domain.ScoreItem{
		CourseName:    StringValue(item, "kcmc"),
		CourseCode:    StringValue(item, "kch"),
		CourseNature:  StringValue(item, "kcxzmc"),
		Credit:        NumberValue(item, "xf"),
		Score:         StringValue(item, "cj"),
		GPA:           NumberValue(item, "jd"),
		College:       StringValue(item, "jgmc"),
		Teacher:       StringValue(item, "jsxm"),
		AssessMethod:  StringValue(item, "khfsmc"),
		ExamType:      StringValue(item, "ksxz"),
		AcademicYear:  StringValue(item, "xnmmc"),
		Semester:      StringValue(item, "xqmmc"),
		ClassName:     StringValue(item, "bj"),
		Major:         StringValue(item, "zymc"),
		TeachingClass: StringValue(item, "jxbmc"),
	}, nil
}

func mapScheduleItem(item RawRecord) (domain.ScheduleItem, error) {
	if err := AssertAnyField(item, []string{"kcmc", "jxbzh"}, "课表条目"); err != nil {
		return domain.ScheduleItem{}, err
	}
	start, end := ParseSections(StringValue(item, "jc"))
	return domain.ScheduleItem{
		CourseName:   StringValue(item, "kcmc"),
		Teacher:      OptionalString(item, "jsxm"),
		ClassName:    OptionalString(item, "jxbzh"),
		Campus:       OptionalString(item, "xqmc"),
		Credit:       NumberValue(item, "xf"),
		Weeks:        OptionalString(item, "qsjsz"),
		CourseType:   OptionalString(item, "kclb"),
		AssessMethod: OptionalString(item, "khfsmc"),
		AcademicYear: StringValue(item, "xnmc"),
		Weekday:      IntValue(item, "xqj"),
		StartSection: start,
		EndSection:   end,
	}, nil
}

func mapClassScheduleItem(item RawRecord) (domain.ClassScheduleItem, error) {
	if err := AssertAnyField(item, []string{"kcmc", "jxbmc"}, "班级课表条目"); err != nil {
		return domain.ClassScheduleItem{}, err
	}
	start, end := ParseSections(firstNonEmpty(StringValue(item, "jcor"), StringValue(item, "jcs")))
	return domain.ClassScheduleItem{
		CourseName:       StringValue(item, "kcmc"),
		Teacher:          OptionalString(item, "xm"),
		TeacherTitle:     OptionalString(item, "zcmc"),
		TeachingClass:    OptionalString(item, "jxbmc"),
		ClassComposition: OptionalString(item, "jxbzc"),
		Campus:           OptionalString(item, "xqmc"),
		Room:             OptionalString(item, "cdmc"),
		Credit:           NumberValue(item, "xf"),
		Weeks:            OptionalString(item, "zcd"),
		AssessMethod:     OptionalString(item, "khfsmc"),
		CourseNature:     OptionalString(item, "kcxzjc"),
		Weekday:          IntValue(item, "xqj"),
		StartSection:     start,
		EndSection:       end,
	}, nil
}

func mapExamItem(item RawRecord) (domain.ExamItem, error) {
	if err := AssertAnyField(item, []string{"kcmc", "kchmc"}, "考试条目"); err != nil {
		return domain.ExamItem{}, err
	}
	return domain.ExamItem{
		CourseName: firstNonEmpty(StringValue(item, "kcmc"), StringValue(item, "kchmc")),
		ExamTime:   firstNonEmpty(StringValue(item, "kssj"), StringValue(item, "kssjmc"), StringValue(item, "ksrq"), StringValue(item, "kssj_str")),
		Location:   firstNonEmpty(StringValue(item, "cdmc"), StringValue(item, "jsmc"), StringValue(item, "jsbh"), StringValue(item, "kcdd"), StringValue(item, "cdmcxx")),
		Seat:       firstNonEmpty(StringValue(item, "zwh"), StringValue(item, "kxh"), StringValue(item, "zwhh"), StringValue(item, "zw")),
		ExamType:   firstNonEmpty(StringValue(item, "ksxzmc"), StringValue(item, "ksxz"), StringValue(item, "kslxmc"), StringValue(item, "kslbmc")),
	}, nil
}

func mapCourseListItem(item RawRecord) (domain.CourseListItem, error) {
	if err := AssertAnyField(item, []string{"kcmc", "kchmc"}, "选课名单条目"); err != nil {
		return domain.CourseListItem{}, err
	}
	return domain.CourseListItem{
		CourseName:    firstNonEmpty(StringValue(item, "kcmc"), StringValue(item, "kchmc")),
		CourseCode:    firstNonEmpty(StringValue(item, "kch"), StringValue(item, "kcbh"), StringValue(item, "kcdm")),
		Credit:        StringValue(item, "xf"),
		Teacher:       firstNonEmpty(StringValue(item, "jsmc"), StringValue(item, "jsxx"), StringValue(item, "jsxm"), StringValue(item, "rkjs")),
		TeachingClass: firstNonEmpty(StringValue(item, "jxbmc"), StringValue(item, "jxbdm"), StringValue(item, "xkb")),
	}, nil
}

func mapSelectedCourseItem(item RawRecord) (domain.SelectedCourseItem, error) {
	if err := AssertAnyField(item, []string{"kcmc", "kchmc", "kch_id"}, "已选课程条目"); err != nil {
		return domain.SelectedCourseItem{}, err
	}
	teacher := OptionalString(item, "jsmc", "jsxm")
	if raw := StringValue(item, "jsxx"); raw != "" {
		if match := teacherPattern.FindStringSubmatch(raw); len(match) == 2 {
			value := strings.TrimSpace(match[1])
			teacher = &value
		}
	}
	place := CleanHTML(StringValue(item, "jxdd"))
	timeText := CleanHTML(StringValue(item, "sksj"))
	return domain.SelectedCourseItem{
		CourseID:       OptionalString(item, "kch_id", "kch"),
		ClassID:        OptionalString(item, "jxb_id", "jxbid"),
		Title:          OptionalString(item, "kcmc", "kchmc"),
		Teacher:        teacher,
		Credit:         NumberValue(item, "xf"),
		Category:       OptionalString(item, "kklxmc", "kclbmc"),
		Capacity:       NumberValue(item, "jxbrs"),
		SelectedNumber: NumberValue(item, "yxzrs"),
		Place:          optionalText(place),
		Time:           optionalText(timeText),
	}, nil
}

func mapAcademiaCourseItem(item RawRecord) (domain.AcademiaCourseItem, error) {
	if err := AssertAnyField(item, []string{"KCMC", "KCH"}, "学业课程条目"); err != nil {
		return domain.AcademiaCourseItem{}, err
	}
	displayTerm := strings.Join(nonEmptyStrings(StringValue(item, "JYXDXNMC"), StringValue(item, "JYXDXQMC")), "·")
	return domain.AcademiaCourseItem{
		CourseID:    OptionalString(item, "KCH"),
		Title:       OptionalString(item, "KCMC"),
		Credit:      NumberValue(item, "XF"),
		Category:    OptionalString(item, "KCLBMC"),
		Nature:      OptionalString(item, "KCXZMC"),
		Grade:       OptionalString(item, "CJ"),
		MaxGrade:    OptionalString(item, "MAXCJ"),
		GPA:         NumberValue(item, "JD"),
		DisplayTerm: optionalText(displayTerm),
		Planned:     StringValue(item, "SFJHKC") == "是",
	}, nil
}

func mapFreeClassroom(item RawRecord) (domain.FreeClassroom, error) {
	if err := AssertAnyField(item, []string{"cdmc", "cdbh"}, "空闲场地条目"); err != nil {
		return domain.FreeClassroom{}, err
	}
	return domain.FreeClassroom{
		Code:       OptionalString(item, "cdbh"),
		Name:       StringValue(item, "cdmc"),
		Category:   OptionalString(item, "cdlbmc"),
		Campus:     OptionalString(item, "xqmc"),
		Building:   OptionalString(item, "jxlmc"),
		Seats:      NumberValue(item, "zws"),
		Borrowable: OptionalString(item, "sfkjy"),
	}, nil
}

func mapPlanEntry(item RawRecord) (domain.PlanEntry, error) {
	if err := AssertAnyField(item, []string{"jxzxjhxx_id", "zymc"}, "执行计划条目"); err != nil {
		return domain.PlanEntry{}, err
	}
	return domain.PlanEntry{
		ID:              OptionalString(item, "jxzxjhxx_id"),
		Grade:           OptionalString(item, "njmc"),
		MajorCode:       OptionalString(item, "zyh"),
		Major:           OptionalString(item, "zymc"),
		Category:        OptionalString(item, "dlbs"),
		TaskClass:       OptionalString(item, "rwbj"),
		PlannedStudents: NumberValue(item, "jhrs"),
		Campus:          OptionalString(item, "xqmc"),
		CourseCount:     NumberValue(item, "kcs"),
		TotalCredits:    NumberValue(item, "zdxf"),
		SchoolLength:    OptionalString(item, "xz"),
	}, nil
}

func mapPlanCourse(item RawRecord) (domain.PlanCourse, error) {
	if err := AssertAnyField(item, []string{"kch", "kcmc"}, "执行计划课程条目"); err != nil {
		return domain.PlanCourse{}, err
	}
	suggested := StringValue(item, "yyxdxnxqmc")
	if suggested == "" {
		suggested = strings.Join(nonEmptyStrings(StringValue(item, "jyxdxnm"), StringValue(item, "jyxdxqm")), "/")
	}
	return domain.PlanCourse{
		Code:          OptionalString(item, "kch"),
		Name:          OptionalString(item, "kcmc"),
		Credit:        NumberValue(item, "xf"),
		Hours:         NumberValue(item, "zxs"),
		Nature:        OptionalString(item, "kcxzmc"),
		Category:      OptionalString(item, "kclbmc"),
		SuggestedTerm: optionalText(suggested),
		AssessMethod:  OptionalString(item, "khfsdm"),
		Department:    OptionalString(item, "kkbmmc"),
	}, nil
}

func mapPaymentItem(item RawRecord) (domain.PaymentItem, error) {
	if err := AssertAnyField(item, []string{"zfywsj_ids", "order_name"}, "缴费条目"); err != nil {
		return domain.PaymentItem{}, err
	}
	return domain.PaymentItem{
		AcademicYear: OptionalString(item, "xnmc"),
		Semester:     OptionalString(item, "xqmc"),
		Type:         OptionalString(item, "ywmc"),
		Item:         OptionalString(item, "order_name"),
		Amount:       OptionalString(item, "order_amount"),
		Status:       OptionalString(item, "sfqr"),
		PaidAt:       OptionalString(item, "pay_time"),
		OrderID:      OptionalString(item, "order_id"),
		PayStart:     OptionalString(item, "jfkssj"),
		PayEnd:       OptionalString(item, "jfjssj"),
	}, nil
}

func mapMinorScheduleEntry(item RawRecord) (domain.MinorScheduleEntry, error) {
	if err := AssertAnyField(item, []string{"tjkbmc", "zymc"}, "微专业课表条目"); err != nil {
		return domain.MinorScheduleEntry{}, err
	}
	return domain.MinorScheduleEntry{
		College: OptionalString(item, "jgmc"),
		Grade:   OptionalString(item, "njmc"),
		Major:   OptionalString(item, "zymc"),
		Name:    OptionalString(item, "tjkbmc"),
	}, nil
}

func optionalText(value string) *string {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return &value
}

func nonEmptyStrings(values ...string) []string {
	var result []string
	for _, value := range values {
		if value != "" {
			result = append(result, value)
		}
	}
	return result
}
