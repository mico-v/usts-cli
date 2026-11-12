package jwgl

import (
	"context"
	"encoding/json"
	"net/url"
	"sync"
	"time"

	"github.com/mico-v/usts-cli/internal/application"
	"github.com/mico-v/usts-cli/internal/config"
	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
	"github.com/mico-v/usts-cli/internal/infrastructure/sessionstore"
)

type ClientOptions struct {
	Launch           map[string]string
	SessionStore     sessionstore.Store
	Credentials      func() *config.Credentials
	TrustWindow      time.Duration
	RecoveryCooldown time.Duration
	OnRetry          func(httpclient.RetryNotice)
}

type Client struct {
	transport   *httpclient.Transport
	store       sessionstore.Store
	sessions    *application.SessionManager
	credentials func() *config.Credentials

	mu          sync.Mutex
	sessionIOMu sync.Mutex
	username    string
	loginAt     time.Time
	logoutEpoch uint64
	loggedOut   bool
}

func NewClient(baseURL string, options ClientOptions) (*Client, error) {
	client := &Client{
		store:       options.SessionStore,
		credentials: options.Credentials,
	}
	transport, err := httpclient.NewTransport(baseURL, httpclient.TransportOptions{
		Launch:           options.Launch,
		OnRetry:          options.OnRetry,
		OnCookiesChanged: client.persistRotatedCookies,
	})
	if err != nil {
		return nil, err
	}
	client.transport = transport
	if client.store == nil {
		client.store = sessionstore.New(config.SessionFilePath(options.Launch))
	}
	client.sessions = application.NewSessionManager(client, application.SessionManagerOptions{
		TrustWindow: options.TrustWindow, RecoveryCooldown: options.RecoveryCooldown,
	})
	return client, nil
}

func (c *Client) RestoreSession() bool {
	c.sessionIOMu.Lock()
	defer c.sessionIOMu.Unlock()
	c.mu.Lock()
	loggedOut := c.loggedOut
	c.mu.Unlock()
	if loggedOut {
		return false
	}
	if c.transport.CookieCount() > 0 {
		return true
	}
	data, err := c.store.Load()
	if err != nil || data == nil {
		return false
	}
	base, err := url.Parse(c.transport.BaseURL())
	if err != nil || data.Origin != base.Scheme+"://"+base.Host {
		return false
	}
	rawCookies, err := json.Marshal(data.Cookies)
	if err != nil {
		return false
	}
	c.transport.RestoreCookies(rawCookies)
	c.mu.Lock()
	c.username = data.Username
	if data.LoginTime != "" {
		c.loginAt, _ = time.Parse(time.RFC3339, data.LoginTime)
	}
	c.mu.Unlock()
	return c.transport.CookieCount() > 0
}

func (c *Client) LastLoginAt() (time.Time, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.loginAt, !c.loginAt.IsZero()
}

func (c *Client) LoginFromEnvironment(ctx context.Context) domain.LoginResponse {
	if c.credentials == nil {
		return domain.LoginResponse{
			Success: false, ErrorCode: domain.CodeAuthentication,
			Message: "未配置 USTS_USERNAME/USTS_PASSWORD，无法自动重新登录",
		}
	}
	credentials := c.credentials()
	if credentials == nil {
		return domain.LoginResponse{
			Success: false, ErrorCode: domain.CodeAuthentication,
			Message: "未配置 USTS_USERNAME/USTS_PASSWORD，无法自动重新登录",
		}
	}
	return c.LoginViaScript(ctx, credentials.Username, credentials.Password)
}

func (c *Client) EnsureValidSession(ctx context.Context) domain.SessionLookup {
	return c.sessions.Ensure(ctx, false)
}

func (c *Client) LastRecovery() (domain.RecoveryResult, bool) {
	return c.sessions.LastRecovery()
}

func (c *Client) LocalSession() domain.LocalSessionInfo {
	loggedIn := c.RestoreSession()
	c.mu.Lock()
	defer c.mu.Unlock()
	return domain.LocalSessionInfo{LoggedIn: loggedIn, Username: c.username, LoginAt: c.loginAt}
}

func (c *Client) SetCookies(raw string) {
	c.mu.Lock()
	c.loggedOut = false
	c.mu.Unlock()
	c.transport.ImportCookies(raw)
}

func (c *Client) ClearCookies() {
	c.transport.ClearCookies()
}

func (c *Client) MarkAuthenticated(username string) {
	c.mu.Lock()
	if username != "" {
		c.username = username
	}
	c.loginAt = time.Now()
	c.loggedOut = false
	c.mu.Unlock()
	c.sessions.MarkVerified()
}

