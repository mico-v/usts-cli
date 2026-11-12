package cli

import (
	"context"
	"flag"
	"fmt"

	"github.com/mico-v/usts-cli/internal/application"
	"github.com/mico-v/usts-cli/internal/domain"
)

type scoresOptions struct {
	CommonOptions
	KCXZDM     string
	Detail     bool
	Templates  bool
	JXBID      string
	CourseCode string
}

type examsOptions struct {
	CommonOptions
	Unplanned bool
}
type coursesOptions struct {
	CommonOptions
	Details bool
}
type scheduleOptions struct{ CommonOptions }
type notificationsOptions struct{ CommonOptions }
type selectedCoursesOptions struct {
	CommonOptions
	Blocks           bool
	Chosen           bool
	Credits          bool
	EvaluationStatus bool
	CategoryCode     string
	BlockID          string
}
type gpaOptions struct{ CommonOptions }
type academiaOptions struct {
	CommonOptions
	Category string
}
type warningOptions struct{ CommonOptions }
type paymentOptions struct{ CommonOptions }

func bindScores(fs *flag.FlagSet, options any) {
	opts := options.(*scoresOptions)
	fs.StringVar(&opts.KCXZDM, "kcxzdm", "", "按课程性质代码筛选")
	fs.BoolVar(&opts.Detail, "detail", false, "查询单门课程的成绩分项")
	fs.BoolVar(&opts.Templates, "templates", false, "查询成绩分项模板")
	fs.StringVar(&opts.JXBID, "jxb-id", "", "成绩分项使用的教学班 ID")
	fs.StringVar(&opts.CourseCode, "course-code", "", "成绩分项使用的课程号")
}

func bindExams(fs *flag.FlagSet, options any) {
	fs.BoolVar(&options.(*examsOptions).Unplanned, "unplanned", false, "查询未排考课程")
}

func bindCourses(fs *flag.FlagSet, options any) {
	fs.BoolVar(&options.(*coursesOptions).Details, "details", false, "显示学生名单明细")
}

func bindSelectedCourses(fs *flag.FlagSet, options any) {
	opts := options.(*selectedCoursesOptions)
	fs.BoolVar(&opts.Blocks, "blocks", false, "查询选课板块课程")
	fs.BoolVar(&opts.Chosen, "chosen", false, "查询已选/意向/间听视图")
	fs.BoolVar(&opts.Credits, "credits", false, "查询历年已获学分")
	fs.BoolVar(&opts.EvaluationStatus, "evaluation-status", false, "查询评教状态")
	fs.StringVar(&opts.CategoryCode, "category-code", "", "选课板块类别代码 kklxdm")
	fs.StringVar(&opts.BlockID, "block-id", "", "选课板块 ID xkkz_id")
}

func selectScoreForDetail(items []domain.ScoreItem, opts *scoresOptions) (domain.ScoreItem, error) {
	matches := make([]domain.ScoreItem, 0)
	for _, item := range items {
		if opts.JXBID != "" && (item.TeachingClassID == nil || *item.TeachingClassID != opts.JXBID) {
			continue
		}
		if opts.CourseCode != "" && item.CourseCode != opts.CourseCode {
			continue
		}
		matches = append(matches, item)
	}
	if len(matches) == 1 {
		return matches[0], nil
	}
	if len(matches) == 0 {
		return domain.ScoreItem{}, domain.ConfigError("没有匹配的成绩记录；请用 --course-code 或 --jxb-id 指定课程")
	}
	if opts.JXBID == "" {
		return domain.ScoreItem{}, domain.ConfigError("匹配到 %d 条成绩记录；请用 --jxb-id 指定教学班", len(matches))
	}
	return domain.ScoreItem{}, domain.ConfigError("成绩分项筛选不唯一")
}

func bindAcademia(fs *flag.FlagSet, options any) {
	fs.StringVar(&options.(*academiaOptions).Category, "category", "", "拉取指定分类的课程明细")
}

