package jwgl

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/mico-v/usts-cli/internal/infrastructure/httpclient"
)

func TestQueryNotificationsUsesGridPaginationAndKeepsUnknownReadState(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/jwglxt/xtgl/index_cxDbsy.html" {
			t.Errorf("unexpected path: %s", request.URL.Path)
			return
		}
		if err := request.ParseForm(); err != nil {
			t.Error(err)
			return
		}
		if request.Form.Get("queryModel.showCount") != "5000" ||
			request.Form.Get("queryModel.sortName") != "cjsj" {
			t.Errorf("unexpected grid form: %#v", request.Form)
			return
		}
		_ = json.NewEncoder(writer).Encode(map[string]any{
			"items": []map[string]any{{
				"xxbt": "通知", "xxnr": "内容", "cjsj": "2026-11-12", "clzt": "1",
				"jsmc": "学生", "ljdz": "/notice",
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
	items, err := client.QueryNotifications(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 || items[0].Status == nil || *items[0].Status != "1" {
		t.Fatalf("unexpected items: %#v", items)
	}
	if items[0].Unread != nil {
		t.Fatalf("unknown read state must remain nil: %#v", items[0].Unread)
	}
}
