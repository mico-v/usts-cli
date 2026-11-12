package jwgl

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

const (
	probePath     = "/cjcx/cjcx_cxXsgrcj.html"
	probeGNMKDM   = "N305005"
	loginPath     = "/xtgl/login_slogin.html"
	publicKeyPath = "/xtgl/login_getPublicKey.html"
)

var (
	csrfPattern       = regexp.MustCompile(`(?i)id=["']csrftoken["'][^>]*value=["']([^"']*)["']`)
	captchaPattern    = regexp.MustCompile(`(?i)id=["']yzm["']|name=["']yzm["']`)
	credentialFailure = regexp.MustCompile(`用户名或密码|验证码`)
)

func (c *Client) ProbeSession(ctx context.Context) domain.SessionState {
	if c.transport.CookieCount() == 0 {
		return domain.SessionExpired
	}
	term := domain.CurrentTerm(time.Now())
	form := url.Values{
		"xnm": {term.AcademicYear}, "xqm": {term.Semester},
		"_search": {"false"}, "nd": {fmt.Sprint(time.Now().UnixMilli())},
		"page": {"1"}, "rows": {"1"}, "sidx": {""}, "sord": {"asc"},
		"queryModel.showCount": {"1"}, "queryModel.currentPage": {"1"},
	}
	response, err := c.transport.PostForm(
		ctx,
		fmt.Sprintf("%s?doType=query&gnmkdm=%s", probePath, probeGNMKDM),
		form,
		c.transport.BaseURL()+probePath,
		httpclient.EffectRead,
	)
	if err != nil {
		return domain.SessionUnknown
	}
	switch ClassifyResponse(response) {
	case VerdictSessionExpired:
		return domain.SessionExpired
	case VerdictOK:
	default:
		return domain.SessionUnknown
	}
	data, err := ParseJSON(response.Body)
	if err != nil {
		return domain.SessionUnknown
	}
	object, ok := data.(map[string]any)
	if !ok {
		return domain.SessionUnknown
	}
	_, itemsOK := object["items"].([]any)
	_, totalOK := object["totalCount"]
	if itemsOK && totalOK {
		return domain.SessionValid
	}
	return domain.SessionUnknown
}

