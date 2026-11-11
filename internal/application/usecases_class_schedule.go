package application

import (
	"context"
	"sort"

	"github.com/mico-v/usts-cli/internal/domain"
)

type ClassScheduleFlags struct {
	College string
	Major   string
	Campus  string
	Grade   string
	Class   string
}

type ClassTimetable struct {
	Days        []ClassScheduleDay
	Untimed     []domain.ClassScheduleItem
	Practice    []string
	CourseCount int
}

type ClassScheduleDay struct {
	Day   int                        `json:"day"`
	Items []domain.ClassScheduleItem `json:"items"`
}

func ResolveClassQueryByFlags(
	ctx context.Context,
	gateway ClassScheduleGateway,
	options domain.ClassScheduleView,
	flags ClassScheduleFlags,
	term domain.Term,
) (domain.ClassScheduleQuery, error) {
	college := PickOption(flags.College, options.Colleges)
	if college == nil {
		return domain.ClassScheduleQuery{}, domain.ConfigError("未找到学院：%s", flags.College)
	}
	var campus *domain.SelectOption
	if flags.Campus != "" {
		campus = PickOption(flags.Campus, options.Campuses)
		if campus == nil {
			return domain.ClassScheduleQuery{}, domain.ConfigError("未找到校区：%s", flags.Campus)
		}
	}
	gradeID := flags.Grade
	if gradeID == "" {
		gradeID = options.DefaultGrade
	}
	majors, err := gateway.GetMajorsByCollege(ctx, college.Value)
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	major := PickOption(flags.Major, majors, "zyh")
	if major == nil {
		return domain.ClassScheduleQuery{}, domain.ConfigError("未找到专业：%s", flags.Major)
	}
	classes, err := gateway.GetClassesByMajor(ctx, college.Value, major.Value, gradeID)
	if err != nil {
		return domain.ClassScheduleQuery{}, err
	}
	class := PickOption(flags.Class, classes, "bh")
	if class == nil {
		return domain.ClassScheduleQuery{}, domain.ConfigError("未找到班级：%s", flags.Class)
	}
	return BuildClassQuery(term, college, major, class, campus, gradeID, GradeLabel(gradeID, options)), nil
}

func BuildClassQuery(
	term domain.Term,
	college, major, class *domain.SelectOption,
	campus *domain.SelectOption,
	gradeID, gradeName string,
) domain.ClassScheduleQuery {
	campusID := ""
	if campus != nil {
		campusID = campus.Value
	}
	classNumber := ""
	if class != nil {
		if raw, ok := class.Meta["bh"]; ok {
			classNumber = toString(raw)
		}
	}
	query := domain.ClassScheduleQuery{
		XNM:         term.AcademicYear,
		XQM:         term.Semester,
		CampusID:    campusID,
		GradeID:     gradeID,
		GradeName:   gradeName,
		ClassNumber: classNumber,
	}
	if college != nil {
		query.CollegeName = college.Label
	}
	if major != nil {
		query.MajorID = major.Value
		query.MajorName = major.Label
	}
	if class != nil {
		query.ClassID = class.Value
		query.ClassName = class.Label
	}
	return query
}

func GradeLabel(gradeID string, options domain.ClassScheduleView) string {
	for _, option := range options.Grades {
		if option.Value == gradeID {
			return option.Label
		}
	}
	return gradeID
}

func ReadClassSchedule(
	ctx context.Context,
	gateway ClassScheduleGateway,
	query domain.ClassScheduleQuery,
) (ClassTimetable, error) {
	items, practice, err := gateway.QueryClassSchedule(ctx, query)
	if err != nil {
		return ClassTimetable{}, err
	}
	if practice == nil {
		practice = make([]string, 0)
	}
	var timed []domain.ClassScheduleItem
	untimed := make([]domain.ClassScheduleItem, 0)
	for _, item := range items {
		if item.Weekday != nil && *item.Weekday > 0 && item.StartSection != nil && *item.StartSection > 0 {
			timed = append(timed, item)
		} else {
			untimed = append(untimed, item)
		}
	}
	sort.SliceStable(timed, func(i, j int) bool {
		if *timed[i].Weekday == *timed[j].Weekday {
			return *timed[i].StartSection < *timed[j].StartSection
		}
		return *timed[i].Weekday < *timed[j].Weekday
	})
	days := make([]ClassScheduleDay, 0)
	for day := 1; day <= 7; day++ {
		var today []domain.ClassScheduleItem
		for _, item := range timed {
			if *item.Weekday == day {
				today = append(today, item)
			}
		}
		if len(today) > 0 {
			days = append(days, ClassScheduleDay{Day: day, Items: today})
		}
	}
	return ClassTimetable{
		Days:        days,
		Untimed:     untimed,
		Practice:    practice,
		CourseCount: len(timed) + len(untimed),
	}, nil
}
