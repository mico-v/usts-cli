package httpclient

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/mico-v/usts-cli/internal/config"
	"github.com/mico-v/usts-cli/internal/domain"
)

const (
	DefaultRequestTimeout  = 15 * time.Second
	DownloadRequestTimeout = 45 * time.Second
	FormContentType        = "application/x-www-form-urlencoded;charset=UTF-8"
	maxResponseBytes       = 32 * 1024 * 1024
	userAgent              = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

type Effect string

const (
	EffectRead     Effect = "read"
	EffectAuth     Effect = "auth"
	EffectDownload Effect = "download"
	EffectMutation Effect = "mutation"
)

type RetryNotice struct {
	Attempt     int
	MaxAttempts int
	Kind        string
	Reason      string
	Delay       time.Duration
}

type TransportOptions struct {
	Launch           map[string]string
	OnRetry          func(RetryNotice)
	OnCookiesChanged func()
	Sleep            func(context.Context, time.Duration) error
	Random           func() float64
}

type Transport struct {
	baseURL          string
	cookieURL        string
	httpClient       *http.Client
	jar              *CookieJar
	onRetry          func(RetryNotice)
	onCookiesChanged func()
	sleep            func(context.Context, time.Duration) error
	random           func() float64
}

type Request struct {
	Method  string
	Target  string
	Query   url.Values
	Body    []byte
	Header  http.Header
	Effect  Effect
	Timeout time.Duration
}

type Response struct {
	StatusCode int
	Header     http.Header
	Body       []byte
}

func NewTransport(baseURL string, options TransportOptions) (*Transport, error) {
	normalized, err := config.NormalizeBaseURL(baseURL, options.Launch)
	if err != nil {
		return nil, err
	}
	sleep := options.Sleep
	if sleep == nil {
		sleep = sleepContext
	}
	random := options.Random
	if random == nil {
		random = rand.Float64
	}
	transport := &Transport{
		baseURL: normalized, cookieURL: strings.TrimRight(normalized, "/") + "/",
		httpClient: &http.Client{
			CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
				return http.ErrUseLastResponse
			},
			Transport: &http.Transport{
				Proxy:               http.ProxyFromEnvironment,
				MaxIdleConns:        2,
				MaxIdleConnsPerHost: 2,
				MaxConnsPerHost:     2,
				IdleConnTimeout:     90 * time.Second,
				TLSHandshakeTimeout: 10 * time.Second,
			},
		},
		jar:              NewCookieJar(strings.TrimRight(normalized, "/") + "/"),
		onRetry:          options.OnRetry,
		onCookiesChanged: options.OnCookiesChanged,
		sleep:            sleep,
		random:           random,
	}
	return transport, nil
}

func (t *Transport) BaseURL() string { return t.baseURL }

func (t *Transport) CookieCount() int { return t.jar.Size() }

func (t *Transport) ImportCookies(raw string) {
	t.jar.ImportCookieHeader(raw, t.cookieURL)
}

func (t *Transport) ClearCookies() {
	t.jar.Clear()
}

func (t *Transport) SerializeCookies() []StoredCookie {
	return t.jar.Serialize()
}

func (t *Transport) RestoreCookies(raw []byte) {
	t.jar.Clear()
	t.jar.Restore(raw)
}

func (t *Transport) CookieHeader(target string) string {
	resolved := t.resolveURL(target)
	return t.jar.Header(resolved)
}

func (t *Transport) FormHeaders(referer string) http.Header {
	headers := make(http.Header)
	headers.Set("Referer", referer)
	headers.Set("Content-Type", FormContentType)
	headers.Set("X-Requested-With", "XMLHttpRequest")
	return headers
}

func (t *Transport) Get(ctx context.Context, target string, effect Effect) (*Response, error) {
	timeout := DefaultRequestTimeout
	if effect == EffectDownload {
		timeout = DownloadRequestTimeout
	}
	return t.Do(ctx, Request{Method: http.MethodGet, Target: target, Effect: effect, Timeout: timeout})
}

