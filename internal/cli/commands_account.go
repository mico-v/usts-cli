package cli

import (
	"context"
	"flag"
	"fmt"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/jwgl"
)

type loginOptions struct{ CommonOptions }
type logoutOptions struct{ CommonOptions }
type profileOptions struct {
	CommonOptions
	Full    bool
	Section string
}

func bindProfile(fs *flag.FlagSet, options any) {
	opts := options.(*profileOptions)
	fs.BoolVar(&opts.Full, "full", false, "查询完整学生信息")
	fs.StringVar(&opts.Section, "section", "", "查询个人信息分区："+strings.Join(jwgl.ProfileSectionNames(), " / "))
}

func runLogin(ctx context.Context, app *App, _ any) error {
	reused := false
	autoLoginAttempted := false
	var autoLoginError error
	if app.Client.RestoreSession() {
		state := app.Client.EnsureValidSession(ctx)
		switch state {
		case domain.SessionLookupValid:
			fmt.Fprintln(app.Out, app.Success("已恢复上次登录的会话"))
			return nil
		case domain.SessionLookupUnknown:
			fmt.Fprintln(app.Err, app.Warning("无法确认会话是否有效（网络异常），将继续尝试使用该会话"))
			return nil
		default:
			recovery, attempted := app.Client.LastRecovery()
			if attempted && recovery.OK {
				reused = true
				fmt.Fprintln(app.Out, app.Info("已用配置中的账号密码重新登录"))
			} else {
				// Missing credentials did not submit a login request; an explicit
				// `usts login` may still prompt for them. Other failures already
				// consumed a login attempt and must not be repeated immediately.
				autoLoginAttempted = attempted && recovery.Reason != domain.RecoveryCredentials
				autoLoginError = recoveryError(recovery)
				if autoLoginError == nil {
					autoLoginError = domain.NewError(domain.CodeAuthentication, "会话已失效，请重新运行 usts login")
				}
				fmt.Fprintln(app.Err, app.Warning(autoLoginError.Error()))
				if !autoLoginAttempted {
					app.Client.ClearCookies()
				}
			}
		}
	}

	cookies := strings.TrimSpace(app.Config.Values["USTS_COOKIES"])
	if !reused && cookies != "" {
		app.Client.SetCookies(cookies)
		fmt.Fprintln(app.Out, app.Info("已载入会话 Cookie，正在校验..."))
		probe := app.Client.ProbeSession(ctx)
		if probe == domain.SessionUnknown {
			return domain.NewError(domain.CodeNetworkUnavailable, "无法校验提供的 Cookie（网络异常）。请稍后重试，或去掉 USTS_COOKIES 直接用账号密码登录")
		}
		if probe == domain.SessionValid {
			if profile, err := app.Client.QueryProfile(ctx); err == nil {
				app.Client.MarkAuthenticated(profile.StudentID)
			} else {
				app.Client.MarkAuthenticated("")
			}
			if err := app.Client.SaveSession(); err != nil {
				return err
			}
			fmt.Fprintln(app.Out, app.Success("使用已提供的 Cookie 登录成功"))
			return nil
		}
		fmt.Fprintln(app.Err, app.Warning("提供的 Cookie 已失效"))
		if autoLoginAttempted {
			return autoLoginError
		}
		if app.Credentials() == nil {
			return domain.NewError(domain.CodeAuthentication, "请重新从浏览器复制 Cookie，或在配置文件中配置 USTS_USERNAME/USTS_PASSWORD")
		}
		fmt.Fprintln(app.Out, app.Info("改用配置中的账号密码登录..."))
		app.Client.ClearCookies()
	}
	if reused {
		return nil
	}
	if autoLoginAttempted {
		return autoLoginError
	}

	credentials := app.Credentials()
	var username, password string
	if credentials != nil {
		username, password = credentials.Username, credentials.Password
	}
	if username == "" || password == "" {
		if !app.InTTY {
			return domain.ConfigError("交互式输入学号与密码需要交互式终端，但当前 stdin 不是终端。请在配置文件中配置 USTS_USERNAME/USTS_PASSWORD，或设置 USTS_COOKIES 后重试")
		}
		for strings.TrimSpace(username) == "" {
			value, err := PromptLine(app, "请输入学号: ")
			if err != nil {
				return err
			}
			username = strings.TrimSpace(value)
			if username == "" {
				fmt.Fprintln(app.Err, app.Warning("学号不能为空"))
			}
		}
		for password == "" {
			value, err := PromptPassword(app, "请输入密码: ")
			if err != nil {
				return err
			}
			password = value
			if password == "" {
				fmt.Fprintln(app.Err, app.Warning("密码不能为空"))
			}
		}
	}

	fmt.Fprintln(app.Out, app.Info("正在通过账号密码登录（纯脚本 RSA + 双 POST 重试）..."))
	result := app.Client.LoginViaScript(ctx, username, password)
	if result.Success {
		fmt.Fprintln(app.Out, app.Success(result.Message))
		return nil
	}
	code := result.ErrorCode
	if code == "" {
		code = domain.CodeUnknown
	}
	return domain.NewError(code, RedactSecret(result.Message))
}