func (c *Client) SaveSession() error {
	c.mu.Lock()
	epoch := c.logoutEpoch
	c.mu.Unlock()
	saved, err := c.saveSessionAtEpoch(epoch)
	if err != nil {
		return err
	}
	if !saved {
		return domain.NewError(domain.CodeAuthentication, "会话已失效，本次保存已作废")
	}
	return nil
}

func (c *Client) saveSessionAtEpoch(epoch uint64) (bool, error) {
	c.sessionIOMu.Lock()
	defer c.sessionIOMu.Unlock()
	c.mu.Lock()
	if epoch != c.logoutEpoch {
		c.mu.Unlock()
		return false, nil
	}
	username := c.username
	loginAt := c.loginAt
	c.mu.Unlock()
	base, err := url.Parse(c.transport.BaseURL())
	if err != nil {
		return false, domain.WrapError(domain.CodeConfiguration, "当前教务系统地址无效", err)
	}
	session := sessionstore.PersistedSession{
		SchemaVersion: 1,
		Origin:        base.Scheme + "://" + base.Host,
		Cookies:       c.transport.SerializeCookies(),
		Username:      username,
	}
	if !loginAt.IsZero() {
		session.LoginTime = loginAt.Format(time.RFC3339)
	}
	if err := c.store.Save(session); err != nil {
		return false, err
	}
	return true, nil
}

func (c *Client) LoginViaScript(ctx context.Context, username, password string) domain.LoginResponse {
	c.mu.Lock()
	epoch := c.logoutEpoch
	c.loggedOut = false
	c.mu.Unlock()
	result := c.loginViaScript(ctx, username, password)
	if !result.Success {
		return result
	}
	c.mu.Lock()
	if epoch != c.logoutEpoch {
		c.mu.Unlock()
		c.transport.ClearCookies()
		return domain.LoginResponse{
			Success: false, ErrorCode: domain.CodeAuthentication,
			Message: "登录期间已退出，本次登录结果已作废，请重新运行 usts login",
		}
	}
	c.username = username
	c.loginAt = time.Now()
	c.mu.Unlock()
	c.sessions.MarkVerified()
	saved, err := c.saveSessionAtEpoch(epoch)
	if err != nil {
		return domain.LoginResponse{
			Success: false, ErrorCode: domain.CodeFileSystem,
			Message: "登录成功，但无法保存会话：" + domain.ErrorMessage(err, "未知错误"),
		}
	}
	if !saved {
		c.transport.ClearCookies()
		return domain.LoginResponse{
			Success: false, ErrorCode: domain.CodeAuthentication,
			Message: "登录期间已退出，本次登录结果已作废，请重新运行 usts login",
		}
	}
	return result
}

func (c *Client) Logout() (bool, error) {
	c.sessionIOMu.Lock()
	c.mu.Lock()
	c.logoutEpoch++
	c.username = ""
	c.loginAt = time.Time{}
	c.loggedOut = true
	c.mu.Unlock()
	removed, err := c.store.Remove()
	c.sessionIOMu.Unlock()
	c.transport.ClearCookies()
	c.sessions.Reset()
	return removed, err
}

func (c *Client) persistRotatedCookies() {
	c.mu.Lock()
	loggedOut := c.loggedOut
	hasSession := c.username != ""
	epoch := c.logoutEpoch
	c.mu.Unlock()
	if loggedOut {
		c.transport.ClearCookies()
		return
	}
	if !hasSession {
		return
	}
	_, _ = c.saveSessionAtEpoch(epoch)
}

func (c *Client) withReauth(ctx context.Context, effect httpclient.Effect, operation func() error) error {
	epoch := c.currentLogoutEpoch()
	for replay := 1; replay >= 0; replay-- {
		err := operation()
		if err == nil {
			return nil
		}
		if c.currentLogoutEpoch() != epoch {
			return domain.NewError(domain.CodeAuthentication, "会话已退出，本次操作已取消")
		}
		if effect == httpclient.EffectMutation {
			return err
		}
		expired := domain.IsSessionExpired(err)
		if !expired && domain.IsAmbiguousRejection(err) {
			expired = c.sessions.ConfirmExpired(ctx)
		}
		if !expired || replay == 0 {
			return err
		}
		c.sessions.MarkExpired()
		recovery := c.sessions.Recover(ctx)
		if c.currentLogoutEpoch() != epoch {
			return domain.NewError(domain.CodeAuthentication, "会话已退出，本次操作已取消")
		}
		if !recovery.OK {
			return err
		}
	}
	return nil
}

func (c *Client) currentLogoutEpoch() uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.logoutEpoch
}