func (t *Transport) PostForm(ctx context.Context, target string, form url.Values, referer string, effect Effect) (*Response, error) {
	timeout := DefaultRequestTimeout
	if effect == EffectDownload {
		timeout = DownloadRequestTimeout
	}
	return t.Do(ctx, Request{
		Method: http.MethodPost, Target: target, Body: []byte(form.Encode()),
		Header: t.FormHeaders(referer), Effect: effect, Timeout: timeout,
	})
}

func (t *Transport) Do(ctx context.Context, request Request) (*Response, error) {
	method := request.Method
	if method == "" {
		method = http.MethodGet
	}
	effect := request.Effect
	if effect == "" {
		effect = EffectRead
	}
	policy := retryPolicy(effect)
	timeout := request.Timeout
	if timeout <= 0 {
		timeout = DefaultRequestTimeout
	}
	target := t.resolveURL(request.Target)
	if parsed, err := url.Parse(request.Target); err == nil && parsed.IsAbs() {
		target, err = config.AssertSameOrigin(request.Target, t.baseURL)
		if err != nil {
			return nil, err
		}
	}
	if request.Query != nil {
		parsed, err := url.Parse(target)
		if err != nil {
			return nil, domain.WrapError(domain.CodeConfiguration, "请求地址无效", err)
		}
		query := parsed.Query()
		for key, values := range request.Query {
			for _, value := range values {
				query.Add(key, value)
			}
		}
		parsed.RawQuery = query.Encode()
		target = parsed.String()
	}

	for attempt := 1; ; attempt++ {
		response, err := t.requestOnce(ctx, method, target, request, timeout)
		if err == nil {
			return response, nil
		}
		if _, ok := domain.AsAppError(err); ok {
			return nil, err
		}
		kind, reason := classifyFailure(err)
		if kind == "fatal" {
			return nil, toTransportError(kind, reason, err)
		}
		retryAllowed := kind == "connection" || policy.retryTimeouts
		if !retryAllowed || attempt >= policy.attempts {
			return nil, toTransportError(kind, reason, err)
		}
		delay := retryDelay(kind, attempt, t.random())
		if t.onRetry != nil {
			t.onRetry(RetryNotice{
				Attempt: attempt + 1, MaxAttempts: policy.attempts,
				Kind: kind, Reason: reason, Delay: delay,
			})
		}
		if err := t.sleep(ctx, delay); err != nil {
			return nil, domain.WrapError(domain.CodeRequestTimeout, "请求超时，请稍后重试", err)
		}
	}
}

func (t *Transport) GetFollowingSameOrigin(ctx context.Context, target string, effect Effect) (*Response, error) {
	current := target
	for hop := 0; hop <= 3; hop++ {
		response, err := t.Do(ctx, Request{
			Method: http.MethodGet, Target: current, Effect: effect, Timeout: DownloadRequestTimeout,
		})
		if err != nil {
			return nil, err
		}
		if response.StatusCode < 300 || response.StatusCode >= 400 {
			return response, nil
		}
		location := response.Header.Get("Location")
		if location == "" {
			return response, nil
		}
		next, err := config.AssertSameOrigin(location, current)
		if err != nil {
			return nil, err
		}
		current = next
	}
	return nil, domain.NewError(domain.CodeProtocolChanged, "下载地址重定向次数过多")
}

