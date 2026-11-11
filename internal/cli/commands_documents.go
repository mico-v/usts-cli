package cli

import (
	"context"
	"flag"
	"fmt"

	"github.com/mico-v/usts-cli/internal/application"
	"github.com/mico-v/usts-cli/internal/infrastructure/documentstore"
)

type schedulePDFOptions struct {
	CommonOptions
	Output string
	Force  bool
}

type academiaPDFOptions struct {
	CommonOptions
	Output string
	Force  bool
}

func bindSchedulePDF(fs *flag.FlagSet, options any) {
	opts := options.(*schedulePDFOptions)
	fs.StringVar(&opts.Output, "o", "", "输出文件路径")
	fs.StringVar(&opts.Output, "output", "", "输出文件路径")
	fs.BoolVar(&opts.Force, "force", false, "覆盖已有文件")
}

func bindAcademiaPDF(fs *flag.FlagSet, options any) {
	opts := options.(*academiaPDFOptions)
	fs.StringVar(&opts.Output, "o", "", "输出文件路径")
	fs.StringVar(&opts.Output, "output", "", "输出文件路径")
	fs.BoolVar(&opts.Force, "force", false, "覆盖已有文件")
}

func runSchedulePDF(ctx context.Context, app *App, options any) error {
	opts := options.(*schedulePDFOptions)
	term, err := app.Term(opts.XNM, opts.XQM)
	if err != nil {
		return err
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	saved, err := application.SaveSchedulePDF(ctx, app.Client, documentstore.FileStore{}, term.AcademicYear, term.Semester, opts.Output, opts.Force)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "schedule-pdf", map[string]any{"path": saved}, nil)
	}
	fmt.Fprintln(app.Out, app.Success("课表 PDF 已保存："+saved))
	return nil
}

func runAcademiaPDF(ctx context.Context, app *App, options any) error {
	opts := options.(*academiaPDFOptions)
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	saved, err := application.SaveAcademiaPDF(ctx, app.Client, documentstore.FileStore{}, opts.Output, opts.Force)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "academia-pdf", map[string]any{"path": saved}, nil)
	}
	fmt.Fprintln(app.Out, app.Success("成绩总表 PDF 已保存："+saved))
	return nil
}
