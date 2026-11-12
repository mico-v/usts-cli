package cli

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"os"
	"strings"
	"time"

	"github.com/mico-v/usts-cli/internal/config"
	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/jwgl"
	"golang.org/x/term"
)

type App struct {
	Client  *jwgl.Client
	Config  *config.Runtime
	Version string
	In      *bufio.Reader
	Out     io.Writer
	Err     io.Writer
	InTTY   bool
	OutTTY  bool
	ErrTTY  bool
	Now     func() time.Time
	NoColor bool
}

func NewApp(client *jwgl.Client, runtimeConfig *config.Runtime, in io.Reader, out, err io.Writer) *App {
	_, noColor := runtimeConfig.Values["NO_COLOR"]
	return &App{
		Client: client, Config: runtimeConfig, In: bufio.NewReader(in), Out: out, Err: err,
		Now: time.Now, NoColor: noColor,
	}
}

func (a *App) EnsureSession(ctx context.Context) error {
	state := a.Client.EnsureValidSession(ctx)
	if state == domain.SessionLookupValid || state == domain.SessionLookupUnknown {
		return nil
	}
	message := "会话已失效，请重新运行 usts login"
	if state == domain.SessionMissing {
		message = "未找到会话，请先运行 usts login 登录"
	} else if recovery, ok := a.Client.LastRecovery(); ok {
		if recovery.ErrorCode != "" && recovery.ErrorCode != domain.CodeAuthentication {
			return &domain.AppError{
				Code: recovery.ErrorCode, Message: valueOr(recovery.Message, "会话恢复失败"),
				Retryable: recovery.Retryable,
			}
		}
		switch recovery.Reason {
		case domain.RecoveryCredentials:
			message = "会话已失效，且未配置 USTS_USERNAME/USTS_PASSWORD 无法自动重新登录。请运行 usts login，或在配置文件中配置账号密码"
		case domain.RecoveryFailed:
			message = fmt.Sprintf("会话已失效，自动重新登录也失败：%s。请运行 usts login 检查账号密码", valueOr(recovery.Message, "未知原因"))
		case domain.RecoveryCooldown:
			message = "会话已失效，且上一次自动登录刚刚失败，正在冷却中。请稍后重试或运行 usts login"
		}
	}
	return domain.NewError(domain.CodeAuthentication, message)
}

func (a *App) ReportError(err error, jsonMode bool, command string) {
	appError, ok := domain.AsAppError(err)
	if !ok {
		appError = &domain.AppError{
			Code: domain.CodeUnknown, Message: domain.ErrorMessage(err, "操作失败"), Cause: err,
		}
	}
	message := SanitizeLine(RedactSecret(domain.ErrorMessage(appError, "操作失败")))
	if jsonMode {
		_ = WriteJSON(a.Err, JSONErrorEnvelope{
			SchemaVersion: 1, Command: command,
			Error: JSONError{Code: string(appError.Code), Message: message, Retryable: appError.Retryable},
		})
		return
	}
	fmt.Fprintln(a.Err, a.ErrorText(message))
}

func (a *App) Header(text string) string {
	return a.color("\n→ "+SanitizeLine(text), "bold", true)
}

func (a *App) Success(text string) string {
	return a.color("✓ "+SanitizeLine(text), "green", true)
}

func (a *App) Info(text string) string {
	return a.color("ℹ "+SanitizeLine(text), "cyan", true)
}

func (a *App) Warning(text string) string {
	return a.color("⚠ "+SanitizeLine(text), "yellow", false)
}

func (a *App) ErrorText(text string) string {
	return a.color("✗ "+SanitizeLine(text), "red", false)
}

func (a *App) color(text, color string, stdout bool) string {
	enabled := a.OutTTY
	if !stdout {
		enabled = a.ErrTTY
	}
	if !enabled || a.NoColor {
		return text
	}
	codes := map[string]string{
		"reset": "\x1b[0m", "bold": "\x1b[1m", "red": "\x1b[31m",
		"green": "\x1b[32m", "yellow": "\x1b[33m", "cyan": "\x1b[36m",
	}
	return codes[color] + text + codes["reset"]
}

func (a *App) Term(xnm, xqm string) (domain.Term, error) {
	return domain.ResolveTerm(xnm, xqm, a.Now())
}

func (a *App) Credentials() *config.Credentials {
	return a.Config.Credentials()
}

func IsTerminal(file *os.File) bool {
	return term.IsTerminal(int(file.Fd()))
}

func valueOr(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return value
}