func runScores(ctx context.Context, app *App, options any) error {
	opts := options.(*scoresOptions)
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if opts.Templates && opts.Detail {
		return domain.ConfigError("--templates 与 --detail 不能同时使用")
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	if opts.Templates {
		templates, err := app.Client.QueryScoreTemplates(ctx, term.AcademicYear, term.Semester)
		if err != nil {
			return err
		}
		if opts.JSON {
			return WriteEnvelope(app.Out, "scores", templates, map[string]any{
				"xnm": term.AcademicYear, "xqm": term.Semester,
			})
		}
		fmt.Fprintln(app.Out, app.Header("成绩分项模板"))
		for _, template := range templates {
			fmt.Fprintln(app.Out, "  "+SanitizeLine(template))
		}
		return nil
	}
	view, err := application.ReadScores(ctx, app.Client, application.ScoresQuery{
		XNM: term.AcademicYear, XQM: term.Semester, KCXZDM: opts.KCXZDM,
	})
	if err != nil {
		return err
	}
	if opts.Detail {
		selected, err := selectScoreForDetail(view.Items, opts)
		if err != nil {
			return err
		}
		if selected.TeachingClassID == nil || *selected.TeachingClassID == "" {
			return domain.ConfigError("该成绩记录缺少教学班 ID，无法查询成绩分项")
		}
		detailXNM := term.AcademicYear
		detailXQM := term.Semester
		if selected.AcademicYearCode != nil && *selected.AcademicYearCode != "" {
			detailXNM = *selected.AcademicYearCode
		}
		if selected.SemesterCode != nil && *selected.SemesterCode != "" {
			detailXQM = *selected.SemesterCode
		}
		detail, err := app.Client.QueryScoreDetail(ctx, detailXNM, detailXQM, *selected.TeachingClassID, selected.CourseName)
		if err != nil {
			return err
		}
		if opts.JSON {
			return WriteEnvelope(app.Out, "scores", detail, map[string]any{
				"xnm": detailXNM, "xqm": detailXQM, "courseCode": selected.CourseCode,
				"teachingClassId": *selected.TeachingClassID,
			})
		}
		renderHTMLDetail(app, detail, selected.CourseName)
		return nil
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "scores", view.Items, map[string]any{
			"xnm": term.AcademicYear, "xqm": term.Semester, "totalCredit": view.TotalCredit,
		})
	}
	renderScores(app, view, term)
	return nil
}

func runExams(ctx context.Context, app *App, options any) error {
	opts := options.(*examsOptions)
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	if opts.Unplanned {
		items, err := app.Client.QueryUnplannedExams(ctx, term.AcademicYear, term.Semester)
		if err != nil {
			return err
		}
		if opts.JSON {
			return WriteEnvelope(app.Out, "exams", items, map[string]any{
				"xnm": term.AcademicYear, "xqm": term.Semester,
			})
		}
		renderUnplannedExams(app, items, term)
		return nil
	}
	items, err := app.Client.QueryExams(ctx, term.AcademicYear, term.Semester)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "exams", items, map[string]any{"xnm": term.AcademicYear, "xqm": term.Semester})
	}
	renderExams(app, items, term)
	return nil
}

func runCourses(ctx context.Context, app *App, options any) error {
	opts := options.(*coursesOptions)
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	items, err := app.Client.QueryCourseList(ctx, term.AcademicYear, term.Semester)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "courses", items, map[string]any{"xnm": term.AcademicYear, "xqm": term.Semester})
	}
	if opts.Details {
		renderCourseDetails(app, items, term)
		return nil
	}
	renderCourses(app, items, term)
	return nil
}

func runSchedule(ctx context.Context, app *App, options any) error {
	opts := options.(*scheduleOptions)
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	view, err := application.ReadSchedule(ctx, app.Client, term)
	if err != nil {
		return err
	}
	if opts.JSON {
		items := make([]any, 0, view.Total)
		for _, day := range view.Days {
			for _, item := range day.Items {
				items = append(items, item)
			}
		}
		for _, item := range view.Untimed {
			items = append(items, item)
		}
		return WriteEnvelope(app.Out, "schedule", items, map[string]any{"xnm": term.AcademicYear, "xqm": term.Semester})
	}
	renderSchedule(app, view, term)
	return nil
}

func runNotifications(ctx context.Context, app *App, options any) error {
	opts := options.(*notificationsOptions)
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	items, err := app.Client.QueryNotifications(ctx)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "notifications", items, nil)
	}
	renderNotifications(app, items)
	return nil
}

func runGPA(ctx context.Context, app *App, options any) error {
	opts := options.(*gpaOptions)
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	view, err := application.ReadGpa(ctx, app.Client)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "gpa", view.Summary, nil)
	}
	renderGPA(app, view)
	return nil
}

