package cli

import (
	"context"
	"flag"
	"io"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
)

type CommonOptions struct {
	XNM  string
	XQM  string
	JSON bool
}

func (o *CommonOptions) Common() *CommonOptions { return o }

func (o *CommonOptions) Bind(fs *flag.FlagSet, term, json bool) {
	if term {
		fs.StringVar(&o.XNM, "y", "", "学年，如 2025（缺省为当前学年）")
		fs.StringVar(&o.XNM, "xnm", "", "学年，如 2025（缺省为当前学年）")
		fs.StringVar(&o.XQM, "t", "", "学期：3=第一学期, 12=第二学期, 16=第三学期")
		fs.StringVar(&o.XQM, "xqm", "", "学期：3=第一学期, 12=第二学期, 16=第三学期")
	}
	if json {
		fs.BoolVar(&o.JSON, "json", false, "以 JSON 输出")
	}
}

type commandOptions interface {
	Common() *CommonOptions
}

type CommandSpec struct {
	Name            string
	Summary         string
	Help            string
	OptionsHelp     []string
	HideJSON        bool
	MenuLabel       string
	Term            bool
	NewOptions      func() any
	Bind            func(*flag.FlagSet, any)
	Run             func(context.Context, *App, any) error
	InteractiveArgs func(context.Context, *App) ([]string, error)
	NormalizeArgs   func([]string) []string
}

func (spec CommandSpec) Execute(ctx context.Context, app *App, args []string) error {
	if spec.NormalizeArgs != nil {
		args = spec.NormalizeArgs(args)
	}
	fs := flag.NewFlagSet(spec.Name, flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	fs.Usage = func() {}
	var help bool
	fs.BoolVar(&help, "h", false, "显示帮助")
	fs.BoolVar(&help, "help", false, "显示帮助")
	options := spec.NewOptions()
	if holder, ok := options.(commandOptions); ok {
		holder.Common().Bind(fs, spec.Term, !spec.HideJSON)
	}
	if spec.Bind != nil {
		spec.Bind(fs, options)
	}
	if err := fs.Parse(args); err != nil {
		return domain.ConfigError("%s: %s", spec.Name, err)
	}
	if help {
		WriteCommandHelp(app.Out, spec)
		return nil
	}
	if fs.NArg() > 0 {
		return domain.ConfigError("命令 %s 不接受位置参数：%s", spec.Name, strings.Join(fs.Args(), " "))
	}
	return spec.Run(ctx, app, options)
}

var commandRegistry []CommandSpec

func Register(specs ...CommandSpec) {
	commandRegistry = append(commandRegistry, specs...)
}

func Commands() []CommandSpec {
	return append([]CommandSpec(nil), commandRegistry...)
}

func FindCommand(name string) (CommandSpec, bool) {
	for _, spec := range commandRegistry {
		if spec.Name == name {
			return spec, true
		}
	}
	return CommandSpec{}, false
}

func QueryCommands() []CommandSpec {
	var specs []CommandSpec
	for _, spec := range commandRegistry {
		if spec.MenuLabel != "" {
			specs = append(specs, spec)
		}
	}
	return specs
}

func normalizeOptionalStringFlag(args []string, name, valueFlag string) []string {
	result := make([]string, 0, len(args))
	for index := 0; index < len(args); index++ {
		arg := args[index]
		if strings.HasPrefix(arg, name+"=") {
			value := strings.TrimPrefix(arg, name+"=")
			if value == "" || value == "true" || value == "false" {
				result = append(result, arg)
			} else {
				result = append(result, valueFlag+"="+value)
			}
			continue
		}
		if arg != name {
			result = append(result, arg)
			continue
		}
		if index+1 < len(args) && !strings.HasPrefix(args[index+1], "-") {
			result = append(result, valueFlag+"="+args[index+1])
			index++
		} else {
			result = append(result, name+"=true")
		}
	}
	return result
}