func recoveryError(recovery domain.RecoveryResult) error {
	if recovery.ErrorCode != "" && recovery.ErrorCode != domain.CodeAuthentication {
		return &domain.AppError{
			Code: recovery.ErrorCode, Message: valueOr(recovery.Message, "自动重新登录失败"),
			Retryable: recovery.Retryable,
		}
	}
	switch recovery.Reason {
	case domain.RecoveryCredentials:
		return domain.NewError(domain.CodeAuthentication, "会话已失效，且未配置 USTS_USERNAME/USTS_PASSWORD 无法自动重新登录。请运行 usts login，或在配置文件中配置账号密码")
	case domain.RecoveryCooldown:
		return domain.NewError(domain.CodeAuthentication, "会话已失效，且上一次自动登录刚刚失败，正在冷却中。请稍后重试或运行 usts login")
	default:
		return domain.NewError(domain.CodeAuthentication, "会话已失效，自动重新登录也失败："+valueOr(recovery.Message, "未知原因")+". 请运行 usts login 检查账号密码")
	}
}

func runLogout(_ context.Context, app *App, _ any) error {
	removed, err := app.Client.Logout()
	if err != nil {
		return err
	}
	if removed {
		fmt.Fprintln(app.Out, app.Success("已退出登录，本地会话已删除"))
		fmt.Fprintln(app.Out, app.Info("服务端会话仍会在有效期内可用；如需立即失效，请在浏览器中退出登录。"))
	} else {
		fmt.Fprintln(app.Out, app.Info("本地没有保存的会话，无需退出"))
	}
	return nil
}

func runProfile(ctx context.Context, app *App, options any) error {
	opts := options.(*profileOptions)
	if opts.Full && opts.Section != "" {
		return domain.ConfigError("--full 与 --section 不能同时使用")
	}
	if err := app.EnsureSession(ctx); err != nil {
		return err
	}
	if opts.Full {
		profile, err := app.Client.QueryRichProfile(ctx)
		if err != nil {
			return err
		}
		if opts.JSON {
			return WriteEnvelope(app.Out, "profile", profile, nil)
		}
		renderRichProfile(app, profile)
		return nil
	}
	if opts.Section != "" {
		if opts.Section == jwgl.ProfileSectionSelectionStatus {
			termValue, err := app.Term(opts.XNM, opts.XQM)
			if err != nil {
				return err
			}
			status, err := app.Client.QuerySelectionStatus(ctx, termValue.AcademicYear, termValue.Semester)
			if err != nil {
				return err
			}
			if opts.JSON {
				return WriteEnvelope(app.Out, "profile", status, map[string]any{
					"xnm": termValue.AcademicYear, "xqm": termValue.Semester, "section": opts.Section,
				})
			}
			renderSelectionStatus(app, status)
			return nil
		}
		termValue, err := app.Term(opts.XNM, opts.XQM)
		if err != nil {
			return err
		}
		section, err := app.Client.QueryProfileSection(ctx, opts.Section, termValue.AcademicYear, termValue.Semester)
		if err != nil {
			return err
		}
		if opts.JSON {
			return WriteEnvelope(app.Out, "profile", section, map[string]any{
				"xnm": termValue.AcademicYear, "xqm": termValue.Semester,
			})
		}
		renderTableResult(app, section)
		return nil
	}
	profile, err := app.Client.QueryProfile(ctx)
	if err != nil {
		return err
	}
	if opts.JSON {
		return WriteEnvelope(app.Out, "profile", profile, nil)
	}
	renderProfile(app, profile)
	return nil
}