func runAcademia(ctx context.Context, app *App, options any) error {
	opts := options.(*academiaOptions)
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	view, err := application.ReadAcademia(ctx, app.Client, opts.Category)
	if err != nil {
		return err
	}
	if opts.JSON {
		if view.Category != nil {
			return WriteEnvelope(app.Out, "academia", map[string]any{
				"category": view.Category.Category, "courses": view.Category.Courses,
			}, nil)
		}
		return WriteEnvelope(app.Out, "academia", view.Overview.Summary, nil)
	}
	renderAcademia(app, view)
	return nil
}

func runSelectedCourses(ctx context.Context, app *App, options any) error {
	opts := options.(*selectedCoursesOptions)
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	items, err := app.Client.QuerySelectedCourses(ctx, term.AcademicYear, term.Semester)
	if err != nil {
		return err
	}
	viewFlags := 0
	for _, enabled := range []bool{opts.Blocks, opts.Chosen, opts.Credits, opts.EvaluationStatus} {
		if enabled {
			viewFlags++
		}
	}
	if viewFlags > 1 {
		return domain.ConfigError("--blocks / --chosen / --credits / --evaluation-status 只能选择一个")
	}
	if viewFlags == 1 {
		categoryCode, blockID, err := resolveSelectedContext(items, opts.CategoryCode, opts.BlockID)
		if err != nil {
			return err
		}
		switch {
		case opts.Blocks || opts.Chosen:
			kind := "blocks"
			if opts.Chosen {
				kind = "chosen"
			}
			detail, err := app.Client.QuerySelectedCourseView(ctx, kind, term.AcademicYear, term.Semester, categoryCode, blockID)
			if err != nil {
				return err
			}
			if opts.JSON {
				return WriteEnvelope(app.Out, "selected-courses", detail, map[string]any{
					"xnm": term.AcademicYear, "xqm": term.Semester, "view": kind,
					"categoryCode": categoryCode, "blockId": blockID,
				})
			}
			renderHTMLDetail(app, detail, "已选课程视图")
			return nil
		case opts.Credits || opts.EvaluationStatus:
			kind := "credits"
			if opts.EvaluationStatus {
				kind = "evaluation-status"
			}
			value, err := app.Client.QuerySelectedCourseScalar(ctx, kind, categoryCode, blockID)
			if err != nil {
				return err
			}
			if opts.JSON {
				return WriteEnvelope(app.Out, "selected-courses", value, map[string]any{
					"view": kind, "categoryCode": categoryCode, "blockId": blockID,
				})
			}
			fmt.Fprintln(app.Out, app.Header("已选课程状态"))
			fmt.Fprintf(app.Out, "  %s：%s\n", kind, value.Value)
			return nil
		}
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "selected-courses", items, map[string]any{"xnm": term.AcademicYear, "xqm": term.Semester})
	}
	renderSelectedCourses(app, items, term)
	return nil
}

func resolveSelectedContext(
	items []domain.SelectedCourseItem,
	categoryCode, blockID string,
) (string, string, error) {
	if categoryCode != "" && blockID != "" {
		return categoryCode, blockID, nil
	}
	type contextKey struct {
		category string
		block    string
	}
	seen := map[contextKey]bool{}
	for _, item := range items {
		category := stringValue(item.CategoryCode, "")
		block := stringValue(item.SelectionBlockID, "")
		if category == "" || block == "" {
			continue
		}
		if categoryCode != "" && category != categoryCode {
			continue
		}
		if blockID != "" && block != blockID {
			continue
		}
		seen[contextKey{category: category, block: block}] = true
	}
	if len(seen) == 1 {
		for value := range seen {
			return value.category, value.block, nil
		}
	}
	if len(seen) == 0 {
		return "", "", domain.ConfigError("没有匹配的选课板块上下文；请用 --category-code 和 --block-id 指定")
	}
	return "", "", domain.ConfigError("匹配到多个选课板块上下文；请用 --category-code 和 --block-id 指定")
}

func runWarning(ctx context.Context, app *App, options any) error {
	opts := options.(*warningOptions)
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	status, err := app.Client.QueryWarning(ctx)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "warning", status, nil)
	}
	renderWarning(app, status)
	return nil
}

func runPayment(ctx context.Context, app *App, options any) error {
	opts := options.(*paymentOptions)
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	items, err := app.Client.QueryPayments(ctx, term.AcademicYear, term.Semester)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "payment", items, map[string]any{"xnm": term.AcademicYear, "xqm": term.Semester})
	}
	renderPayments(app, items, term)
	return nil
}
