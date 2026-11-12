package cli

import (
	"context"
	"flag"
	"fmt"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/jwgl"
)

type courseInfoOptions struct {
	CommonOptions
	ID string
}

type bysjOptions struct {
	CommonOptions
}

type lookupOptions struct {
	CommonOptions
	Kind string
	List bool
}

func bindCourseInfo(fs *flag.FlagSet, options any) {
	fs.StringVar(&options.(*courseInfoOptions).ID, "id", "", "课程号")
}

func bindLookup(fs *flag.FlagSet, options any) {
	opts := options.(*lookupOptions)
	fs.StringVar(&opts.Kind, "kind", "", "字典类型")
	fs.BoolVar(&opts.List, "list", false, "列出可用字典类型")
}

func runCourseInfo(ctx context.Context, app *App, options any) error {
	opts := options.(*courseInfoOptions)
	if strings.TrimSpace(opts.ID) == "" {
		return domain.ConfigError("course 需要 --id <课程号>")
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	detail, err := app.Client.QueryCourseInfo(ctx, opts.ID)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "course", detail, map[string]any{"id": opts.ID})
	}
	renderHTMLDetail(app, detail, opts.ID)
	return nil
}

func runBysj(ctx context.Context, app *App, options any) error {
	opts := options.(*bysjOptions)
	termValue, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	result, err := app.Client.QueryGraduationDesign(ctx, termValue.AcademicYear, termValue.Semester)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "bysj", result, map[string]any{
			"xnm": termValue.AcademicYear, "xqm": termValue.Semester,
		})
	}
	renderTableResult(app, result)
	return nil
}

func runLookup(ctx context.Context, app *App, options any) error {
	opts := options.(*lookupOptions)
	if opts.List {
		kinds := jwgl.LookupKinds()
		if opts.JSON {
			return WriteEnvelope(app.Out, "lookup", kinds, nil)
		}
		for _, kind := range kinds {
			fmt.Fprintln(app.Out, kind)
		}
		return nil
	}
	if strings.TrimSpace(opts.Kind) == "" {
		return domain.ConfigError("lookup 需要 --kind <类型>，可用类型见 --list")
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	result, err := app.Client.QueryLookup(ctx, opts.Kind)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "lookup", result, map[string]any{"kind": opts.Kind})
	}
	renderTableResult(app, result)
	return nil
}
