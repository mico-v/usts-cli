package jwgl

import (
	"net/http"
	"testing"

	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func TestClassifyResponse(t *testing.T) {
	tests := []struct {
		name     string
		response *httpclient.Response
		want     Verdict
	}{
		{"ok", &httpclient.Response{StatusCode: 200, Body: []byte(`{"items":[]}`)}, VerdictOK},
		{"901", &httpclient.Response{StatusCode: 901}, VerdictSessionExpired},
		{"login redirect", &httpclient.Response{StatusCode: 302, Header: http.Header{"Location": []string{"/xtgl/login_slogin.html"}}}, VerdictSessionExpired},
		{"ambiguous redirect", &httpclient.Response{StatusCode: 302, Header: http.Header{"Location": []string{"/download/a.pdf"}}}, VerdictAmbiguous},
		{"rate limited", &httpclient.Response{StatusCode: 429}, VerdictRateLimited},
		{"server error", &httpclient.Response{StatusCode: 503}, VerdictServerError},
		{"permission denied", &httpclient.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"text/plain"}}, Body: []byte("没有访问权限!")}, VerdictPermissionDenied},
		{"login body", &httpclient.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"text/html"}}, Body: []byte(`请先登录`)}, VerdictSessionExpired},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			if got := ClassifyResponse(test.response); got != test.want {
				t.Fatalf("ClassifyResponse() = %s, want %s", got, test.want)
			}
		})
	}
}

func TestAssertPDFResponse(t *testing.T) {
	valid := &httpclient.Response{StatusCode: 200, Body: []byte("%PDF-1.7 test\n%%EOF")}
	if err := AssertPDFResponse(valid); err != nil {
		t.Fatalf("valid PDF rejected: %v", err)
	}
	invalid := &httpclient.Response{StatusCode: 200, Body: []byte("<html>error</html>")}
	if err := AssertPDFResponse(invalid); err == nil {
		t.Fatal("expected non-PDF response to fail")
	}
}
