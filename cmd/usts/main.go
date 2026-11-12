package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/mico-v/usts-cli/internal/cli"
	"github.com/mico-v/usts-cli/internal/config"
	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
	"github.com/mico-v/usts-cli/internal/infrastructure/jwgl"
	"github.com/mico-v/usts-cli/internal/infrastructure/sessionstore"
)

var version = "2.0.0-dev"

func main() {
	os.Exit(run())
}

func run() int {
	rawArgs := os.Args[1:]
	jsonRequested := hasJSON(rawArgs)
	runtimeConfig, err := config.Load()
	if err != nil {
		message := cli.SanitizeLine(cli.RedactSecret(domain.ErrorMessage(err, "配置加载失败")))
		if jsonRequested {
			_ = cli.WriteJSON(os.Stderr, cli.JSONErrorEnvelope{
				SchemaVersion: 1, Command: commandName(rawArgs),
				Error: cli.JSONError{Code: string(domain.CodeConfiguration), Message: message},
			})
		} else {
			fmt.Fprintln(os.Stderr, "✗ "+message)
		}
		return domain.ExitCode(err)
	}
	for _, rejected := range runtimeConfig.Rejected {
		fmt.Fprintln(os.Stderr, "⚠ "+fmt.Sprintf("配置文件中的 %s 已被忽略：放宽信任边界的开关只能来自真实环境变量", rejected))
	}
	for _, warning := range runtimeConfig.Warnings {
		fmt.Fprintln(os.Stderr, "⚠ "+cli.SanitizeTerminalText(warning))
	}
	cwd, _ := os.Getwd()
	legacyPath := config.LegacySessionFilePath(cwd)
	if _, err := os.Stat(legacyPath); err == nil {
		fmt.Fprintln(os.Stderr, "⚠ "+cli.SanitizeTerminalText(
			fmt.Sprintf("检测到旧版会话文件 %s，出于安全考虑已不再读取。请删除该文件后重新运行 usts login。", legacyPath),
		))
	}

	app := cli.NewApp(nil, runtimeConfig, os.Stdin, os.Stdout, os.Stderr)
	app.Version = version
	app.InTTY = cli.IsTerminal(os.Stdin)
	app.OutTTY = cli.IsTerminal(os.Stdout)
	app.ErrTTY = cli.IsTerminal(os.Stderr)
	app.Client, err = jwgl.NewClient(runtimeConfig.BaseURL, jwgl.ClientOptions{
		Launch:       runtimeConfig.Launch,
		SessionStore: sessionstore.New(config.SessionFilePath(runtimeConfig.Values)),
		Credentials:  runtimeConfig.Credentials,
		TrustWindow:  time.Duration(runtimeConfig.SessionTrustMillis()) * time.Millisecond,
		OnRetry: func(notice httpclient.RetryNotice) {
			if !jsonRequested {
				fmt.Fprintln(app.Err, app.Warning(retryMessage(notice)))
			}
		},
	})
	if err != nil {
		app.ReportError(err, false, "usts")
		return domain.ExitCode(err)
	}

	args := rawArgs
	if len(args) == 0 {
		if err := cli.RunInteractive(context.Background(), app); err != nil {
			app.ReportError(err, false, "interactive")
			return domain.ExitCode(err)
		}
		return 0
	}
	if args[0] == "--version" || args[0] == "-V" {
		fmt.Fprintln(app.Out, version)
		return 0
	}
	if args[0] == "--help" || args[0] == "-h" {
		cli.WriteRootHelp(app.Out, version)
		return 0
	}
	if args[0] == "help" {
		if len(args) > 2 {
			err := domain.ConfigError("help 只接受一个主题参数")
			app.ReportError(err, false, "help")
			return domain.ExitCode(err)
		}
		topic := ""
		if len(args) > 1 {
			topic = args[1]
		}
		if topic == "--help" || topic == "-h" {
			cli.WriteRootHelp(app.Out, version)
			return 0
		}
		if err := cli.RunHelp(app, topic); err != nil {
			app.ReportError(err, false, "help")
			return domain.ExitCode(err)
		}
		return 0
	}
	spec, ok := cli.FindCommand(args[0])
	if !ok {
		err := domain.ConfigError("未知命令：%s。运行 usts --help 查看完整命令列表", args[0])
		app.ReportError(err, hasJSON(args[1:]), args[0])
		return domain.ExitCode(err)
	}
	jsonMode := !spec.HideJSON && hasJSON(args[1:])
	commandCtx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	if err := spec.Execute(commandCtx, app, args[1:]); err != nil {
		app.ReportError(err, jsonMode, spec.Name)
		return domain.ExitCode(err)
	}
	return 0
}

func retryMessage(notice httpclient.RetryNotice) string {
	if notice.Kind == "timeout" {
		return fmt.Sprintf("请求超时，正在重试（%d/%d）…", notice.Attempt, notice.MaxAttempts)
	}
	seconds := int(notice.Delay.Round(time.Second) / time.Second)
	if seconds < 1 {
		seconds = 1
	}
	return fmt.Sprintf("连接被重置，%d 秒后重试（%d/%d）…", seconds, notice.Attempt, notice.MaxAttempts)
}

func hasJSON(args []string) bool {
	mode := false
	for _, arg := range args {
		switch {
		case arg == "--json" || arg == "-json":
			mode = true
		case strings.HasPrefix(arg, "--json="):
			mode = !isFalse(strings.TrimPrefix(arg, "--json="))
		case strings.HasPrefix(arg, "-json="):
			mode = !isFalse(strings.TrimPrefix(arg, "-json="))
		}
	}
	return mode
}

func isFalse(value string) bool {
	return strings.EqualFold(value, "false") || value == "0"
}

func commandName(args []string) string {
	for _, arg := range args {
		if !strings.HasPrefix(arg, "-") {
			return arg
		}
	}
	return "usts"
}
