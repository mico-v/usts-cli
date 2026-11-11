package cli

import (
	"context"
	"flag"

	"github.com/mico-v/usts-cli/internal/application"
)

type scoresOptions struct {
	CommonOptions
	KCXZDM string
}

type examsOptions struct{ CommonOptions }
type coursesOptions struct{ CommonOptions }
type scheduleOptions struct{ CommonOptions }
type notificationsOptions struct{ CommonOptions }
type selectedCoursesOptions struct{ CommonOptions }
type gpaOptions struct{ CommonOptions }
type academiaOptions struct {
	CommonOptions
	Category string
}
type warningOptions struct{ CommonOptions }
type paymentOptions struct{ CommonOptions }

func bindScores(fs *flag.FlagSet, options any) {
	fs.StringVar(&options.(*scoresOptions).KCXZDM, "kcxzdm", "", "按课程性质代码筛选")
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
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	view, err := application.ReadScores(ctx, app.Client, application.ScoresQuery{
		XNM: term.AcademicYear, XQM: term.Semester, KCXZDM: opts.KCXZDM,
	})
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "scores", view.Items, map[string]any{"xnm": term.AcademicYear, "xqm": term.Semester})
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
	if opts.JSON {
		return WriteEnvelope(app.Out, "selected-courses", items, map[string]any{"xnm": term.AcademicYear, "xqm": term.Semester})
	}
	renderSelectedCourses(app, items, term)
	return nil
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
