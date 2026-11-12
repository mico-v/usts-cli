package jwgl

import (
	"bytes"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/mico-v/usts-cli/internal/domain"
	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

type Verdict string

const (
	VerdictOK               Verdict = "ok"
	VerdictSessionExpired   Verdict = "session-expired"
	VerdictAmbiguous        Verdict = "ambiguous"
	VerdictRateLimited      Verdict = "rate-limited"
	VerdictPermissionDenied Verdict = "permission-denied"
	VerdictServerError      Verdict = "server-error"
)

var (
	loginPathPattern = regexp.MustCompile(`(?i)login_slogin|/xtgl/login`)
	sessionMarker    = regexp.MustCompile(`用户登录|请先登录|登录超时|login_slogin`)
)

func ClassifyResponse(response *httpclient.Response) Verdict {
	if response == nil {
		return VerdictAmbiguous
	}
	if response.StatusCode == 901 {
		return VerdictSessionExpired
	}
	if response.StatusCode >= 300 && response.StatusCode < 400 {
		location := response.Header.Get("Location")
		if location != "" && loginPathPattern.MatchString(location) {
			return VerdictSessionExpired
		}
		return VerdictAmbiguous
	}
	if response.StatusCode == http.StatusTooManyRequests {
		return VerdictRateLimited
	}
	if response.StatusCode == http.StatusUnauthorized {
		return VerdictAmbiguous
	}
	if response.StatusCode >= 400 {
		return VerdictServerError
	}
	if bytes.Contains(response.Body, []byte("没有访问权限")) {
		return VerdictPermissionDenied
	}
	if looksLikeHTML(response) && sessionMarker.Match(response.Body) {
		return VerdictSessionExpired
	}
	return VerdictOK
}

func AmbiguousRejection(operation string, cause any) error {
	return &domain.AppError{
		Code:      domain.CodeProtocolChanged,
		Message:   fmt.Sprintf("%s失败：服务端未返回预期内容（会话可能已失效，或接口被拒/改版）", operation),
		Ambiguous: true,
	}
}

func AssertReadableResponse(response *httpclient.Response, operation string) error {
	switch ClassifyResponse(response) {
	case VerdictOK:
		return nil
	case VerdictSessionExpired:
		return domain.NewError(domain.CodeSessionExpired, "会话已失效，请重新运行 usts login")
	case VerdictAmbiguous:
		return AmbiguousRejection(operation, string(response.Body))
	case VerdictRateLimited:
		return &domain.AppError{Code: domain.CodeRateLimited, Message: "请求过于频繁，请等待 30~60 秒后重试", Retryable: true}
	case VerdictPermissionDenied:
		return domain.NewError(domain.CodePermissionDenied, "当前账号无权限访问该功能")
	default:
		return &domain.AppError{
			Code: domain.CodeRemoteServer, Message: fmt.Sprintf("%s失败：HTTP %d", operation, response.StatusCode),
			Retryable: response.StatusCode >= 500,
		}
	}
}

func AssertPDFResponse(response *httpclient.Response) error {
	verdict := ClassifyResponse(&httpclient.Response{
		StatusCode: response.StatusCode,
		Header:     response.Header,
	})
	switch verdict {
	case VerdictSessionExpired:
		return domain.NewError(domain.CodeSessionExpired, "会话已失效，请重新运行 usts login")
	case VerdictAmbiguous:
		return domain.NewError(domain.CodeProtocolChanged, fmt.Sprintf("PDF 下载失败：HTTP %d", response.StatusCode))
	case VerdictRateLimited:
		return &domain.AppError{Code: domain.CodeRateLimited, Message: "请求过于频繁，请等待 30~60 秒后重试", Retryable: true}
	case VerdictServerError:
		return &domain.AppError{
			Code: domain.CodeRemoteServer, Message: fmt.Sprintf("PDF 下载失败：HTTP %d", response.StatusCode),
			Retryable: response.StatusCode >= 500,
		}
	}
	if bytes.HasPrefix(response.Body, []byte("%PDF-")) {
		tail := response.Body
		if len(tail) > 4096 {
			tail = tail[len(tail)-4096:]
		}
		if !bytes.Contains(tail, []byte("%%EOF")) {
			return domain.NewError(domain.CodeProtocolChanged, "服务端返回的 PDF 文件不完整")
		}
		return nil
	}
	prefix := response.Body
	if len(prefix) > 4096 {
		prefix = prefix[:4096]
	}
	if sessionMarker.Match(prefix) {
		return domain.NewError(domain.CodeSessionExpired, "会话已失效，请重新运行 usts login")
	}
	return domain.NewError(domain.CodeProtocolChanged, "服务端未返回有效 PDF 文件")
}

func HeaderValue(header http.Header, name string) string {
	return strings.TrimSpace(header.Get(name))
}

func looksLikeHTML(response *httpclient.Response) bool {
	contentType := strings.ToLower(response.Header.Get("Content-Type"))
	if strings.Contains(contentType, "text/html") || strings.Contains(contentType, "application/xhtml") {
		return true
	}
	body := bytes.TrimSpace(response.Body)
	return len(body) > 0 && body[0] == '<'
}
