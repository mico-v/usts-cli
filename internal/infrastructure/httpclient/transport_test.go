package httpclient

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
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

func TestGetFollowingSameOriginResolvesRelativeLocationFromCurrentFile(t *testing.T) {
	var requested []string
	var requestedMu sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestedMu.Lock()
		requested = append(requested, request.URL.Path)
		requestedMu.Unlock()
		switch request.URL.Path {
		case "/jwglxt/a/file.pdf":
			writer.Header().Set("Location", "next.pdf")
			writer.WriteHeader(http.StatusFound)
		case "/jwglxt/a/next.pdf":
			_, _ = writer.Write([]byte("ok"))
		default:
			http.NotFound(writer, request)
		}
	}))
	defer server.Close()

	transport, err := NewTransport(server.URL+"/jwglxt", TransportOptions{
		Launch: map[string]string{
			"USTS_ALLOW_CUSTOM_HOST": "1", "USTS_ALLOW_INSECURE_HTTP": "1",
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	response, err := transport.GetFollowingSameOrigin(
		context.Background(), server.URL+"/jwglxt/a/file.pdf", EffectDownload,
	)
	if err != nil {
		t.Fatal(err)
	}
	if string(response.Body) != "ok" {
		t.Fatalf("body = %q", response.Body)
	}
	requestedMu.Lock()
	defer requestedMu.Unlock()
	if len(requested) != 2 || requested[1] != "/jwglxt/a/next.pdf" {
		t.Fatalf("unexpected requests: %#v", requested)
	}
}
