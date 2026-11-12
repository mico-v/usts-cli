package jwgl

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"

	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func TestQueryProfileSectionUsesGETGridContract(t *testing.T) {
	var selectedRequests int
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/jwglxt/xsxxxggl/xsxxwh_cxCkDgxsxx.html":
			if request.Method != http.MethodGet {
				t.Errorf("rich profile method = %s, want GET", request.Method)
			}
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"xh": "2026T000001", "xh_id": "internal-1", "xm": "测试学生",
			})
		case "/jwglxt/xsxxxggl/xsxxwh_cxXsxkxx.html":
			selectedRequests++
			if request.Method != http.MethodGet {
				t.Errorf("profile section method = %s, want GET", request.Method)
			}
			if request.URL.Query().Get("gnmkdm") != "N100801" ||
				request.URL.Query().Get("xh_id") != "internal-1" ||
				request.URL.Query().Get("fromXh_id") != "" {
				t.Errorf("unexpected profile section query: %s", request.URL.RawQuery)
			}
			if request.URL.Query().Get("queryModel.showCount") != "5000" ||
				request.URL.Query().Get("queryModel.currentPage") != "1" {
				t.Errorf("missing grid query: %s", request.URL.RawQuery)
			}
			if request.URL.Query().Get("page") != "" || request.URL.Query().Get("rows") != "" {
				t.Errorf("legacy POST paging fields must not be sent: %s", request.URL.RawQuery)
			}
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"items": []map[string]any{
					{"xnmc": "2026-2027", "xqmmc": "第一学期", "kcmc": "课程一", "xf": "2"},
					{"xnmc": "2026-2027", "xqmmc": "第一学期", "kcmc": "课程二", "xf": "3"},
				},
				"totalCount": 2,
			})
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	client := testProfileSectionClient(t, server.URL)
	result, err := client.QueryProfileSection(
		context.Background(), ProfileSectionSelectedCourses, "2026", "3",
	)
	if err != nil {
		t.Fatal(err)
	}
	if selectedRequests != 1 || len(result.Rows) != 2 {
		t.Fatalf("selected requests = %d, rows = %d", selectedRequests, len(result.Rows))
	}
	if result.Rows[0][2] != "课程一" || result.Rows[1][2] != "课程二" {
		t.Fatalf("unexpected mapped rows: %#v", result.Rows)
	}
}

func TestQueryProfileSectionAcceptsEmptyTotalResultEnvelope(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/jwglxt/xsxxxggl/xsxxwh_cxCkDgxsxx.html":
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"xh": "2026T000001", "xh_id": "internal-1", "xm": "测试学生",
			})
		case "/jwglxt/xsxxxggl/xsxxwh_cxXsxnjd.html":
			writer.WriteHeader(910)
			_, _ = writer.Write([]byte(`{"queryModel":{},"totalResult":"0"}`))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	client := testProfileSectionClient(t, server.URL)
	result, err := client.QueryProfileSection(
		context.Background(), ProfileSectionAcademicYears, "2026", "3",
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Rows) != 0 {
		t.Fatalf("rows = %#v, want empty", result.Rows)
	}
}

func TestQueryProfileSectionClassesUsesGETArrayContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		switch request.URL.Path {
		case "/jwglxt/xsxxxggl/xsxxwh_cxCkDgxsxx.html":
			_ = json.NewEncoder(writer).Encode(map[string]any{
				"xh": "2026T000001", "xh_id": "internal-1", "xm": "测试学生",
			})
		case "/jwglxt/xsxxxggl/xsxxwh_cxBjxxList.html":
			if request.Method != http.MethodGet {
				t.Errorf("classes method = %s, want GET", request.Method)
			}
			query, err := url.ParseQuery(request.URL.RawQuery)
			if err != nil {
				t.Error(err)
			}
			if query.Get("xh_id") != "internal-1" || query.Get("fromXh_id") != "" {
				t.Errorf("unexpected classes query: %s", request.URL.RawQuery)
			}
			_ = json.NewEncoder(writer).Encode([]map[string]any{
				{"bh_id": "class-1", "bj": "测试班级"},
			})
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	client := testProfileSectionClient(t, server.URL)
	result, err := client.QueryProfileSection(
		context.Background(), ProfileSectionClasses, "2026", "3",
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Rows) != 1 || result.Rows[0][0] != "class-1" || result.Rows[0][1] != "测试班级" {
		t.Fatalf("unexpected rows: %#v", result.Rows)
	}
}

func testProfileSectionClient(t *testing.T, serverURL string) *Client {
	t.Helper()
	client, err := NewClient(serverURL+"/jwglxt", ClientOptions{
		Launch: map[string]string{
			"USTS_ALLOW_CUSTOM_HOST":   "1",
			"USTS_ALLOW_INSECURE_HTTP": "1",
			"USTS_STATE_DIR":           t.TempDir(),
		},
		OnRetry: func(httpclient.RetryNotice) {},
	})
	if err != nil {
		t.Fatal(err)
	}
	return client
}
