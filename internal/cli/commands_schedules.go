package cli

import (
	"context"
	"flag"

	"github.com/mico-v/usts-cli/internal/application"
	"github.com/mico-v/usts-cli/internal/domain"
)

type classScheduleOptions struct {
	CommonOptions
	Campus  string
	Grade   string
	College string
	Major   string
	Class   string
}

type freeClassOptions struct {
	CommonOptions
	Week     string
	Weekday  string
	Section  string
	Campus   string
	Type     string
	Building string
	Name     string
	MinSeats int
	Limit    int
}

type planOptions struct {
	CommonOptions
	All        bool
	College    string
	Grade      string
	Major      string
	Course     bool
	CourseCode string
	Limit      int
}

type minorScheduleOptions struct {
	CommonOptions
	Kind    string
	College string
	Grade   string
	Major   string
}

func bindClassSchedule(fs *flag.FlagSet, options any) {
	opts := options.(*classScheduleOptions)
	fs.StringVar(&opts.Campus, "xqh", "", "校区：id 或名称（默认石湖）")
	fs.StringVar(&opts.Grade, "nj", "", "年级 id，如 2025")
	fs.StringVar(&opts.College, "jg", "", "学院：id 或名称")
	fs.StringVar(&opts.Major, "zy", "", "专业：id 或名称")
	fs.StringVar(&opts.Class, "bh", "", "班级：名称或编号")
}

func bindFreeClass(fs *flag.FlagSet, options any) {
	opts := options.(*freeClassOptions)
	fs.StringVar(&opts.Week, "week", "", "周次，如 3、1-4、3,5,7")
	fs.StringVar(&opts.Weekday, "weekday", "", "星期，1=周一 … 7=周日")
	fs.StringVar(&opts.Section, "section", "", "节次，如 5 或 5-6")
	fs.StringVar(&opts.Campus, "campus", "", "校区名称包含")
	fs.StringVar(&opts.Type, "type", "", "场地类别名称包含")
	fs.StringVar(&opts.Building, "building", "", "楼号名称包含")
	fs.StringVar(&opts.Name, "name", "", "场地名称/编号包含")
	fs.IntVar(&opts.MinSeats, "min-seats", -1, "只显示座位数不少于该值的场地")
	fs.IntVar(&opts.Limit, "limit", 50, "终端最多显示多少条，0=全部")
}

func bindPlan(fs *flag.FlagSet, options any) {
	opts := options.(*planOptions)
	fs.BoolVar(&opts.All, "all", false, "不按本学院/本年级/本专业过滤，查全校")
	fs.StringVar(&opts.College, "college", "", "学院：id、全名或名称子串")
	fs.StringVar(&opts.Grade, "grade", "", "年级，如 2025")
	fs.StringVar(&opts.Major, "major", "", "专业：id、全名或名称子串")
	fs.BoolVar(&opts.Course, "course", false, "查看课程明细")
	fs.StringVar(&opts.CourseCode, "course-code", "", "课程号（支持部分匹配）")
	fs.IntVar(&opts.Limit, "limit", 20, "终端最多显示多少条，0=全部")
}

func bindMinor(fs *flag.FlagSet, options any) {
	opts := options.(*minorScheduleOptions)
	fs.StringVar(&opts.Kind, "kind", "", "课表类型：微专业 / 二学位 / 辅修")
	fs.StringVar(&opts.College, "college", "", "学院：id、全名或名称子串")
	fs.StringVar(&opts.Grade, "grade", "", "年级，如 2025")
	fs.StringVar(&opts.Major, "major", "", "专业：id、全名或名称子串")
}

func runClassSchedule(ctx context.Context, app *App, options any) error {
	opts := options.(*classScheduleOptions)
	if opts.Class == "" && !app.InTTY {
		return domain.ConfigError("班级课表的级联选择需要交互式终端，但当前 stdin 不是终端。请改用 --jg/--zy/--bh 指定班级")
	}
	if opts.Class != "" && opts.College == "" {
		return domain.ConfigError("指定 --bh 查询具体班级时，必须同时给出 --jg（学院）")
	}
	if opts.Class != "" && opts.Major == "" {
		return domain.ConfigError("指定 --bh 查询具体班级时，必须同时给出 --zy（专业）")
	}
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	term = domain.ConcreteTerm(term, app.Now())
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	view, err := app.Client.GetBjkbdyOptions(ctx)
	if err != nil {
		return err
	}
	var query domain.ClassScheduleQuery
	if opts.Class != "" {
		query, err = application.ResolveClassQueryByFlags(ctx, app.Client, view, application.ClassScheduleFlags{
			College: opts.College, Major: opts.Major, Campus: opts.Campus, Grade: opts.Grade, Class: opts.Class,
		}, term)
		if err != nil {
			return err
		}
	} else {
		query, err = InteractiveClassSchedule(ctx, app, view, term)
		if err != nil {
			return err
		}
	}
	timetable, err := application.ReadClassSchedule(ctx, app.Client, query)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "clsched", map[string]any{
			"query": query, "days": timetable.Days, "untimed": timetable.Untimed, "practice": timetable.Practice,
		}, map[string]any{"xnm": term.AcademicYear, "xqm": term.Semester})
	}
	renderClassSchedule(app, timetable, query, term)
	return nil
}

