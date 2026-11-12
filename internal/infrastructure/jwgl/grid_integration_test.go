package jwgl

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"

	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func TestClientQueryScoresHandlesTextHTMLJSONAndGridContract(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/jwglxt/cjcx/cjcx_cxXsgrcj.html" {
			t.Errorf("unexpected path: %s", request.URL.Path)
			return
		}
		if request.Method != http.MethodPost {
			t.Errorf("unexpected method: %s", request.Method)
			return
		}
		if err := request.ParseForm(); err != nil {
			t.Error(err)
			return
		}
		if request.Form.Get("queryModel.showCount") != "5000" || request.Form.Get("page") != "1" {
			t.Errorf("missing double pagination fields: %#v", request.Form)
			return
		}
		if request.Header.Get("X-Requested-With") != "XMLHttpRequest" {
			t.Error("missing X-Requested-With")
			return
		}
		writer.Header().Set("Content-Type", "text/html")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"items": []map[string]any{{
				"kcmc": "高等数学", "kch": "MATH01", "kcxzmc": "必修",
				"xf": "4", "cj": "92", "jd": "4.2", "jsxm": "李老师", "jgmc": "数理学院",
			}},
			"totalCount": 1,
		})
	}))
	defer server.Close()

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
	items, err := client.QueryScores(context.Background(), "2025", "3", nil)
	if err != nil {
		t.Fatalf("QueryScores(): %v", err)
	}
	if len(items) != 1 || items[0].CourseName != "高等数学" || items[0].Credit == nil || *items[0].Credit != 4 {
		t.Fatalf("unexpected items: %#v", items)
	}
}

func TestPostGridContinuesWhenServerPageIsSmallerThanRequested(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if err := request.ParseForm(); err != nil {
			t.Error(err)
			return
		}
		page, _ := strconv.Atoi(request.Form.Get("queryModel.currentPage"))
		start := (page - 1) * 100
		items := make([]map[string]any, 0, 100)
		for index := start; index < start+100; index++ {
			items = append(items, map[string]any{"kcmc": "课程" + strconv.Itoa(index), "kch": strconv.Itoa(index)})
		}
		_ = json.NewEncoder(writer).Encode(map[string]any{"items": items, "totalCount": 200})
	}))
	defer server.Close()

	transport, err := httpclient.NewTransport(server.URL+"/jwglxt", httpclient.TransportOptions{
		Launch: map[string]string{
			"USTS_ALLOW_CUSTOM_HOST": "1", "USTS_ALLOW_INSECURE_HTTP": "1",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	records, err := PostGrid(context.Background(), transport, "/test/grid.html", "N1", nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(records) != 200 {
		t.Fatalf("records = %d, want 200", len(records))
	}
}

func TestClientQueryScheduleMergesFixedAndPracticeLists(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/jwglxt/kbcx/xskbcx_cxXsgrkb.html" {
			t.Errorf("unexpected path: %s", request.URL.Path)
			return
		}
		writer.Header().Set("Content-Type", "text/html")
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"xsxx": map[string]any{"XH": "2025T000001"},
			"kbList": []map[string]any{{
				"kcmc": "高等数学", "jxb_id": "J1", "xqj": "1", "jc": "1-2", "qsjsz": "1-16周",
			}},
			"sjkList": []map[string]any{{
				"kcmc": "工程实践", "jxb_id": "J2", "qsjsz": "17周",
			}},
		})
	}))
	defer server.Close()

	client, err := NewClient(server.URL+"/jwglxt", ClientOptions{
		Launch: map[string]string{
			"USTS_ALLOW_CUSTOM_HOST": "1", "USTS_ALLOW_INSECURE_HTTP": "1",
			"USTS_STATE_DIR": t.TempDir(),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	items, err := client.QuerySchedule(context.Background(), "2026", "3")
	if err != nil {
		t.Fatalf("QuerySchedule(): %v", err)
	}
	if len(items) != 2 {
		t.Fatalf("items = %#v", items)
	}
	if items[0].CourseName != "高等数学" || items[1].CourseName != "工程实践" {
		t.Fatalf("unexpected items: %#v", items)
	}
}