func (c *Client) loginViaScript(ctx context.Context, username, password string) domain.LoginResponse {
	page, err := c.transport.Get(ctx, loginPath, httpclient.EffectAuth)
	if err != nil {
		return loginFailure(err, "登录异常")
	}
	if page.StatusCode >= 300 && page.StatusCode < 400 {
		return domain.LoginResponse{
			Success: false, ErrorCode: domain.CodeRateLimited,
			Message: "登录页被重定向，可能被 WAF 拦截，请稍后重试或改用 USTS_COOKIES",
		}
	}
	pageText := string(page.Body)
	csrf := ""
	if match := csrfPattern.FindStringSubmatch(pageText); len(match) == 2 {
		csrf = match[1]
	}
	if csrf == "" {
		return domain.LoginResponse{Success: false, ErrorCode: domain.CodeProtocolChanged, Message: "登录页缺少 csrftoken，接口可能已变更"}
	}
	if captchaPattern.MatchString(pageText) {
		return domain.LoginResponse{
			Success: false, ErrorCode: domain.CodeCaptchaRequired,
			Message: "账号当前需要图形验证码，无法自动登录。请把浏览器 Cookie 粘贴到 USTS_COOKIES 后运行 usts login",
		}
	}

	keyResponse, err := c.transport.Do(ctx, httpclient.Request{
		Method: http.MethodGet, Target: publicKeyPath, Effect: httpclient.EffectAuth,
		Header: http.Header{"Referer": []string{c.transport.BaseURL() + loginPath}},
	})
	if err != nil {
		return loginFailure(err, "获取 RSA 公钥失败")
	}
	var key struct {
		Modulus  string `json:"modulus"`
		Exponent string `json:"exponent"`
	}
	if err := json.Unmarshal(keyResponse.Body, &key); err != nil || key.Modulus == "" || key.Exponent == "" {
		return domain.LoginResponse{Success: false, ErrorCode: domain.CodeProtocolChanged, Message: "获取 RSA 公钥失败，请稍后重试"}
	}
	encrypted, err := encryptPassword(password, key.Modulus, key.Exponent)
	if err != nil {
		return domain.LoginResponse{Success: false, ErrorCode: domain.CodeProtocolChanged, Message: "无法加密登录密码"}
	}

	postLogin := func() (*httpclient.Response, error) {
		form := url.Values{
			"csrftoken": {csrf}, "language": {"zh_CN"}, "ydType": {""}, "yhm": {username},
		}
		form.Add("mm", encrypted)
		form.Add("mm", encrypted)
		headers := c.transport.FormHeaders(c.transport.BaseURL() + loginPath)
		headers.Set("Origin", c.transport.BaseURL())
		return c.transport.Do(ctx, httpclient.Request{
			Method: http.MethodPost,
			Target: fmt.Sprintf("%s?time=%d", loginPath, time.Now().UnixMilli()),
			Body:   []byte(form.Encode()), Header: headers, Effect: httpclient.EffectMutation,
		})
	}

	response, err := postLogin()
	if err != nil {
		return loginFailure(err, "登录异常")
	}
	location := response.Header.Get("Location")
	firstBody := string(response.Body)
	definitiveFailure := credentialFailure.MatchString(firstBody)
	if !strings.Contains(location, "index_initMenu") && !definitiveFailure {
		select {
		case <-ctx.Done():
			return loginFailure(ctx.Err(), "登录异常")
		case <-time.After(time.Second):
		}
		response, err = postLogin()
		if err != nil {
			return loginFailure(err, "登录异常")
		}
		location = response.Header.Get("Location")
	}
	if strings.Contains(location, "index_initMenu") {
		return domain.LoginResponse{
			Success: true, Message: "登录成功",
			Data: domain.LoginData{Username: username},
		}
	}
	body := string(response.Body)
	if body == "" {
		body = firstBody
	}
	switch {
	case strings.Contains(body, "用户名或密码"):
		return domain.LoginResponse{Success: false, ErrorCode: domain.CodeInvalidCredentials, Message: "用户名或密码不正确"}
	case strings.Contains(body, "验证码"):
		return domain.LoginResponse{
			Success: false, ErrorCode: domain.CodeCaptchaRequired,
			Message: "账号需要图形验证码，请把浏览器 Cookie 粘贴到 USTS_COOKIES 后运行 usts login",
		}
	default:
		return domain.LoginResponse{
			Success: false, ErrorCode: domain.CodeRemoteServer,
			Message: "登录未跳转到主菜单（多半是账号密码不正确）",
		}
	}
}

func encryptPassword(password, modulusBase64, exponentBase64 string) (string, error) {
	modulusBytes, err := base64.StdEncoding.DecodeString(modulusBase64)
	if err != nil {
		return "", err
	}
	exponentBytes, err := base64.StdEncoding.DecodeString(exponentBase64)
	if err != nil {
		return "", err
	}
	modulus := new(big.Int).SetBytes(modulusBytes)
	exponent := new(big.Int).SetBytes(exponentBytes)
	if !exponent.IsInt64() {
		return "", fmt.Errorf("RSA exponent is too large")
	}
	publicKey := &rsa.PublicKey{N: modulus, E: int(exponent.Int64())}
	encrypted, err := rsa.EncryptPKCS1v15(rand.Reader, publicKey, []byte(password))
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(encrypted), nil
}

func loginFailure(err error, prefix string) domain.LoginResponse {
	code := domain.CodeUnknown
	if app, ok := domain.AsAppError(err); ok {
		code = app.Code
	}
	return domain.LoginResponse{
		Success: false, ErrorCode: code,
		Message: prefix + "：" + domain.ErrorMessage(err, "未知错误"),
	}
}
