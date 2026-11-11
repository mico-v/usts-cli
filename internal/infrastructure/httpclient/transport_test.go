package httpclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestTransportRetriesConnectionReset(t *testing.T) {
	var attempts atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		if attempts.Add(1) == 1 {
			hijacker, ok := writer.(http.Hijacker)
			if !ok {
				t.Error("server does not support hijacking")
				return
			}
			connection, _, err := hijacker.Hijack()
			if err != nil {
				t.Error(err)
				return
			}
			_ = connection.Close()
			return
		}
		_, _ = writer.Write([]byte("ok"))
	}))
	defer server.Close()

	transport, err := NewTransport(server.URL+"/jwglxt", TransportOptions{
		Launch: map[string]string{
			"USTS_ALLOW_CUSTOM_HOST": "1", "USTS_ALLOW_INSECURE_HTTP": "1",
		},
		Sleep:  func(context.Context, time.Duration) error { return nil },
		Random: func() float64 { return 0.5 },
	})
	if err != nil {
		t.Fatal(err)
	}
	response, err := transport.Get(context.Background(), "/test", EffectRead)
	if err != nil {
		t.Fatalf("Get() error = %v", err)
	}
	if string(response.Body) != "ok" {
		t.Fatalf("body = %q", response.Body)
	}
	if attempts.Load() != 2 {
		t.Fatalf("attempts = %d, want 2", attempts.Load())
	}
}