func runFreeClass(ctx context.Context, app *App, options any) error {
	opts := options.(*freeClassOptions)
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if opts.MinSeats != -1 && opts.MinSeats < 1 {
		return domain.ConfigError("--min-seats 必须是不小于 1 的整数")
	}
	if opts.Limit < 0 {
		return domain.ConfigError("--limit 必须是不小于 0 的整数")
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	var minSeats *int
	if opts.MinSeats >= 1 {
		minSeats = &opts.MinSeats
	}
	view, err := application.ReadFreeClassrooms(ctx, app.Client, application.FreeClassroomsQuery{
		XNM: term.AcademicYear, XQM: term.Semester, Week: opts.Week, Weekday: opts.Weekday,
		Section: opts.Section, Campus: opts.Campus, Type: opts.Type, Building: opts.Building,
		Name: opts.Name, MinSeats: minSeats,
	})
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "freeclass", view.Items, map[string]any{
			"xnm": term.AcademicYear, "xqm": term.Semester,
			"serverTotal": view.Total,
			"criteria": map[string]any{
				"weeks": view.Criteria.Weeks, "weekdays": view.Criteria.Weekdays, "sections": view.Criteria.Sections,
				"campus": nullableString(view.Criteria.Campus), "type": nullableString(view.Criteria.Type),
				"building": nullableString(view.Criteria.Building), "name": nullableString(view.Criteria.Name),
				"minSeats": view.Criteria.MinSeats,
			},
		})
	}
	renderFreeClassrooms(app, view, term, opts.Limit)
	return nil
}

func runPlan(ctx context.Context, app *App, options any) error {
	opts := options.(*planOptions)
	if opts.Limit < 0 {
		return domain.ConfigError("--limit 必须是不小于 0 的整数")
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	var course *string
	if opts.Course || opts.CourseCode != "" {
		course = &opts.CourseCode
	}
	view, err := application.ReadPlan(ctx, app.Client, application.PlanQuery{
		All: opts.All, College: opts.College, Grade: opts.Grade, Major: opts.Major, Course: course,
	})
	if err != nil {
		return err
	}
	if opts.JSON {
		meta := map[string]any{
			"scope": map[string]any{
				"college": optionLabel(view.Scope.College), "grade": optionLabel(view.Scope.Grade), "major": optionLabel(view.Scope.Major),
			},
		}
		if view.CourseCode != nil {
			meta["course"] = *view.CourseCode
		}
		return WriteEnvelope(app.Out, "plan", map[string]any{
			"entries": view.Entries, "courses": view.Courses,
		}, meta)
	}
	renderPlan(app, view, opts.All, opts.Limit)
	return nil
}

func runMinorSchedule(ctx context.Context, app *App, options any) error {
	opts := options.(*minorScheduleOptions)
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	view, err := application.ReadMinorSchedules(ctx, app.Client, application.MinorScheduleQueryInput{
		Term: term, Kind: opts.Kind, College: opts.College, Grade: opts.Grade, Major: opts.Major,
	})
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "minor-schedule", view.Entries, map[string]any{
			"xnm": term.AcademicYear, "xqm": term.Semester, "kind": view.Kind.Name,
			"scope": map[string]any{
				"college": optionLabel(view.Scope.College), "grade": optionLabel(view.Scope.Grade), "major": optionLabel(view.Scope.Major),
			},
		})
	}
	renderMinorSchedule(app, view, term)
	return nil
}

func optionLabel(option *domain.SelectOption) any {
	if option == nil {
		return nil
	}
	return option.Label
}

func nullableString(value string) any {
	if value == "" {
		return nil
	}
	return value
}