func (t *Transport) requestOnce(
	ctx context.Context,
	method, target string,
	request Request,
	timeout time.Duration,
) (*Response, error) {
	requestCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	var body io.Reader
	if request.Body != nil {
		body = bytes.NewReader(request.Body)
	}
	httpRequest, err := http.NewRequestWithContext(requestCtx, method, target, body)
	if err != nil {
		return nil, err
	}
	httpRequest.Header.Set("User-Agent", userAgent)
	if cookieHeader := t.jar.Header(target); cookieHeader != "" {
		httpRequest.Header.Set("Cookie", cookieHeader)
	}
	for key, values := range request.Header {
		for _, value := range values {
			if strings.EqualFold(key, "Cookie") {
				if value != "" {
					httpRequest.Header.Set(key, value)
				}
				continue
			}
			httpRequest.Header.Add(key, value)
		}
	}
	response, err := t.httpClient.Do(httpRequest)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if t.storeCookies(response) && t.onCookiesChanged != nil {
		t.onCookiesChanged()
	}
	data, err := io.ReadAll(io.LimitReader(response.Body, maxResponseBytes+1))
	if err != nil {
		return nil, err
	}
	if len(data) > maxResponseBytes {
		return nil, domain.NewError(domain.CodeProtocolChanged, "服务端响应超过 32 MiB 上限")
	}
	return &Response{StatusCode: response.StatusCode, Header: response.Header.Clone(), Body: data}, nil
}

func (t *Transport) storeCookies(response *http.Response) bool {
	changed := false
	for _, cookie := range response.Cookies() {
		raw := cookie.String()
		changed = t.jar.SetCookie(raw, response.Request.URL.String()) || changed
	}
	return changed
}

func (t *Transport) resolveURL(target string) string {
	if parsed, err := url.Parse(target); err == nil && parsed.IsAbs() {
		return target
	}
	return strings.TrimRight(t.baseURL, "/") + "/" + strings.TrimLeft(target, "/")
}

type retryPolicyValue struct {
	attempts      int
	retryTimeouts bool
}

func retryPolicy(effect Effect) retryPolicyValue {
	switch effect {
	case EffectAuth:
		return retryPolicyValue{attempts: 3, retryTimeouts: false}
	case EffectDownload:
		return retryPolicyValue{attempts: 2, retryTimeouts: true}
	case EffectMutation:
		return retryPolicyValue{attempts: 1, retryTimeouts: false}
	default:
		return retryPolicyValue{attempts: 3, retryTimeouts: true}
	}
}

func classifyFailure(err error) (string, string) {
	if err == nil {
		return "fatal", ""
	}
	if errors.Is(err, context.Canceled) {
		return "fatal", err.Error()
	}
	if errors.Is(err, context.DeadlineExceeded) {
		return "timeout", err.Error()
	}
	var netError net.Error
	if errors.As(err, &netError) && netError.Timeout() {
		return "timeout", err.Error()
	}
	text := strings.ToLower(err.Error())
	if strings.Contains(text, "timeout") || strings.Contains(text, "timed out") {
		return "timeout", err.Error()
	}
	for _, marker := range []string{
		"connection reset", "connection refused", "broken pipe", "eof",
		"server closed idle connection", "socket hang up", "tls handshake",
	} {
		if strings.Contains(text, marker) {
			return "connection", err.Error()
		}
	}
	return "fatal", err.Error()
}

func toTransportError(kind, reason string, cause error) error {
	if kind == "timeout" {
		return &domain.AppError{Code: domain.CodeRequestTimeout, Message: "请求超时，请稍后重试", Retryable: true, Cause: cause}
	}
	return &domain.AppError{
		Code: domain.CodeNetworkUnavailable, Message: "网络请求失败：" + reason,
		Retryable: kind == "connection", Cause: cause,
	}
}

func retryDelay(kind string, attempt int, random float64) time.Duration {
	if kind == "timeout" {
		return time.Duration(250+int(250*random)) * time.Millisecond
	}
	base := 3000 * (1 << attempt)
	if base > 12000 {
		base = 12000
	}
	jittered := float64(base) * (0.5 + random*0.5)
	if jittered < 500 {
		jittered = 500
	}
	return time.Duration(jittered) * time.Millisecond
}

func sleepContext(ctx context.Context, delay time.Duration) error {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func (t *Transport) String() string {
	return fmt.Sprintf("Transport(%s)", t.baseURL)
}
