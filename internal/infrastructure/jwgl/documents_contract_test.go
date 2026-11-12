package jwgl

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func testPDFClient(t *testing.T, handler http.Handler) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	client, err := NewClient(server.URL+"/jwglxt", ClientOptions{
		Launch: map[string]string{
			"USTS_ALLOW_CUSTOM_HOST": "1", "USTS_ALLOW_INSECURE_HTTP": "1",
			"USTS_STATE_DIR": t.TempDir(),
		},
		OnRetry: func(httpclient.RetryNotice) {},
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}

func TestDownloadSchedulePDFChain(t *testing.T) {
	pdf := []byte("%PDF-1.7\n%%EOF")
	client := testPDFClient(t, http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/jwglxt/kbdy/bjkbdy_cxXnxqsfkz.html":
			_, _ = writer.Write([]byte("ok"))
		case "/jwglxt/kbcx/xskbcx_cxXsShcPdf.html":
			_, _ = writer.Write(pdf)
		default:
			http.NotFound(writer, request)
		}
	}))
	got, err := client.DownloadSchedulePDF(context.Background(), "2026", "3", "导出")
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, pdf) {
		t.Fatalf("PDF bytes differ")
	}
}

func TestDownloadAcademiaPDFChain(t *testing.T) {
	pdf := []byte("%PDF-1.7\n%%EOF")
	var serverURL string
	client := testPDFClient(t, http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/jwglxt/bysxxcx/xscjzbdy_dyList.html":
			_, _ = writer.Write([]byte(`#成功"` + serverURL + `/jwglxt/files/transcript.pdf"`))
		case "/jwglxt/files/transcript.pdf":
			_, _ = writer.Write(pdf)
		default:
			if request.URL.Path == "/jwglxt/bysxxcx/xscjzbdy_dyXscjzbView.html" ||
				request.URL.Path == "/jwglxt/bysxxcx/xscjzbdy_dyCjdyszxView.html" ||
				request.URL.Path == "/jwglxt/xtgl/bysxxcx/xscjzbdy_cxXsCount.html" ||
				request.URL.Path == "/jwglxt/bysxxcx/xscjzbdy_cxGswjlx.html" ||
				request.URL.Path == "/jwglxt/common/common_cxJwxtxx.html" ||
				request.URL.Path == "/jwglxt/xtgl/progress_cxProgressStatus.html" {
				_, _ = writer.Write([]byte("ok"))
				return
			}
			http.NotFound(writer, request)
		}
	}))
	serverURL = strings.TrimSuffix(client.transport.BaseURL(), "/jwglxt")
	got, err := client.DownloadAcademiaPDF(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, pdf) {
		t.Fatalf("PDF bytes differ")
	}
}
